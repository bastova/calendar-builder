import { pdfSheetGeometry } from './pdf-geometry.js';
import { ASSET_KEYS, assetLabel, printPages, calendarLayout, SADDLE_IMPOSITION, saddlePage, readerState, validateSaddleImposition, normalizeEndSpreadColor } from './layout.js';
import { backCoverUsesImage, assets, effectiveDpi, photoHasGaps, picaAvailable, printRasterSpec, printPhotoCanvas, TARGET_PPI, drawPhoto } from './media.js';

import { printGeneratedBackCover, drawBackCover } from './back-cover.js';

const POINTS_PER_INCH = 72;
const MARK_SLUG = .25;
const MARK_GAP = .04;
const MARK_LENGTH = .16;
const JPEG_QUALITY = .94;
const URL_LIFETIME = 60000;
const breathe = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

/** Back art is optional only when absent; unavailable saved uploads must still fail preflight. */
export function requiredPhotoKeys(state) { return ASSET_KEYS.filter(key=>key!=='back-cover'||backCoverUsesImage(state)); }

/** Preflight the complete set; missing or permission-unavailable art is never silently omitted. */
export function preflight(state) {
  const required=requiredPhotoKeys(state),missing = required.filter(key => !assets.get(key)?.bitmap);
  const monthlyState=readerState(state);
  const low = required.filter(key => assets.get(key)?.bitmap && effectiveDpi(assets.get(key).metadata,key.startsWith('month-')?monthlyState:state)<TARGET_PPI)
    .map(key => `${assetLabel(key)} (${Math.floor(effectiveDpi(assets.get(key).metadata,key.startsWith('month-')?monthlyState:state))} DPI)`);
  const raster=printRasterSpec(state),resizingAvailable=picaAvailable();
  const gaps = required.filter(key => assets.get(key)?.bitmap && photoHasGaps(assets.get(key).metadata,key.startsWith('month-')?monthlyState:state));
  return {missing,low,gaps,required:required.length,backCoverMode:backCoverUsesImage(state)?'uploaded':'generated',pending:assets.pending,rasterPpi:Math.floor(Math.min(TARGET_PPI,raster.ppi)),raster,resizingAvailable,ready:missing.length===0 && assets.pending===0 && resizingAvailable};
}

function pageFormat(width,height) { return {orientation:width>height?'landscape':'portrait',unit:'in',format:[width,height],compress:true,precision:6}; }
function pageContext(doc) {
  return typeof doc.internal?.getCurrentPageInfo==='function' ? doc.internal.getCurrentPageInfo()?.pageContext : typeof doc.getCurrentPageInfo==='function' ? doc.getCurrentPageInfo()?.pageContext : null;
}
function supportsBoxes(doc) {
  const context = pageContext(doc);
  return context && 'trimBox' in context && 'bleedBox' in context;
}
function setBoxes(doc,state,slug) {
  const context=pageContext(doc), b=state.bleed;
  // jsPDF's verified pageContext box writer consumes raw PDF points, not document inches.
  const box=(x,y,width,height)=>({bottomLeftX:x*POINTS_PER_INCH,bottomLeftY:y*POINTS_PER_INCH,topRightX:(x+width)*POINTS_PER_INCH,topRightY:(y+height)*POINTS_PER_INCH});
  context.trimBox=box(slug+b,slug+b,state.width,state.height);
  context.bleedBox=box(slug,slug,state.width+2*b,state.height+2*b);
}
function cropMarks(doc,state,slug) {
  const aw=state.width+state.bleed*2,ah=state.height+state.bleed*2;
  const left=slug+state.bleed,right=left+state.width,top=slug+state.bleed,bottom=top+state.height;
  doc.setDrawColor(0);doc.setLineWidth(.25/POINTS_PER_INCH);
  for(const y of [top,bottom]) {
    doc.line(slug-MARK_GAP-MARK_LENGTH,y,slug-MARK_GAP,y);
    doc.line(slug+aw+MARK_GAP,y,slug+aw+MARK_GAP+MARK_LENGTH,y);
  }
  for(const x of [left,right]) {
    doc.line(x,slug-MARK_GAP-MARK_LENGTH,x,slug-MARK_GAP);
    doc.line(x,slug+ah+MARK_GAP,x,slug+ah+MARK_GAP+MARK_LENGTH);
  }
}
/** Export shared text placement as vector core-font text, never rasterized grid artwork. */
function vectorGrid(doc,state,month,offset) {
  const plan=calendarLayout(state,month),shift=offset+state.bleed;
  for(const rect of plan.rects) {doc.setFillColor(rect.color);doc.rect(shift+rect.x,shift+rect.y,rect.width,rect.height,'F');}
  if(plan.geometry.lineWidth>0) {
    doc.setDrawColor(plan.settings.lineColor);doc.setLineWidth(plan.geometry.lineWidth);
    for(const line of plan.lines) doc.line(shift+line.x1,shift+line.y1,shift+line.x2,shift+line.y2);
  }
  for(const item of plan.texts) {
    doc.setFont(item.font.family,item.font.style);doc.setFontSize(item.size*POINTS_PER_INCH);doc.setTextColor(item.color);
    doc.text(item.text,shift+item.x,shift+item.y,{align:'left',baseline:'alphabetic'});
  }
}
/** Encode only the saved photo crop through Pica; date grids remain vector artwork. */
async function photoArtwork(key,state,files,warnings,onProgress) {
  if(state.pdfPreview) {
    const canvas=document.createElement('canvas');
    const scale=900/Math.max(state.width,state.height);
    canvas.width=Math.round((state.width+2*state.bleed)*scale);canvas.height=Math.round((state.height+2*state.bleed)*scale);
    const context=canvas.getContext('2d'),record=key==='back-cover'&&!backCoverUsesImage(state)?null:assets.get(key);
    if(key==='back-cover'&&!record) drawBackCover(context,state,canvas.width,canvas.height,false,true);
    else if(record?.bitmap) drawPhoto(context,record.bitmap,record.metadata.crop,state,canvas.width,canvas.height,false,record.metadata);
    else {
      context.fillStyle='#f3f3f3';context.fillRect(0,0,canvas.width,canvas.height);
      context.fillStyle='#666';context.font='24px Arial';context.textAlign='center';
      context.fillText(assetLabel(key)+' — photo missing',canvas.width/2,canvas.height/2);
    }
    try {const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));return new Uint8Array(await blob.arrayBuffer());}
    finally {canvas.width=canvas.height=1;}
  }
  if(key==='back-cover'&&!backCoverUsesImage(state)) {
    let generated;
    try {
      generated=await printGeneratedBackCover(state,files,onProgress);
      warnings.push(...generated.warnings);
      if(generated.spec.ppi<TARGET_PPI) warnings.push(`Generated back cover: raster memory cap limits output to ${Math.floor(generated.spec.ppi)} PPI, not 300.`);
      onProgress('Generated back cover · encoding bounded RGB artwork and text…');
      const blob=await new Promise((resolve,reject)=>generated.canvas.toBlob(value=>value?resolve(value):reject(new Error('Generated back cover encoding failed.')),'image/jpeg',JPEG_QUALITY));
      return new Uint8Array(await blob.arrayBuffer());
    } finally {if(generated)generated.canvas.width=generated.canvas.height=1;}
  }
  const spec=printRasterSpec(state),record=key==='back-cover'&&!backCoverUsesImage(state)?null:assets.get(key);
  let bitmap,canvas;
  try {
    onProgress(`${assetLabel(key)} · rereading original and bounded decoding…`);
    bitmap=await assets.exportBitmap(key,files,state,spec.width,spec.height);
    const result=await printPhotoCanvas(bitmap,record.metadata,state,text=>onProgress(`${assetLabel(key)} · ${text}`));
    canvas=result.canvas;
    const availablePpi=Math.min(result.decodedPpi,effectiveDpi(record.metadata,state));
    if(availablePpi<Math.min(TARGET_PPI,spec.ppi)) warnings.push(`${assetLabel(key)}: original / bounded decode supplies ${Math.floor(availablePpi)} effective PPI; a ${spec.width} × ${spec.height} px print raster does not add detail.`);
    if(spec.ppi<TARGET_PPI) warnings.push(`${assetLabel(key)}: raster memory cap limits output to ${Math.floor(spec.ppi)} PPI (${spec.width} × ${spec.height} px), not 300.`);
    onProgress(`${assetLabel(key)} · encoding color photo…`);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Photo encoding failed.')),'image/jpeg',JPEG_QUALITY));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {bitmap?.close();if(canvas)canvas.width=canvas.height=1;}
}

async function photoPage(doc,key,state,files,offset,warnings,onProgress) {
  const jpeg=await photoArtwork(key,state,files,warnings,onProgress);
  doc.addImage(jpeg,'JPEG',offset,offset,state.width+2*state.bleed,state.height+2*state.bleed,undefined,'NONE');
}

/** Paint a full reader page inside its top/bottom imposition panel, never bleeding across the fold. */
function saddlePanel(doc,state,panelIndex,rotation,slug,paint) {
  const b=state.bleed,left=slug+b,top=slug+b,seam=top+state.height;
  doc.advancedAPI(pdf=>{
    pdf.saveGraphicsState();
    pdf.rect(slug,panelIndex===0?slug:seam,state.width+2*b,state.height+b,null);
    pdf.clip();pdf.discardPath();
    const matrix=rotation===180 ? new pdf.Matrix(-1,0,0,-1,left+state.width,top+state.height) : new pdf.Matrix(1,0,0,1,left,seam);
    pdf.setCurrentTransformationMatrix(matrix);
    paint(pdf);
    pdf.restoreGraphicsState();
  });
}



/** Fold registration ticks and side identification stay entirely in the optional outer slug. */
function saddleMarks(doc,state,slug,side,index) {
  const spreadState={...state,height:state.height*2};
  cropMarks(doc,spreadState,slug);
  const seam=slug+state.bleed+state.height,aw=state.width+2*state.bleed;
  doc.setDrawColor(0);doc.setLineWidth(.25/POINTS_PER_INCH);
  doc.line(slug-MARK_GAP-MARK_LENGTH,seam,slug-MARK_GAP,seam);
  doc.line(slug+aw+MARK_GAP,seam,slug+aw+MARK_GAP+MARK_LENGTH,seam);
  doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(0);
  doc.text(`Sheet ${side.sheet} ${side.side} · PDF ${index+1} · TOP p${side.pages[0]} 180 deg / BOTTOM p${side.pages[1]} 0 deg`,slug+aw/2,slug-MARK_GAP,{align:'center'});
}

async function downloadSaddlePdf(doc,state,files,onProgress,check,slug,boxes) {
  validateSaddleImposition(state.year);
  const sides=SADDLE_IMPOSITION.flatMap((sheet,index)=>[
    {sheet:index+1,side:'A',pages:sheet.front,rotations:sheet.rotations},
    {sheet:index+1,side:'B',pages:sheet.reverse,rotations:sheet.rotations}
  ]);
  const warnings=[],spreadState={...state,height:state.height*2},gridState={...readerState(state),bleed:0};
  if(check.gaps.length) warnings.push(`White-gap warning: ${check.gaps.map(assetLabel).join(', ')} do not cover the full reader page and bleed; uncovered areas were printed white.`);
  if(!boxes) warnings.push('PDF page-box API unavailable: explicit trim/fold marks and 0.25 in outer slug were used; no TrimBox/BleedBox metadata claimed.');
  const mediaWidth=state.width+2*state.bleed,mediaHeight=state.height*2+2*state.bleed;
  doc.setProperties({title:`${state.year} Photo Calendar — top-bound saddle-stitch imposition`,subject:'32 logical reader pages, 16 imposed PDF sides, 8 folded sheets: 1 cover-stock sheet plus 7 interior sheets. Solid opening p2/p3 and closing p28–31; shared end-spread color includes both inside covers. Horizontal centerfold; upper panels 180 degrees, lower panels 0 degrees. RGB, not PDF/X or ICC-converted.',creator:'Calendar Builder'});
  for(let index=0;index<sides.length;index++) {
    const side=sides[index];
    if(index) doc.addPage([mediaWidth+2*slug,mediaHeight+2*slug],mediaWidth>mediaHeight?'landscape':'portrait');
    if(boxes) setBoxes(doc,spreadState,slug);
    onProgress(`Rendering sheet ${side.sheet} · Side ${side.side} · PDF ${index+1} / 16 · ${side.sheet===1?'cover':'interior'} stock`);
    await breathe();
    for(let panelIndex=0;panelIndex<2;panelIndex++) {
      const page=saddlePage(side.pages[panelIndex],state.year);
      const jpeg=page.kind==='photo' ? await photoArtwork(page.key,state,files,warnings,onProgress) : null;
      saddlePanel(doc,state,panelIndex,side.rotations[panelIndex],slug,pdf=>{
        if(jpeg) pdf.addImage(jpeg,'JPEG',-state.bleed,-state.bleed,state.width+2*state.bleed,state.height+2*state.bleed,undefined,'NONE');
        else if(page.kind==='solid') {pdf.setFillColor(normalizeEndSpreadColor(state.endSpreadColor));pdf.rect(-state.bleed,-state.bleed,state.width+2*state.bleed,state.height+2*state.bleed,'F');}
        else if(page.kind==='grid') vectorGrid(pdf,gridState,page.month,0);
      });
    }
    if(state.cropMarks||!boxes) saddleMarks(doc,state,slug,side,index);
  }
  if(doc.getNumberOfPages()!==16) throw new Error('Unexpected saddle-stitch PDF page count; download cancelled.');
  onProgress('Packaging 16 imposed sides / 8 folded sheets…');await breathe();
  if(state.pdfPreview) return {blob:doc.output('blob'),pages:16,warnings,filename:`photo-calendar-${state.year}-preview.pdf`};
  const blob=doc.output('blob'),url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`photo-calendar-${state.year}-saddle-stitched-16-pages.pdf`;document.body.append(anchor);
  try {anchor.click();} finally {anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),URL_LIFETIME);}
  return {pages:16,logicalPages:32,physicalSheets:8,coverSheets:1,interiorSheets:7,mediaWidth:mediaWidth+2*slug,mediaHeight:mediaHeight+2*slug,boxes,marks:state.cropMarks||!boxes,warnings};
}

/** Build one complete 30-page duplex assembly PDF, without screenshots or UI art. */
export async function downloadCalendarPdf(state,files,onProgress,{preview=false}={}) {
  state={...state,pdfPreview:preview};
  if(!preview&&!files) throw new Error('Local photo directory access is unavailable.');
  const Constructor=window.jspdf?.jsPDF;
  if(typeof Constructor!=='function') throw new Error('PDF dependency unavailable. Reopen the Proof with access to its approved jsPDF CDN script.');
  const check=preflight(state);
  if(!preview&&!check.resizingAvailable) throw new Error('Pica 10.0.3 is unavailable. Photo assignment and PDF export require the approved Pica script.');
  if(check.pending) throw new Error('Wait for photo restoration / assignment / resizing to finish.');
  if(!preview&&!check.ready) throw new Error(`Missing photographs: ${check.missing.map(assetLabel).join(', ')}.`);
  state=Object.freeze({...state});
  assets.beginExport();
  try {
  const aw=state.width+2*state.bleed,ah=state.height+2*state.bleed;
  const pdfWidth=aw,pdfHeight=state.bindingStyle==='saddle'?state.height*2+2*state.bleed:ah;
  let doc=new Constructor(pageFormat(pdfWidth,pdfHeight));
  const boxes=Boolean(supportsBoxes(doc)),geometry=pdfSheetGeometry(state,boxes),marks=state.cropMarks||!boxes,slug=geometry.slug;
  if(slug) doc=new Constructor(pageFormat(pdfWidth+2*slug,pdfHeight+2*slug));
  const grants=preview?[]:await files.getGrants();
  const denied=(preview?[]:requiredPhotoKeys(state)).filter(key=>!grants.some(grant=>grant.available&&grant.grantId===assets.get(key).metadata.grantId));
  if(denied.length) throw new Error(`Folder permissions unavailable: ${denied.map(assetLabel).join(', ')}. Reselect and reassign these images.`);
  if(state.bindingStyle==='saddle') return await downloadSaddlePdf(doc,state,files,onProgress,check,slug,boxes);
  const pages=printPages(),warnings=[];
  if(check.gaps.length) warnings.push(`White-gap warning: ${check.gaps.map(assetLabel).join(', ')} do not cover the full page and bleed; uncovered areas were printed white.`);
  if(!boxes) warnings.push('PDF page-box API unavailable: explicit trim crop marks and 0.25 in outer slug were used; no TrimBox/BleedBox metadata claimed.');
  doc.setProperties({title:`${state.year} Photo Calendar — complete duplex layout`,subject:'30 pages in physical assembly order. Solid opening p2/p3 and closing p28/p29; shared end-spread color includes both inside covers. Printer review required; RGB, not PDF/X or ICC-converted.',creator:'Calendar Builder'});
  for(let index=0;index<pages.length;index++) {
    if(index) doc.addPage([aw+2*slug,ah+2*slug],aw>ah?'landscape':'portrait');
    if(boxes) setBoxes(doc,state,slug);
    const page=pages[index];onProgress(`Rendering page ${index+1} / ${pages.length} · ${page.label}`);
    await breathe();
    if(page.kind==='photo') await photoPage(doc,page.key,state,files,slug,warnings,onProgress);
    else if(page.kind==='solid') {doc.setFillColor(normalizeEndSpreadColor(state.endSpreadColor));doc.rect(slug,slug,aw,ah,'F');}
    else if(page.kind==='grid') vectorGrid(doc,state,page.month,slug);
    if(marks) cropMarks(doc,state,slug);
  }
  if(doc.getNumberOfPages()!==30) throw new Error('Unexpected PDF page count; download cancelled.');
  onProgress('Packaging the complete PDF…');await breathe();
  if(preview) return {blob:doc.output('blob'),pages:30,warnings,filename:`photo-calendar-${state.year}-preview.pdf`};
  const blob=doc.output('blob');
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`photo-calendar-${state.year}-complete-30-pages.pdf`;document.body.append(anchor);
  try {anchor.click();} finally {anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),URL_LIFETIME);}
  doc=null;
  return {pages:30,mediaWidth:aw+2*slug,mediaHeight:ah+2*slug,boxes,marks,warnings};
  } finally { assets.endExport(); }
}
