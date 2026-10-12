import { profileFor, profileRevision, loadProfile, proofPixels, restoreProfiles, saveProfile, removeProfile } from './icc-proof.js';
import { PRINTERS, printerById, assessPrinterMedia } from './printers.js';
import { pdfSheetGeometry } from './pdf-geometry.js';
import { ASSET_KEYS, assetLabel, normalizeEndSpreadColor } from './layout.js';
import { backCoverUsesImage, assets, drawPhoto } from './media.js';
import { drawBackCover, backCoverStatus } from './back-cover.js';

const PREVIEW_EDGE = 512;
const PERCENT = 100;
const CHANNEL_MAX = 255;
const HISTOGRAM_BINS = 2048;
const LUMA = Object.freeze([0.2126, 0.7152, 0.0722]);
const PAPER_KEYS = ['coated', 'uncoated'];
// Generic, editable viewing assumptions, deliberately identical across print targets.
const PAPER_DEFAULTS = Object.freeze({
  coated: Object.freeze({ white: 94, black: 3, chroma: 10 }),
  uncoated: Object.freeze({ white: 88, black: 6, chroma: 20 })
});
export const PRINT_COLOR_DEFAULTS = Object.freeze({ target: 'epson', paper: 'coated', artwork: 'current', preview3d: false, compare: true, assumptions: PAPER_DEFAULTS });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const bounded = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
const decode = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const encode = value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
const LINEAR_CHANNELS = Float64Array.from({ length: CHANNEL_MAX + 1 }, (_, index) => decode(index / CHANNEL_MAX));

/** Restore bounded settings without trusting persisted target names or numeric assumptions. */
export function normalizePrintColor(saved) {
  const assumptions = Object.fromEntries(PAPER_KEYS.map(paper => {
    const defaults = PAPER_DEFAULTS[paper], values = saved?.assumptions?.[paper];
    return [paper, { white: bounded(values?.white, defaults.white, 60, 100), black: bounded(values?.black, defaults.black, 0, 20), chroma: bounded(values?.chroma, defaults.chroma, 0, 60) }];
  }));
  return { mode: saved?.mode === 'illustrative' ? 'illustrative' : 'icc', target: printerById(saved?.target).id, paper: saved?.paper === 'uncoated' ? 'uncoated' : 'coated',
    artwork: ASSET_KEYS.includes(saved?.artwork) ? saved.artwork : 'current', preview3d: saved?.preview3d === true, compare: saved?.compare !== false, assumptions };
}

/** Describe workflow recommendations separately from the unchanged RGB PDF output. */
export function printColorSummary(state) {
  const settings = normalizePrintColor(state.printColor);
  const printer=printerById(settings.target),commercial=printer.kind==='press', profile=settings.mode==='icc'&&profileFor(settings.target,settings.paper);
  return { ...settings, printer:printer.label, media:assessPrinterMedia(printer,pdfSheetGeometry(state)), source:printer.source, deviceColorProfileAvailable:!!profile, profileName:profile?.name||null, simulationOnly: !profile, iccTransformApplied: !!profile, calibrated: false, pdfColorSpace: 'RGB',
    recommendedWorkflow: commercial ? 'Provider-approved color conversion / RIP workflow outside this tool' : 'RGB with exact printer/ink/paper ICC or driver-managed color, not both',
    referenceCondition: profile ? `${printer.label}; user-assigned ${profile.name}` : `${printer.label}; exact output ICC required`,
    model: settings.mode==='icc'&&!profile ? 'Unavailable: exact output profile required' : profile ? 'LittleCMS 2.16: assumed sRGB → printer profile → sRGB; relative colorimetric rendering, absolute colorimetric proof (paper white and ink black); preview only' : 'Decode assumed sRGB to linear RGB; Y=0.2126R+0.7152G+0.0722B; compress each channel toward Y; map black+(white-black)*channel; encode sRGB' };
}

/** Mutate only a preview raster using a neutral linear-light heuristic, never an ICC transform. */
export function simulatePaperPixels(imageData, assumptions) {
  const { data } = imageData, white = assumptions.white / PERCENT, black = assumptions.black / PERCENT;
  const chroma = assumptions.chroma / PERCENT, span = white - black;
  for (let index = 0; index < data.length; index += 4) {
    const red = LINEAR_CHANNELS[data[index]], green = LINEAR_CHANNELS[data[index + 1]], blue = LINEAR_CHANNELS[data[index + 2]];
    const luminance = LUMA[0] * red + LUMA[1] * green + LUMA[2] * blue;
    for (let channel = 0; channel < 3; channel++) {
      const value = channel === 0 ? red : channel === 1 ? green : blue;
      const compressed = luminance + (value - luminance) * (1 - chroma);
      data[index + channel] = Math.round(CHANNEL_MAX * encode(clamp(black + span * compressed, 0, 1)));
    }
  }
  return imageData;
}

/** Apply the shared estimate to a freshly painted 3D photo canvas, before measurement guides. */
export function applyPaperEstimate(context, state) {
  const settings = normalizePrintColor(state.printColor);
  if (!settings.preview3d) return;
  const pixels = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  const profile=profileFor(settings.target,settings.paper);
  if(settings.mode==='icc'){if(!profile)return;proofPixels(pixels,profile);}else simulatePaperPixels(pixels,settings.assumptions[settings.paper]);
  context.putImageData(pixels, 0, 0);
}

function luminanceMetrics(imageData) {
  const histogram = new Uint32Array(HISTOGRAM_BINS), count = imageData.data.length / 4;
  if (!count) return null;
  let sum = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const data = imageData.data;
    const value = LUMA[0] * LINEAR_CHANNELS[data[index]] + LUMA[1] * LINEAR_CHANNELS[data[index + 1]] + LUMA[2] * LINEAR_CHANNELS[data[index + 2]];
    sum += value; histogram[Math.round(value * (HISTOGRAM_BINS - 1))]++;
  }
  const percentile = fraction => {
    const threshold = Math.max(1, Math.ceil(count * fraction)); let cumulative = 0;
    for (let index = 0; index < histogram.length; index++) { cumulative += histogram[index]; if (cumulative >= threshold) return index / (HISTOGRAM_BINS - 1); }
    return 1;
  };
  return { mean: sum / count, contrast: percentile(0.95) - percentile(0.05) };
}
const metricText = metrics => `Mean Y ${(metrics.mean * PERCENT).toFixed(1)}% · P95–P5 span ${(metrics.contrast * PERCENT).toFixed(1)} pp`;
function deltaText(source, estimate) {
  const delta = (estimate.mean - source.mean) * PERCENT;
  const spanChange = source.contrast > 1 / (HISTOGRAM_BINS - 1) ? (estimate.contrast / source.contrast - 1) * PERCENT : null;
  const contrast = spanChange === null ? 'Tonal-span change undefined for a flat crop' : `${Math.abs(spanChange).toFixed(1)}% ${spanChange > 0 ? 'larger' : 'smaller'} tonal span`;
  return `Δ mean Y ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp · ${contrast}`;
}
function paperLabel(target, paper) {
  return printerById(target).kind==='inkjet' ? paper === 'coated' ? 'Glossy / satin inkjet paper' : 'Matte inkjet paper' : paper === 'coated' ? 'Coated stock' : 'Uncoated stock';
}
function sourceKey(state, settings) { return settings.artwork === 'current' ? state.previewClosed ? 'front-cover' : ['opening','closing'].includes(state.endSpread) ? state.endSpread : `month-${state.month}` : settings.artwork; }

/** Bind the Print map's unlit comparison to existing photo slots, with no second upload or export path. */
export function createPrintColorPanel(getState, onChange) {
  const byId = id => document.getElementById(id), controls = [];
  let signature = '', analysis = null;
  const listen = (id, type, handler) => { const node = byId(id); node.addEventListener(type, handler); controls.push(() => node.removeEventListener(type, handler)); };
  const commit = edit => { const settings = normalizePrintColor(getState().printColor); edit(settings); onChange(settings); };
  for (const [id, field] of [['print-color-mode', 'mode'], ['print-color-target', 'target'], ['print-color-paper', 'paper'], ['print-color-artwork', 'artwork']]) listen(id, 'change', () => commit(settings => { settings[field] = byId(id).value; }));
  for (const [id, field] of [['print-color-3d', 'preview3d'], ['print-color-compare', 'compare']]) listen(id, 'change', () => commit(settings => { settings[field] = byId(id).checked; }));
  for (const field of ['white', 'black', 'chroma']) listen(`print-color-${field}`, 'input', () => commit(settings => { settings.assumptions[settings.paper][field] = Number(byId(`print-color-${field}`).value); }));
  listen('print-color-reset', 'click', () => commit(settings => { settings.assumptions[settings.paper] = { ...PAPER_DEFAULTS[settings.paper] }; }));
  let disposed=false;
  restoreProfiles().then(()=>{if(!disposed){signature='';onChange(normalizePrintColor(getState().printColor));}}).catch(()=>{if(!disposed)byId('print-color-profile-status').textContent='Saved ICC profiles could not be restored. Import a profile to continue.';});
  listen('print-color-profile','change',async()=>{
    const input=byId('print-color-profile'),file=input.files?.[0];if(!file)return;
    const settings=normalizePrintColor(getState().printColor);
    try{
      if(file.size>16*1024*1024)throw new Error('ICC profiles must be smaller than 16 MB.');
      const entry=await loadProfile(settings.target,settings.paper,new Uint8Array(await file.arrayBuffer()),file.name);
      let saved=true;try{await saveProfile(settings.target,settings.paper,entry);}catch{saved=false;}
      signature='';onChange(normalizePrintColor(getState().printColor));
      byId('print-color-profile-status').textContent=`${entry.name} assigned to ${printerById(settings.target).label} / ${paperLabel(settings.target,settings.paper)}.${saved?' Saved in this browser.':' Available this session; browser storage failed.'}`;
    }catch(error){byId('print-color-profile-status').textContent=error.message;}
    input.value='';
  });
  listen('print-color-profile-remove','click',async()=>{
    const settings=normalizePrintColor(getState().printColor);removeProfile(settings.target,settings.paper);
    try{await saveProfile(settings.target,settings.paper,null);}catch{byId('print-color-profile-status').textContent='Removed this session; browser storage failed.';}
    signature='';onChange(settings);
  });
  const targetSelect=byId('print-color-target');targetSelect.replaceChildren();
  for(const group of [...new Set(PRINTERS.map(printer=>printer.group))]){
    const optgroup=document.createElement('optgroup');optgroup.label=group;
    for(const printer of PRINTERS.filter(item=>item.group===group)){const option=document.createElement('option');option.value=printer.id;option.textContent=printer.label;optgroup.append(option);}
    targetSelect.append(optgroup);
  }
  ASSET_KEYS.forEach(key => { const option = document.createElement('option'); option.value = key; option.textContent = assetLabel(key); byId('print-color-artwork').append(option); });
  const surfaces = [byId('print-color-source'), byId('print-color-estimate'), byId('print-color-alternate')];
  function render() {
    const state = getState(), settings = normalizePrintColor(state.printColor), key = sourceKey(state, settings), record = key==='back-cover'&&!backCoverUsesImage(state)?null:assets.get(key),generated=key==='back-cover'&&!backCoverUsesImage(state),solid=['opening','closing'].includes(key);
    const alternate = settings.paper === 'coated' ? 'uncoated' : 'coated';
    surfaces[0].setAttribute('aria-label',solid?'Unlit solid end-spread color':generated?'Unlit generated back-cover artwork, including miniatures and metadata':'Unlit original photo in its saved trim crop');
    for (const [id, field] of [['print-color-mode', 'mode'], ['print-color-target', 'target'], ['print-color-paper', 'paper'], ['print-color-artwork', 'artwork']]) byId(id).value = settings[field];
    for (const paper of PAPER_KEYS) byId('print-color-paper').querySelector(`[value="${paper}"]`).textContent = paperLabel(settings.target, paper);
    byId('print-color-3d').checked = settings.preview3d; byId('print-color-compare').checked = settings.compare;
    for (const field of ['white', 'black', 'chroma']) { byId(`print-color-${field}`).value = settings.assumptions[settings.paper][field]; byId(`print-color-${field}-value`).textContent = `${settings.assumptions[settings.paper][field]}%`; }
    byId('print-color-estimate-label').textContent = `${paperLabel(settings.target, settings.paper)} · estimate`;
    byId('print-color-alternate-label').textContent = `${paperLabel(settings.target, alternate)} · estimate`;
    byId('print-color-alternate-card').hidden = !settings.compare;
    byId('print-color-panels').classList.toggle('compare-both', settings.compare);
    byId('print-color-selection').textContent = solid?`${key==='opening'?'Opening':'Closing'} spread · unlit solid color`:generated?'Generated back cover · live monthly miniatures and metadata · unlit screen comparison':`${assetLabel(key)} · saved trim crop · unlit screen comparison`;
    const printer=printerById(settings.target),geometry=pdfSheetGeometry(state),media=assessPrinterMedia(printer,geometry);
    byId('print-color-workflow').textContent = printer.kind==='press'
      ? 'Use the print provider’s output profile and RIP settings. A named digital press does not imply FOGRA51/52 or a universal CMYK conversion.'
      : 'Use the exact printer / ink or toner / paper profile, or let the driver manage color. Avoid applying both. Confirm the media setting with the manufacturer.';
    const profile=profileFor(settings.target,settings.paper),icc=settings.mode==='icc';
    byId('print-color-profile-name').textContent=profile?profile.name:'No ICC profile assigned to this printer / paper.';
    byId('print-color-profile-remove').disabled=!profile;
    byId('print-color-assumptions').hidden=icc;
    byId('print-color-output').textContent=icc?(profile?'ICC soft proof · relative colorimetric · paper white / ink black simulated · PDF remains RGB':'Color estimate unavailable: import the exact printer / ink / paper ICC profile. PDF remains RGB.'):'Illustrative paper filter · not a printer prediction · PDF remains RGB';
    byId('print-color-estimate-label').textContent=`${paperLabel(settings.target,settings.paper)} · ${icc?'ICC proof':'illustration'}`;
    byId('print-color-alternate-label').textContent=`${paperLabel(settings.target,alternate)} · ${icc?'ICC proof':'illustration'}`;

    byId('print-color-3d-note').textContent = settings.preview3d ? settings.mode==='icc'&&!profileFor(settings.target,settings.paper)?'No assigned ICC profile; 3D colors unchanged.':'Selected color preview on. Use the unlit panels for comparison; studio lighting changes appearance. PDF unchanged.' : '3D lighting is illustrative, not a color proof. PDF unchanged.';
    const format=value=>Number(value.toFixed(3));
    const sheet=`PDF sheet ${format(geometry.width)} × ${format(geometry.height)} in, including bleed${geometry.slug?' and crop-mark slug':''}.`;
    const reference=printer.sheet?`Listed sheet reference ${(printer.sheets||[printer.sheet]).map(size=>`${format(size[0])} × ${format(size[1])}`).join(' or ')} in.`:printer.rollWidth?`Roll width ${printer.rollWidth} in.`:'';
    const verdict={
      'nominal-fit':'Fits nominal sheet dimensions; printable area and margins still need confirmation.',
      'outside-reference':'Exceeds the listed sheet reference. Confirm custom / long-sheet options or select a larger printer; do not scale to fit.',
      'width-only':'Within nominal roll width; printable width and length are not verified.',
      'outside-width':'Exceeds nominal roll width in either orientation.',
      'unknown':'Sheet capacity is unknown; confirm with your print provider.'
    }[media.status];
    byId('print-color-media').textContent = `${printer.label}: ${sheet} ${reference} ${verdict}${media.printable===false?' Exceeds the documented image area even if it fits the paper.':''} ${printer.note||''} Confirm two-sided stock, feed, drying and finishing.${geometry.uncertain?' PDF dependency unavailable: fallback crop-mark slug may add 0.5 in to both dimensions.':''}`;
    byId('print-color-media').classList.toggle('color-warning',media.status==='outside-reference'||media.status==='outside-width'||media.printable===false);
    const sourceLink=byId('printer-spec-source');sourceLink.href=printer.source;sourceLink.textContent=`${printer.label} specifications`;
    if (state.view !== 'printing') return;
    const nextSignature = JSON.stringify([key, record?.revision, Boolean(record?.bitmap), state.width, state.height, state.bleed, state.endSpreadColor, settings,profileRevision(),generated?[assets.revision,state.backCover,state.artworkMetadata,state.layout,state.margin,state.binding,state.bindingStyle]:null]);
    if (signature === nextSignature) return;
    signature = nextSignature; analysis = null;
    if ((!record?.bitmap&&!generated&&!solid)||(generated&&!backCoverStatus(state).ready)) {
      surfaces.forEach(canvas => { canvas.width = canvas.height = 1; canvas.hidden = true; });
      for (const id of ['print-color-source-metrics', 'print-color-estimate-metrics', 'print-color-alternate-metrics']) byId(id).textContent = 'No artwork loaded.';
      byId('print-color-status').textContent = generated?'Generated back cover is incomplete. Assign all twelve monthly photos before measuring; placeholder pixels are not analyzed. Generated artwork remains visible in the Back cover tab.':'Assign this artwork in Monthly spread (back uploads use Back cover), or choose an existing slot above. Comparisons use the saved crop; no synthetic placeholder statistics are shown.';
      return;
    }
    try {
      const artworkHeight=state.height*(solid?2:1),scale = PREVIEW_EDGE / Math.max(state.width, artworkHeight), width = Math.max(1, Math.round(state.width * scale)), height = Math.max(1, Math.round(artworkHeight * scale));
      surfaces.forEach(canvas => { canvas.width = width; canvas.height = height; canvas.hidden = false; });
      const context = surfaces[0].getContext('2d', { willReadFrequently: true });
      if(solid){context.fillStyle=normalizeEndSpreadColor(state.endSpreadColor);context.fillRect(0,0,width,height);}
      else if(generated)drawBackCover(context,state,width,height,true);
      else drawPhoto(context, record.bitmap, record.metadata.crop, state, width, height, true, record.metadata);
      const original = context.getImageData(0, 0, width, height), source = luminanceMetrics(original);
      const estimates = {};
      for (const [index, paper] of [settings.paper, alternate].entries()) {
        const pixels = new ImageData(new Uint8ClampedArray(original.data), width, height);
        const assigned=profileFor(settings.target,paper);
        if(icc&&!assigned){surfaces[index+1].hidden=true;byId(index===0?'print-color-estimate-metrics':'print-color-alternate-metrics').textContent='No profile for this printer / paper. Import its ICC file to estimate colors.';continue;}
        if(icc)proofPixels(pixels,assigned);else simulatePaperPixels(pixels, settings.assumptions[paper]);
        surfaces[index+1].setAttribute('aria-label',icc?`ICC soft proof using ${assigned.name}`:'Illustrative paper filter');
        surfaces[index + 1].getContext('2d').putImageData(pixels, 0, 0);
        estimates[paper] = luminanceMetrics(pixels);
        byId(index === 0 ? 'print-color-estimate-metrics' : 'print-color-alternate-metrics').textContent = `${metricText(estimates[paper])} · ${deltaText(source, estimates[paper])}`;
      }
      byId('print-color-source-metrics').textContent = metricText(source);
      byId('print-color-status').textContent = `${icc?'ICC proof':'Illustration'} statistics from a ${width} × ${height} px preview of ${solid?'the solid end spread':generated?'generated back-cover artwork (photos and text)':'this trim crop, including white gaps'}. Assumed sRGB; browser decoding / display management may differ. Mean Y is linear relative luminance, not perceived brightness; P95–P5 is an image tonal span, not printer contrast. Deltas are estimates versus this source, not vendor measurements.`;
      analysis = { artwork: key,solidEndSpread:solid,generatedBackCover:generated, sample: { width, height }, source, estimates, assumptions: settings.assumptions, imageDerived: true, notPrinterMeasurements: true, mode:settings.mode, profiles:Object.fromEntries(PAPER_KEYS.map(p=>[p,profileFor(settings.target,p)?.name||null])) };
    } catch {
      surfaces.forEach(canvas => { canvas.width = canvas.height = 1; canvas.hidden = true; });
      for (const id of ['print-color-source-metrics', 'print-color-estimate-metrics', 'print-color-alternate-metrics']) byId(id).textContent = 'Analysis unavailable.';
      byId('print-color-status').textContent = 'This browser could not read the preview pixels. Originals and PDF export remain unchanged.';
    }
  }
  return { render, summary: () => getState().view === 'printing' ? analysis : null, dispose() { disposed=true; controls.forEach(remove => remove()); surfaces.forEach(canvas => { canvas.width = canvas.height = 1; }); } };
}
