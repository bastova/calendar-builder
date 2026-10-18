import { shareDesign, readDesignFolder } from './design-sharing.js';
import { activateAssignedArtwork } from './artwork-assignment.js';
import { commitNumericOnBlur } from './numeric-input.js';
import { createMobileWorkspace } from './mobile-workspace.js';
let mobileWorkspace;
import { readPreference, writePreference } from './browser-storage.js';
import { pdfSheetGeometry } from './pdf-geometry.js';
import { loadCalendarFonts } from './fonts.js';
import { restoreCustomFonts } from './custom-fonts.js';
import { createCalendarScene, PREVIEW_DEFAULTS, PAPER_WEIGHTS, PAPER_FINISHES, estimatedCaliperMm } from './scene.js';
import { MONTHS, assetLabel, calendarPagePlan, calendarSelections, validateSaddleImposition, normalizeLayout, normalizeArtworkMetadata, ARTWORK_FONT_ROLES, ARTWORK_METADATA_LIMITS, DEFAULT_END_SPREAD_COLOR, END_SPREADS, CALENDAR_SELECTIONS, normalizeEndSpreadColor, calendarSelection, calendarSelectionIndex, calendarSelectionLabel } from './layout.js';
import { createLayoutEditor } from './layout-editor.js';
import { backCoverUsesImage, assets, printRasterSpec } from './media.js';
import { createPhotoEditor } from './photo-editor.js';
import { createBackCoverEditor, normalizeBackCover, backCoverStatus } from './back-cover.js';
import { preflight, downloadCalendarPdf } from './pdf.js';
import { normalizePdfExportTarget, prestoPhotoExportState, prestoPhotoSummary } from './prestophoto.js';
import { normalizePrintColor, createPrintColorPanel, printColorSummary } from './print-color.js';
import { normalizeHolidays, createHolidayPanel } from './holidays.js';
await loadCalendarFonts();
const customFontRestoreErrors = await restoreCustomFonts();
const calendarScene = createCalendarScene(document.getElementById('three-scene'));
const STORAGE_KEY = 'calendar-layout-2027-39be18a4-712d-45cd-a061-f492bec78230:studio-v1';
const LEGACY_STORAGE_KEY = 'calendar-layout-studio-v1';
const STUDIO_LIGHTING_VERSION = 2;
const DEFAULTS = {...PREVIEW_DEFAULTS,studioLightingVersion:STUDIO_LIGHTING_VERSION,year:2027,width:12,height:12,bleed:0.125,margin:0.5,binding:0.5,bindingStyle:'wire',week:0,guides:true,includeOpeningSpread:true,includeClosingSpread:true,month:0,endSpread:null,endSpreadColor:DEFAULT_END_SPREAD_COLOR,view:'spread',cropMarks:false,pdfExportTarget:'assembly',editorTab:'images',backCover:normalizeBackCover(),artworkMetadata:normalizeArtworkMetadata(),layout:normalizeLayout(),printColor:normalizePrintColor(),holidays:normalizeHolidays()};
const LIMITS = {year:[1900,9999],width:[4,24],height:[4,24],bleed:[0,0.5],margin:[0.25,1.5],binding:[0.25,2],week:[0,1],month:[0,11]};
// Preserve the active Proof's saved configuration as the standalone starting point.
const EXPORTED_STATE = {previewClosed:false,paperGsm:170,coverGsm:250,paperFinish:'gloss',paperRoughness:0.43,bindingStyle:'saddle',guides:false,month:2,artworkMetadata:normalizeArtworkMetadata({'month-2':{artist:'Brenninetla',title:'Danger',description:'Cool Marin train called SMART attacking beachgoers'}}),layout:normalizeLayout({...DEFAULTS.layout,fonts:{...DEFAULTS.layout.fonts,title:{family:'times',size:58,style:'normal',align:'left',color:'#111111'},year:{family:'helvetica',size:30,style:'normal',align:'right',color:'#111111'},weekday:{family:'helvetica',size:16,style:'bold',align:'center',color:'#ff2600'},date:{family:'helvetica',size:22,style:'normal',align:'left',color:'#111111'},holiday:{family:'times',size:10,style:'normal',align:'left',color:'#ffffff'}}}),backCover:normalizeBackCover({...DEFAULTS.backCover,thumbnails:{...DEFAULTS.backCover.thumbnails,'month-2':{mode:'inherit',x:0.56,y:0.01,zoom:1.1}}}),printColor:normalizePrintColor({...DEFAULTS.printColor,paper:'coated',assumptions:{coated:{white:75,black:2,chroma:0},uncoated:{white:88,black:6,chroma:20}}}),holidays:normalizeHolidays({enabled:true,color:'#ff2600',removed:[],custom:[]})};
let state = {...DEFAULTS,...EXPORTED_STATE};
const byId = id => document.getElementById(id);
window.addEventListener('calendar-storage-error',()=>{byId('error').textContent='Browser storage is full or unavailable. Recent changes may not survive closing this tab. Free space or enable site storage.';});
navigator.storage?.persist?.().catch(()=>{});
const format = value => Number(value.toFixed(4)).toString();
function valid(data) {
  return data && Object.entries(LIMITS).every(([key,[min,max]]) => Number.isFinite(data[key]) && data[key]>=min && data[key]<=max) && Number.isInteger(data.year) && Number.isInteger(data.month) && Number.isInteger(data.week) && typeof data.guides==='boolean' && typeof data.includeOpeningSpread==='boolean' && typeof data.includeClosingSpread==='boolean' && ['spread','printing'].includes(data.view) && ['wire','saddle'].includes(data.bindingStyle) && data.margin*2<data.width && data.margin+Math.max(data.margin,data.binding)<data.height && typeof data.previewClosed==='boolean' && (data.endSpread===null||END_SPREADS.includes(data.endSpread)) && (!data.previewClosed||data.endSpread===null) && typeof data.endSpreadColor==='string' && /^#[0-9a-f]{6}$/i.test(data.endSpreadColor) && PAPER_WEIGHTS.includes(data.paperGsm) && PAPER_WEIGHTS.includes(data.coverGsm) && Object.hasOwn(PAPER_FINISHES,data.paperFinish) && Number.isFinite(data.paperRoughness) && data.paperRoughness>=0.18 && data.paperRoughness<=0.98;
}
/** Migrate settings matching the previous matte default to the requested studio look once. */
function migrateSavedState(saved) {
  if(!saved || typeof saved!=='object' || Array.isArray(saved)) return null;
  const upgradeDefault=(saved.studioLightingVersion??0)<STUDIO_LIGHTING_VERSION && saved.paperFinish==='matte' && saved.paperRoughness===0.90;
  const finish=upgradeDefault?PREVIEW_DEFAULTS.paperFinish:Object.hasOwn(PAPER_FINISHES,saved.paperFinish)?saved.paperFinish:PREVIEW_DEFAULTS.paperFinish;
  return {...saved,pdfExportTarget:normalizePdfExportTarget(saved.pdfExportTarget),includeOpeningSpread:saved.includeOpeningSpread!==false,includeClosingSpread:saved.includeClosingSpread!==false,artworkMetadata:normalizeArtworkMetadata(saved.artworkMetadata),endSpread:END_SPREADS.includes(saved.endSpread)&&calendarSelections(saved).includes(saved.endSpread)&&!saved.previewClosed?saved.endSpread:null,endSpreadColor:normalizeEndSpreadColor(saved.endSpreadColor),layout:normalizeLayout(saved.layout),editorTab:['images','layout','back-cover'].includes(saved.editorTab)?saved.editorTab:'images',backCover:normalizeBackCover(saved.backCover),holidays:normalizeHolidays(saved.holidays),printColor:normalizePrintColor(saved.printColor),studioLightingVersion:STUDIO_LIGHTING_VERSION,bindingStyle:saved.bindingStyle??'wire',view:saved.view==='covers'?'spread':saved.view,
    previewClosed:typeof saved.previewClosed==='boolean'?saved.previewClosed:PREVIEW_DEFAULTS.previewClosed,
    paperGsm:PAPER_WEIGHTS.includes(saved.paperGsm)?saved.paperGsm:PREVIEW_DEFAULTS.paperGsm,
    coverGsm:PAPER_WEIGHTS.includes(saved.coverGsm)?saved.coverGsm:PREVIEW_DEFAULTS.coverGsm,
    paperFinish:finish,paperRoughness:upgradeDefault?PREVIEW_DEFAULTS.paperRoughness:Number.isFinite(saved.paperRoughness)&&saved.paperRoughness>=0.18&&saved.paperRoughness<=0.98?saved.paperRoughness:PAPER_FINISHES[finish].roughness};
}
try { const saved=migrateSavedState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY))); if(valid(saved)) state={...DEFAULTS,...saved}; } catch {}
let busy = false;
const photoEditor = createPhotoEditor(() => state, key => {
  state.endSpread=null;
  if (key.startsWith('month-')) {state.month=Number(key.slice(6));state.previewClosed=false;}
  else if (key==='front-cover') state.previewClosed=true;
  state.view='spread';
  render();save();
}, (key,metadata) => {
  if(key!=='front-cover'&&!/^month-(?:[0-9]|1[01])$/.test(key)) return;
  state.artworkMetadata=normalizeArtworkMetadata({...state.artworkMetadata,[key]:metadata});
  // Regenerate only back artwork while typing; do not rebuild the active photo editor.
  backCoverEditor.render();layoutEditor.render();calendarScene.update(state);save();
},key=>{
  state=activateAssignedArtwork(state,key);render();save();
});
const backCoverEditor = createBackCoverEditor(() => state, settings => {state.backCover=normalizeBackCover(settings);backCoverEditor.render();calendarScene.update(state);updatePreflight();save();}, () => busy);
const printColorPanel = createPrintColorPanel(() => state, settings => {
  state.printColor=normalizePrintColor(settings);
  printColorPanel.render();calendarScene.update(state);save();
});
function previewSummary() {
  const interiorCaliperMm=estimatedCaliperMm(state.paperGsm),coverCaliperMm=estimatedCaliperMm(state.coverGsm),plan=calendarPagePlan(state);
  return {pose:state.previewClosed?'closed':'open',lighting:'HDR softboxes + sampled rectangular area + rim + focused spot',rectAreaLightLtcAddonAvailable:false,shadow:'Blurred VSM',stockDensityEstimateKgM3:700,interiorCaliperMm,coverCaliperMm,closedPaperStackMm:(plan.leafCount-2)*interiorCaliperMm+2*coverCaliperMm,visualizationOnly:true,printColorEstimateApplied:state.printColor.preview3d,pdfCreepCompensation:false};
}
function snapshot() {
  const check=preflight(state),saddle=state.bindingStyle==='saddle',plan=calendarPagePlan(state);
  return {...state,artworkMetadata:normalizeArtworkMetadata(state.artworkMetadata),artworkText:{displayed:!backCoverUsesImage(state)||state.layout.artworkPlacement!=='none',printed:!backCoverUsesImage(state)||state.layout.artworkPlacement!=='none',monthlyPlacement:state.layout.artworkPlacement,location:'configured-month-pages-and-generated-back-cover',typographyRoles:[...ARTWORK_FONT_ROLES],metadataLimits:{...ARTWORK_METADATA_LIMITS}},backCover:normalizeBackCover(state.backCover),backCoverStatus:backCoverStatus(state),endSpreadColor:normalizeEndSpreadColor(state.endSpreadColor),selection:calendarSelection(state),layout:normalizeLayout(state.layout),layoutPreview:layoutEditor.summary(),printColor:{...printColorSummary(state),analysis:printColorPanel.summary()},preview:previewSummary(),interiorSheets:plan.interiorSheets,coverSheets:plan.coverSheets,physicalSheets:plan.physicalSheets,readerPage:{width:state.width,height:state.height},openSpread:{width:state.width,height:state.height*2},logicalPages:plan.logicalPages,paddingPages:plan.paddingPages,printSequence:sequence(),assets:assets.metadata(),preflight:{missing:check.missing,requiredPhotos:check.required,backCoverMode:check.backCoverMode,lowResolution:check.low,whiteGaps:check.gaps,pending:check.pending,ready:check.ready},pdf:state.pdfExportTarget==='prestophoto'?{...prestoPhotoSummary(state),exportTarget:'prestophoto',printerReviewRequired:true}:{pages:plan.pdfPages,trimWidth:state.width,trimHeight:saddle?state.height*2:state.height,bleedWidth:state.width+2*state.bleed,bleedHeight:(saddle?state.height*2:state.height)+2*state.bleed,colorSpace:'RGB',printerReviewRequired:true}};
}
function save() {
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));} catch {window.dispatchEvent(new CustomEvent('calendar-storage-error'));}
  if(typeof window.Bezi?.setData==='function') {try {const result=window.Bezi.setData(snapshot());result?.catch?.(()=>{});} catch {}}
}
function sequence() {
  const plan=calendarPagePlan(state);
  if(state.bindingStyle==='saddle') return plan.imposition.map((sheet,index)=>{
    const label=(pageNumber)=>`p${pageNumber} ${plan.pages[pageNumber-1].label}`;
    return {sheet:index===0?'01 · Outer cover':String(index+1).padStart(2,'0'),a:`Side A · PDF ${index*2+1} · TOP ↓ 180° ${label(sheet.front[0])} / BOTTOM ↑ 0° ${label(sheet.front[1])}`,b:`Side B · PDF ${index*2+2} · TOP ↓ 180° ${label(sheet.reverse[0])} / BOTTOM ↑ 0° ${label(sheet.reverse[1])}`,cover:index===0,topA:sheet.front[0],bottomA:sheet.front[1],topB:sheet.reverse[0],bottomB:sheet.reverse[1],rotations:sheet.rotations};
  });
  const pages=plan.pages,sheets=[];
  for(let index=0;index<pages.length;index+=2) {
    const cover=index===0||index===pages.length-2;
    sheets.push({sheet:index===0?'Front cover':index===pages.length-2?'Back cover':String(index/2).padStart(2,'0'),a:`${pages[index].label} · p${index+1}`,b:`${pages[index+1].label} · p${index+2}`,cover});
  }
  return sheets;
}
function updatePreflight() {
  const presto=state.pdfExportTarget==='prestophoto',output=presto?prestoPhotoExportState(state):state;
  const check=preflight(output),invalid=Boolean(document.querySelector('[aria-invalid="true"]'));
  const upload=presto?prestoPhotoSummary(state):null;
  byId('pdf-export-target').value=normalizePdfExportTarget(state.pdfExportTarget);
  byId('prestophoto-export-note').hidden=!presto;
  byId('crop-marks').disabled=presto||busy||Boolean(assets.pending);
  const aw=state.width+2*state.bleed,ah=state.height*(state.bindingStyle==='saddle'?2:1)+2*state.bleed,slug=pdfSheetGeometry(state).slug;
  byId('pdf-size').textContent=`MediaBox ${format(aw+2*slug)} × ${format(ah+2*slug)} in · ${state.bindingStyle==='saddle'?`folded-sheet trim ${format(state.width)} × ${format(state.height*2)} in · closed reader page ${format(state.width)} × ${format(state.height)} in`:`trim ${format(state.width)} × ${format(state.height)} in`} · exterior bleed ${format(state.bleed)} in. TrimBox/BleedBox, when supported, describe the ${state.bindingStyle==='saddle'?'whole folded sheet':'page'}; otherwise crop/fold marks use a 0.25 in exterior slug.`;
  const messages=[];
  if(upload){
    byId('pdf-size').textContent=`PrestoPhoto upload ${format(upload.mediaWidth)} × ${format(upload.mediaHeight)} in · trim ${format(upload.width)} × ${format(upload.height)} in · ${upload.pages} reader-order pages · 0.125 in bleed per edge · no marks or exterior slug · PDF 1.5 / sRGB.`;
    byId('pdf-title').textContent='PrestoPhoto calendar PDF';
    byId('pdf-description').textContent=`${upload.pages} individual reader pages · front cover first, back cover last · no booklet imposition · sRGB with embedded color profile · 300 PPI target. Grid lettering is rasterized with your selected fonts; artwork shapes remain vector. SWOP preview is not applied to export.`;
    byId('download-pdf').textContent=`Download PrestoPhoto PDF · ${upload.pages} pages`;
    byId('pdf-footnote').textContent='PrestoPhoto upload preset: individual reader pages, not the assembly map’s imposed sheets. Upload as a calendar, review cover selection and every page in the vendor proof before ordering.';
    messages.push(...upload.notices);
  }
  if(check.pending) messages.push(`Photo restoration / assignment / Pica resizing in progress (${check.pending} operations). Wait before exporting.`);
  if(invalid) messages.push('Correct invalid document settings before exporting.');
   const layoutWarnings=layoutEditor.summary().notices;
   if(layoutWarnings.length) messages.push(`Calendar layout review (${MONTHS[state.month]}): ${layoutWarnings.join(' ')}`);
  if(!photoEditor.files) messages.push('Photo directory access or required image processing is unavailable in this host.');
  if(!check.resizingAvailable) messages.push('Pica 10.0.3 failed to load. Photo assignment and PDF export are disabled; no lower-quality fallback is used.');
  if(typeof window.jspdf?.jsPDF!=='function') messages.push('PDF library is unavailable.');
  if(check.missing.length) messages.push(`Missing / unavailable (${check.missing.length}/${check.required}): ${check.missing.map(assetLabel).join(', ')}.`);
  else messages.push(`All ${check.required} required photo previews are loaded. Folder permissions and image files are rechecked at export.`);
  messages.push(check.backCoverMode==='generated'?'Back cover is generated live from independent thumbnail framing and monthly artist/title/description details; no uploaded back image is required. Generated text and pictures share a bounded RGB print raster.':'Back cover uses the uploaded image and its saved crop.');
  if(check.low.length) messages.push(`Low-resolution warning, target 300 PPI: ${check.low.join('; ')}.`);
  if(check.gaps.length) messages.push(`White-gap warning: ${check.gaps.map(assetLabel).join(', ')} do not cover the full ${state.bindingStyle==='saddle'?'reader page':'page'} and applicable bleed. Empty and transparent areas print white; use Reset centered fill in Monthly spread if unintended.`);
  if(check.rasterPpi<300) messages.push(`Large-page memory bound: output raster target is ${check.rasterPpi} PPI, not 300.`);
  byId('pdf-preflight').textContent=messages.join(' ');
  byId('preview-pdf').disabled=busy||invalid||Boolean(check.pending)||typeof window.jspdf?.jsPDF!=='function';
  byId('download-pdf').disabled=busy||invalid||!check.ready||!photoEditor.files||typeof window.jspdf?.jsPDF!=='function';
}
function renderAssets() {
  document.querySelectorAll('[data-month]').forEach(button=>{
    const loaded=Boolean(assets.get(`month-${button.dataset.month}`)?.bitmap);
    button.classList.toggle('has-photo',loaded);button.title=`${MONTHS[Number(button.dataset.month)]}: ${loaded?'photo assigned':'photo missing'}`;
  });
  photoEditor.render();backCoverEditor.render();printColorPanel.render();updatePreflight();
}
function syncInputs() {
  for(const key of ['year','width','height','bleed','margin','binding','week']) byId(key).value=state[key];
  byId('binding-style').value=state.bindingStyle;
  byId('crop-marks').checked=Boolean(state.cropMarks);
  byId('include-opening-spread').checked=state.includeOpeningSpread;
  byId('include-closing-spread').checked=state.includeClosingSpread;
}
function renderPreviewControls() {
  const coverButton=document.querySelector('[data-cover]');
  coverButton.classList.toggle('active',state.previewClosed);
  coverButton.setAttribute('aria-pressed',String(state.previewClosed));
  byId('paper-gsm').value=state.paperGsm;
  byId('cover-gsm').value=state.coverGsm;
  byId('paper-finish').value=state.paperFinish;
  byId('paper-roughness').value=state.paperRoughness;
  byId('paper-roughness-value').textContent=state.paperRoughness.toFixed(2);
  const estimate=previewSummary();
  byId('preview-stock-note').textContent=`Estimated thickness: interior ${estimate.interiorCaliperMm.toFixed(3)} mm · cover ${estimate.coverCaliperMm.toFixed(3)} mm · closed stack ${estimate.closedPaperStackMm.toFixed(2)} mm. Weight, finish and roughness affect the 3D preview only; PDF unchanged.`;
}
const holidayPanel = createHolidayPanel(() => state, () => {render();save();});
const layoutEditor = createLayoutEditor(() => state, (settings,endColor) => {
  state.layout=normalizeLayout(settings);if(endColor!==undefined)state.endSpreadColor=normalizeEndSpreadColor(endColor);render();save();
}, tab => {state.editorTab=['images','layout','back-cover'].includes(tab)?tab:'images';render();save();}, holidays => {
  state.holidays=normalizeHolidays(holidays);render();save();
}, color => {state.endSpreadColor=normalizeEndSpreadColor(color);render();save();});
function render() {
  if(state.endSpread && !calendarSelections(state).includes(state.endSpread)) {
    state.month=state.endSpread==='opening'?0:11;
    state.endSpread=null;
    photoEditor.setTarget(`month-${state.month}`);
  }
  byId('include-opening-spread').checked=state.includeOpeningSpread;
  byId('include-closing-spread').checked=state.includeClosingSpread;
  holidayPanel.render();
  layoutEditor.render();
  renderPreviewControls();
  const {year,width,height,bleed,month,view}=state,saddle=state.bindingStyle==='saddle',plan=calendarPagePlan(state),selections=calendarSelections(state);
  if(saddle) validateSaddleImposition(year,state);
  byId('interactive-preview').hidden=view==='printing';
  byId('flip-label').parentElement.hidden=view!=='spread';
  byId('artwork-tabs').hidden=view!=='spread';
  byId('viewer-measure').textContent=`${format(width)} × ${format(height)} in / ${saddle?'closed reader':'page'} · open ${format(width)} × ${format(height*2)} in`;
  const selection=calendarSelection(state),selectionLabel=calendarSelectionLabel(state),selectionIndex=calendarSelectionIndex(state);
  byId('flip-label').textContent=selectionLabel;
  byId('flip-prev').disabled=selectionIndex===0;
  byId('flip-next').disabled=selectionIndex===selections.length-1;
  calendarScene.update(state);
  document.body.classList.toggle('printing-mode',view==='printing');
  byId('preview-title').textContent=view==='spread'?(state.previewClosed?`Closed calendar · ${year}`:state.endSpread?`${selectionLabel} spread · ${year}`:`${MONTHS[month]} ${year}`):'Printing & assembly';
  byId('printing-view').hidden=view!=='printing';
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-selected',String(button.dataset.view===view));});
  byId('month-strip').hidden=view!=='spread';
  document.querySelectorAll('[data-month]').forEach(button=>{const selected=selection===Number(button.dataset.month);button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-end-spread]').forEach(button=>{button.hidden=!selections.includes(button.dataset.endSpread);const selected=selection===button.dataset.endSpread;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  byId('trim-spec').textContent=saddle?`${format(width)} × ${format(height)} in / reader page`:`${format(width)} × ${format(height)} in / page`;
  byId('trim-spec-note').textContent=saddle?'Full photo page above · full grid page below':'Photo and grid are separate pages';
  byId('bleed-spec').textContent=`${format(width+2*bleed)} × ${format(height*(saddle?2:1)+2*bleed)} in`;
  byId('bleed-spec-note').textContent=saddle?'Whole folded sheet; exterior bleed only, none at seam':'Extend images to all bleed edges';
  const raster=printRasterSpec(state);
  byId('pixel-spec').textContent=`${raster.width} × ${raster.height} px / full photo`;
  byId('pixel-spec-note').textContent=`Pica resizes the saved crop to this exact raster · ${(raster.ppi<300?`${Math.floor(raster.ppi)} PPI memory-bound output; 300 PPI would need ${raster.preferredWidth} × ${raster.preferredHeight} px`:'target 300 PPI')} · resizing adds no source detail`;
  byId('binding-summary').textContent=`Selected binding: ${saddle?'Top-bound saddle stitch':'Wire / coil'} · controlled in Calendar settings`;
  byId('binding-setting').hidden=saddle;
  const opening=state.includeOpeningSpread?'included':'omitted',closing=state.includeClosingSpread?'included':'omitted';
  const padding=plan.paddingPages?` ${plan.paddingPages} required booklet padding pages remain after December to complete folded sheets.`:'';
  const monthPage=month=>plan.pages.findIndex(page=>page.kind==='photo'&&page.month===month)+1;
  const endPages=name=>plan.pages.flatMap((page,index)=>page.endSpread===name?[index+1]:[]).join('/p');
  const endDescription=`Opening blank spread ${opening}${state.includeOpeningSpread?` (p${endPages('opening')})`:''}; closing blank spread ${closing}${state.includeClosingSpread?` (p${endPages('closing')})`:''}.`;
  byId('print-count').textContent=saddle?`${plan.physicalSheets} folded sheets · 1 cover + ${plan.interiorSheets} interior · ${plan.pdfPages} PDF sides`:`${plan.interiorSheets} interior sheets + 2 covers`;
  byId('print-intro').textContent=saddle?`Each flat ${format(width)} × ${format(height*2)} in sheet folds horizontally to ${format(width)} × ${format(height)} in. ${plan.logicalPages} logical pages include all twelve full photo/grid pairs and both exterior covers. ${endDescription}${padding} Table positions are TOP/BOTTOM as viewed on each printed side.`:`The grid for one month shares a sheet with the next month's photo, so each photo faces its grid across the binding. ${endDescription}`;
  byId('duplex-note').textContent=saddle?`Head-to-head imposition: TOP ↓ 180°, BOTTOM ↑ 0° on both PDF sides; the PDF already applies these rotations. Duplex consecutive A/B pairs (1,2) through (${plan.pdfPages-1},${plan.pdfPages}) at actual size; no booklet mode or extra artwork rotation. Test all ${plan.physicalSheets} sheets at reduced size, fold horizontally, and nest Sheet 1 outside through Sheet ${plan.physicalSheets} inside. Verify front p1 / back p${plan.logicalPages}, January p${monthPage(0)}/p${monthPage(0)+1} and all pairs through December p${monthPage(11)}/p${monthPage(11)+1} upright. Confirm top-edge/tumble backing with your printer.`:'Orientation: top-edge / tumble duplex. For portrait artwork this is commonly “flip on short edge”. Square sheets are ambiguous: tell the printer explicitly to flip over the top binding edge. Test one sheet and assemble before running the full job. Do not pre-rotate artwork if the duplex driver already handles this.';
  byId('cover-stock-note').textContent=saddle?`Sheet 1 is cover stock: PDF 1 outside has p${plan.logicalPages} back / p1 front; PDF 2 inside has p2 / p${plan.logicalPages-1}. With a blank spread omitted, its adjacent month artwork can print on the inside cover. Extract PDF 1–2 for cover stock and PDF 3–${plan.pdfPages} for ${plan.interiorSheets} interior folded sheets.`:`Cover-stock jobs are pages 1–2 and ${plan.logicalPages-1}–${plan.logicalPages}. Omitted blank spreads place adjacent month artwork on the inside covers.`;
  const noteTitles=saddle?[`${plan.logicalPages} reader pages · ${plan.pdfPages} PDF sides`,`One cover + ${plan.interiorSheets} interior sheets`,'Horizontal fold, nest & staple']:[`Complete PDF · ${plan.pdfPages} pages`,'Two stock jobs from one file','Finishing & printer review'];
  const noteBodies=[
    `Reader order: front outside p1; January photo/grid p${monthPage(0)}/p${monthPage(0)+1}; all twelve monthly pairs through December p${monthPage(11)}/p${monthPage(11)+1}; back outside p${plan.logicalPages}. ${endDescription}${padding}`,
    saddle?`PDF 1–2: Sheet 1, cover stock. PDF 3–${plan.pdfPages}: Sheets 2–${plan.physicalSheets}, interior stock. Each consecutive PDF pair is one physical sheet A/B. Rotations are already imposed; do not use a second booklet-imposition pass.`:`For interior stock, extract pages 3–${plan.logicalPages-2}: ${plan.logicalPages-4} pages / ${plan.interiorSheets} sheets. For cover stock, extract pages 1–2 then ${plan.logicalPages-1}–${plan.logicalPages}: 4 pages / 2 sheets. These are full-file page numbers. No booklet imposition.`,
    saddle?`Trim each sheet to ${format(width)} × ${format(height*2)} in, fold at ${format(height)} in horizontally, nest Sheets 1–${plan.physicalSheets} and staple along the seam. Verify all twelve upright photo/grid spreads. Confirm duplex backing, grain, stock caliper, creep, registration and staple clearance. RGB, not PDF/X or ICC-converted.`:'Print at 100% / actual size, using larger parent stock for bleed. Trim, punch and bind at the top edge. Confirm duplex orientation, crop boxes, bleed, hole clearance, paper grain and stock thickness with your printer. Images are RGB; output ICC conversion is not performed.'
  ];
  for(let index=0;index<3;index++) {byId(`map-note-title-${index+1}`).textContent=noteTitles[index];byId(`map-note-${index+1}`).textContent=noteBodies[index];}
  byId('pdf-title').textContent=saddle?'Top-bound saddle imposed PDF':'Full print-layout PDF';
  byId('pdf-description').textContent=`${plan.pdfPages} ${saddle?'imposed sides':'pages in physical assembly order'} · ${plan.physicalSheets} ${saddle?'folded ':''}sheets · vector grids and full-size photo crops. ${endDescription}${padding} RGB, not PDF/X or ICC-converted; printer review required.`;
  byId('download-pdf').textContent=saddle?`Download saddle PDF · ${plan.pdfPages} sides`:`Download complete PDF · ${plan.pdfPages} pages`;
  byId('pdf-footnote').textContent=saddle?'Already imposed TOP/BOTTOM sheet sides; crop/fold marks, when enabled, are outside the artwork in the slug. Proof the duplex, horizontal fold and upright photo/grid pairs before production. RGB, not PDF/X-certified or ICC-converted.':'The download is a full print-layout PDF, not imposed, PDF/X-certified, or ICC-converted. Review and proof it with your printer before production.';
  byId('three-scene').setAttribute('aria-label',state.previewClosed?`Fully closed ${format(width)} by ${format(height)} inch ${saddle?'top-bound saddle':'wire/coil'} calendar. Front exterior photo; drag to inspect the back exterior and stock edges. Scroll or pinch to zoom.`:state.endSpread?`${selectionLabel} spread: top and bottom pages use their independently configured image or color. ${saddle?'Horizontal saddle fold':'Top-edge wire/coil binding'}. Drag to rotate; scroll or pinch to zoom.`:saddle?`Interactive 3D top-bound saddle calendar: full photo above a horizontal centerfold, full grid below, ${plan.physicalSheets} folded sheets and staples. Drag to rotate; scroll or pinch to zoom.`:'Interactive 3D top-bound wire/coil calendar. Drag to rotate; scroll or pinch to zoom.');
  byId('viewer-bottom').firstElementChild.textContent=(state.previewClosed?'Closed · drag for back / underside · scroll/pinch to zoom':saddle?'Horizontal saddle seam · drag to orbit · scroll/pinch to zoom':'Wire / coil · top-edge binding · drag to rotate · scroll/pinch to zoom')+' · Shift + drag to move';

  byId('print-rows').replaceChildren(...sequence().map(sheet=>{
    const row=document.createElement('tr');if(sheet.cover) row.className='cover-row';
    for(const text of [sheet.sheet,sheet.a,sheet.b,sheet.cover?'Duplex · cover stock':'Duplex · interior stock']) {const cell=document.createElement('td');cell.textContent=text;row.append(cell);}return row;
  }));
  renderAssets();
  mobileWorkspace?.sync();
}
for(const key of ['year','width','height','bleed','margin','binding','week']) {
  byId(key).addEventListener('input',()=>{
    const input=byId(key); const candidate={...state,[key]:input.value===''?NaN:Number(input.value)};
    if(!valid(candidate)) {byId('error').textContent='Enter values within the shown limits. The safe and binding margins must fit inside the page; the year must be a whole number.';input.setAttribute('aria-invalid','true');updatePreflight();return;}
    state=candidate;byId('error').textContent='';input.removeAttribute('aria-invalid');render();save();
  });
  if(byId(key).type==='number') commitNumericOnBlur(byId(key),...LIMITS[key],()=>state[key],{integer:key==='year'});
}
for(const [id,key] of [['include-opening-spread','includeOpeningSpread'],['include-closing-spread','includeClosingSpread']]) {
  byId(id).addEventListener('change',()=>{state[key]=byId(id).checked;render();save();});
}
byId('binding-style').addEventListener('change',()=>{state.bindingStyle=byId('binding-style').value==='saddle'?'saddle':'wire';render();save();});
/** Select persisted cover/end/month intent; never invent an end-spread photo slot. */
function selectCalendar(target) {
  if(!calendarSelections(state).includes(target))return;
  state.previewClosed=target==='cover';
  state.endSpread=END_SPREADS.includes(target)?target:null;
  if(typeof target==='number') state.month=target;
  state.view='spread';
  if(!state.endSpread)photoEditor.setTarget(state.previewClosed?'front-cover':`month-${state.month}`);
  render();save();
}
document.querySelector('[data-cover]').addEventListener('click',()=>selectCalendar('cover'));
for(const [id,key] of [['paper-gsm','paperGsm'],['cover-gsm','coverGsm']]) {
  byId(id).addEventListener('change',()=>{const weight=Number(byId(id).value);if(!PAPER_WEIGHTS.includes(weight))return;state[key]=weight;render();save();});
}
byId('paper-finish').addEventListener('change',()=>{
  const finish=byId('paper-finish').value;if(!Object.hasOwn(PAPER_FINISHES,finish))return;
  state.paperFinish=finish;state.paperRoughness=PAPER_FINISHES[finish].roughness;render();save();
});
byId('paper-roughness').addEventListener('input',()=>{
  const roughness=Number(byId('paper-roughness').value);if(!Number.isFinite(roughness))return;
  state.paperRoughness=Math.max(0.18,Math.min(0.98,roughness));renderPreviewControls();calendarScene.update(state);save();
});
CALENDAR_SELECTIONS.filter(target=>target!=='cover').forEach(target=>{const button=document.createElement('button'),isMonth=typeof target==='number',name=isMonth?MONTHS[target]:target==='opening'?'Opening':'Closing';button.type='button';button.textContent=isMonth?name.slice(0,3):name;if(isMonth)button.dataset.month=target;else button.dataset.endSpread=target;button.setAttribute('aria-label',isMonth?name:`${name} spread`);button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>selectCalendar(target));byId('month-strip').append(button);});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;render();save();}));
if(typeof window.Bezi?.onDataRequest==='function') {try {window.Bezi.onDataRequest(snapshot);} catch {}}
byId('flip-prev').addEventListener('click',()=>{const index=calendarSelectionIndex(state);if(index>0)selectCalendar(calendarSelections(state)[index-1]);});
byId('flip-next').addEventListener('click',()=>{const selections=calendarSelections(state),index=calendarSelectionIndex(state);if(index<selections.length-1)selectCalendar(selections[index+1]);});
byId('camera-reset').addEventListener('click',()=>calendarScene.resetView());
byId('three-scene').addEventListener('calendar-month-change',event=>{
  if(busy||event.detail.month!==state.month||event.detail.previewClosed!==state.previewClosed||event.detail.endSpread!==state.endSpread)return;
  render();save();
});
photoEditor.setTarget(state.previewClosed?'front-cover':`month-${state.month}`);
syncInputs();render();save();
const specificationControls = ['reset-layout','image-picker-tab','layout-modifier-tab','back-cover-tab','back-cover-upload','back-cover-remove','back-cover-fill','back-cover-fit',...[...document.querySelectorAll('[data-back-control]')].map(control=>control.id),...[...document.querySelectorAll('[data-layout-control]')].map(control=>control.id),'year','width','height','bleed','margin','binding','binding-style','week','include-opening-spread','include-closing-spread','pdf-export-target','crop-marks','paper-gsm','cover-gsm','paper-finish','paper-roughness','print-color-target','print-color-paper','print-color-artwork','print-color-compare','print-color-3d','print-color-white','print-color-black','print-color-chroma','print-color-reset'];
const pendingDisabledBefore = new Map();
function syncPreparationLock() {
  if (assets.pending) {
    for (const id of specificationControls) {
      const control=byId(id);
      if (!control) continue;
      if (!pendingDisabledBefore.has(control)) pendingDisabledBefore.set(control,control.disabled);
      control.disabled=true;
    }
  } else {
    pendingDisabledBefore.forEach((disabled,control)=>{control.disabled=disabled;});
    pendingDisabledBefore.clear();
  }
}
assets.subscribe(()=>{syncPreparationLock();if(busy){updatePreflight();return;}calendarScene.update(state);layoutEditor.render();renderAssets();save();});
for(const type of ['click','input','change','pointerdown','pointermove','wheel','keydown']) document.addEventListener(type,event=>{
  // Lock export mutations, not modal dismissal or unrelated navigation. Preparation
  // already disables its specification controls and the photo editor locally.
  if(busy && event.target instanceof Element && event.target.closest('main') && !event.target.closest('dialog')) {event.preventDefault();event.stopImmediatePropagation();}
},{capture:true,passive:false});
byId('pdf-export-target').addEventListener('change',()=>{state.pdfExportTarget=normalizePdfExportTarget(byId('pdf-export-target').value);render();save();});
byId('crop-marks').addEventListener('change',()=>{state.cropMarks=byId('crop-marks').checked;updatePreflight();save();});
let previewUrl;
const closePreview=()=>{byId('pdf-preview-dialog').close();byId('pdf-preview-frame').src='about:blank';if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
byId('close-pdf-preview').addEventListener('click',closePreview);
byId('pdf-preview-dialog').addEventListener('cancel',event=>{event.preventDefault();closePreview();});
for(const action of ['preview-pdf','download-pdf']) byId(action).addEventListener('click',async()=>{
  const preview=action==='preview-pdf';
  if(busy || assets.pending || (!preview&&!preflight(state).ready) || document.querySelector('[aria-invalid="true"]')) return;
  // Snapshot before setBusy renders its own disabled state. Never disable dialog
  // close buttons: an already open preview must remain dismissible during export.
  const disabledBefore=new Map([...document.querySelectorAll('main button,main input,main select,main textarea')].filter(control=>!control.closest('dialog')).map(control=>[control,control.disabled]));
  busy=true;
  try {
    photoEditor.setBusy(true);
    disabledBefore.forEach((_,control)=>{control.disabled=true;});
    document.body.classList.add('exporting');
    byId('pdf-progress').textContent='Checking photos and folder permissions…';
    const result=await downloadCalendarPdf({...state},photoEditor.files,text=>{byId('pdf-progress').textContent=text;},{preview});
    if(preview){
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewUrl=URL.createObjectURL(result.blob);
      byId('pdf-preview-frame').src=previewUrl;
      byId('save-preview-pdf').href=previewUrl;byId('save-preview-pdf').download=result.filename;
      byId('pdf-preview-dialog').showModal();
      byId('pdf-progress').textContent=`Preview ready: ${result.pages} pages.`;
      return;
    }
    byId('pdf-progress').textContent=`Download requested: ${result.pages} pages · MediaBox ${format(result.mediaWidth)} × ${format(result.mediaHeight)} in${result.boxes?' · TrimBox and BleedBox included':''}. Review with your printer before production.${result.warnings.length?' '+result.warnings.join(' '):''}`;
  } catch(error) {byId('pdf-progress').textContent=`Export failed: ${error.message}`;}
  finally {
    busy=false;document.body.classList.remove('exporting');
    // A rendering failure must not strand the DOM in its export-disabled state.
    try {photoEditor.setBusy(false);render();}
    catch(error) {byId('pdf-progress').textContent=`Could not refresh after export: ${error.message}`;}
    finally {disabledBefore.forEach((disabled,control)=>{if(control.isConnected) control.disabled=disabled;});}
  }
});
byId('share-design').disabled=byId('import-design').disabled=!photoEditor.files;
for(const action of ['share-design','import-design']) byId(action).addEventListener('click',async()=>{
  if(busy||assets.pending||!photoEditor.files)return;
  if(action==='import-design'&&!window.confirm('Replace your current calendar design and photo assignments with this folder’s design?'))return;
  const controls=new Map([...document.querySelectorAll('main button,main input,main select,main textarea')].filter(control=>!control.closest('dialog')).map(control=>[control,control.disabled]));
  let staged;
  busy=true;
  try {
    photoEditor.setBusy(true);
    controls.forEach((_,control)=>{control.disabled=true;});
    if(action==='share-design') {
      if(document.querySelector('[aria-invalid="true"]'))throw new Error('Correct invalid settings before sharing.');
      byId('design-status').textContent='Packaging original images, fonts and design settings…';
      const blob=await shareDesign(structuredClone(state),assets.metadata(),photoEditor.files);
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`calendar-${state.year}-design.zip`;document.body.append(link);link.click();link.remove();
      const DOWNLOAD_URL_LIFETIME=60000;
      setTimeout(()=>URL.revokeObjectURL(url),DOWNLOAD_URL_LIFETIME);
      byId('design-status').textContent='Design ZIP download requested. Unzip it, then use Import design folder to open it.';
    } else {
      const grant=await photoEditor.files.requestDirectory({persistence:'persistent'});
      if(!grant){byId('design-status').textContent='Import cancelled. Your current design is unchanged.';return;}
      byId('design-status').textContent='Reading design, loading fonts and checking original images…';
      const imported=await readDesignFolder(grant,photoEditor.files);
      const candidate=migrateSavedState(imported.state);
      if(!valid(candidate))throw new Error('The imported document settings are invalid.');
      staged=await assets.prepareImport(imported.metadata,photoEditor.files);
      staged.commit();
      state={...DEFAULTS,...candidate};
      document.querySelectorAll('[aria-invalid="true"]').forEach(control=>control.removeAttribute('aria-invalid'));
      byId('error').textContent='';
      syncInputs();photoEditor.setTarget(state.previewClosed?'front-cover':`month-${state.month}`);render();save();
      await photoEditor.useFolder(grant);
      byId('design-status').textContent=`Design imported. The selected folder is now your image picker folder.${imported.warnings.length?' '+imported.warnings.join(' '):''}`;
    }
  } catch(error) {byId('design-status').textContent=`${action==='share-design'?'Share':'Import'} failed: ${error.message}`;}
  finally {
    staged?.dispose();busy=false;
    try {photoEditor.setBusy(false);render();}
    finally {controls.forEach((disabled,control)=>{if(control.isConnected)control.disabled=disabled;});}
  }
});
photoEditor.restore().then(()=>backCoverEditor.restore());
window.addEventListener('pagehide',()=>{backCoverEditor.dispose();printColorPanel.dispose();photoEditor.dispose();calendarScene.dispose();assets.dispose();});

// Restore disclosure preferences without changing document settings.
for (const [index, details] of [...document.querySelectorAll('details')].entries()) {
  const key=`panel:${details.id || index}`;
  const saved=readPreference(key,null);
  if(typeof saved==='boolean') details.open=saved;
  details.addEventListener('toggle',()=>writePreference(key,details.open));
}

mobileWorkspace=createMobileWorkspace(()=>state,view=>{state.view=view;render();save();});

if(customFontRestoreErrors.length) byId('error').textContent=customFontRestoreErrors.join(' ');
