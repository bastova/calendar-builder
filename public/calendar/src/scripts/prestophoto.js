import { printPages, readerState } from './layout.js';

const BLEED = .125;
const POINTS_PER_INCH = 72;
const PROFILE_SAMPLES = 4096;

/** Unknown and older saved targets retain the original assembly export. */
export function normalizePdfExportTarget(value) {
  return value === 'prestophoto' ? 'prestophoto' : 'assembly';
}

/** Derive upload geometry without modifying editor dimensions or binding selection. */
export function prestoPhotoExportState(state) {
  return {...readerState(state), pdfExportTarget:'prestophoto', bleed:BLEED, cropMarks:false};
}

/** Describe reader pages, not imposed sheets; only the verified 12-inch product is identified. */
export function prestoPhotoSummary(state) {
  const output=prestoPhotoExportState(state),pages=printPages(output).length;
  const supportedSize=output.width===12&&output.height===12;
  const notices=[
    'Reader-order pages, covers first and last; no booklet imposition or mandatory assembly padding.',
    '300 PPI target; source resolution and raster memory limits may reduce effective detail.',
    'Grid text is rasterized using browser fonts; no unembedded PDF core-font text is used.',
    'Review the uploaded proof and product requirements with PrestoPhoto; this is not certified vendor acceptance.'
  ];
  if(!supportedSize) notices.push('Only the 12 × 12 in trim / 12.25 × 12.25 in upload product has been verified. Confirm this custom size with PrestoPhoto before ordering.');
  if(pages<12||pages>100) notices.push('The verified 12 × 12 calendar requires 12–100 pages.');
  return {width:output.width,height:output.height,mediaWidth:output.width+2*BLEED,mediaHeight:output.height+2*BLEED,bleed:BLEED,pages,marks:false,slug:0,pdfVersion:'1.5',colorSpace:'sRGB',targetPpi:300,supportedSize,notices};
}

/** Build an independent matrix/TRC ICC v2 sRGB profile (D50 PCS, sampled IEC transfer curve). */
export function prestoPhotoSrgbProfile() {
  const signature=(bytes,offset,text)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);};
  const xyz=values=>{const bytes=new Uint8Array(20),view=new DataView(bytes.buffer);signature(bytes,0,'XYZ ');values.forEach((value,i)=>view.setInt32(8+i*4,Math.round(value*65536)));return bytes;};
  const curve=new Uint8Array(12+PROFILE_SAMPLES*2),cv=new DataView(curve.buffer);signature(curve,0,'curv');cv.setUint32(8,PROFILE_SAMPLES);
  for(let i=0;i<PROFILE_SAMPLES;i++){const x=i/(PROFILE_SAMPLES-1);cv.setUint16(12+2*i,Math.round((x<=.04045?x/12.92:((x+.055)/1.055)**2.4)*65535));}
  const text=value=>{const bytes=new Uint8Array(9+value.length);signature(bytes,0,'text');signature(bytes,8,value);return bytes;};
  const description='Calendar Builder sRGB';
  const desc=new Uint8Array(12+description.length+1+78),dv=new DataView(desc.buffer);signature(desc,0,'desc');dv.setUint32(8,description.length+1);signature(desc,12,description);
  const tags=[['desc',desc],['cprt',text('Public domain sRGB colorimetric definition')],['wtpt',xyz([.9642,1,.8249])],['rXYZ',xyz([.4360747,.2225045,.0139322])],['gXYZ',xyz([.3850649,.7168786,.0971045])],['bXYZ',xyz([.1430804,.0606169,.7141733])],['rTRC',curve],['gTRC',curve],['bTRC',curve]];
  let offset=132+tags.length*12;
  const size=offset+tags.reduce((sum,[,data])=>sum+Math.ceil(data.length/4)*4,0),bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
  view.setUint32(0,size);view.setUint32(8,0x02100000);signature(bytes,12,'mntrRGB XYZ ');view.setUint16(24,2026);view.setUint16(26,1);view.setUint16(28,1);signature(bytes,36,'acsp');view.setUint32(64,1);[.9642,1,.8249].forEach((value,i)=>view.setInt32(68+4*i,Math.round(value*65536)));view.setUint32(128,tags.length);
  tags.forEach(([name,data],i)=>{signature(bytes,132+12*i,name);view.setUint32(136+12*i,offset);view.setUint32(140+12*i,data.length);bytes.set(data,offset);offset+=Math.ceil(data.length/4)*4;});
  return bytes;
}

/** Install an ICC default RGB resource; fail closed if this jsPDF build lacks the required hooks. */
export function configurePrestoPhotoPdf(doc) {
  const internal=doc.internal;
  if(!doc.__private__?.setPdfVersion||!internal?.events?.subscribe||!internal.newObject||!internal.putStream||!internal.write) throw new Error('This jsPDF build cannot write the required PDF 1.5 / sRGB resources.');
  doc.__private__.setPdfVersion('1.5');
  let profileId, resourceHookInstalled=false;
  internal.events.subscribe('putResources',()=>{
    // addImage installs its resource subscribers lazily. Wait until output so
    // its /I* entries are written before we close the /XObject dictionary.
    if(!resourceHookInstalled) {
      internal.events.subscribe('putXobjectDict',()=>internal.write(`>> /ColorSpace << /DefaultRGB [/ICCBased ${profileId} 0 R] >> /PrestoPhotoResources <<`));
      resourceHookInstalled=true;
    }
    profileId=internal.newObject();
    const bytes=prestoPhotoSrgbProfile();let binary='';
    for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    internal.putStream({data:binary,additionalKeyValues:[{key:'N',value:3},{key:'Alternate',value:'/DeviceRGB'}]});internal.write('endobj');
  });
  // The late hook closes /XObject after image entries, adds sibling ColorSpace,
  // then opens an empty extension dictionary for jsPDF's closing delimiter.
}

/** Add trim/bleed metadata when available; absence never adds crop marks or a slug. */
export function prestoPhotoPageBoxes(doc,state) {
  const context=doc.internal?.getCurrentPageInfo?.()?.pageContext??doc.getCurrentPageInfo?.()?.pageContext;
  if(!context||!('trimBox' in context)||!('bleedBox' in context))return false;
  context.trimBox={bottomLeftX:BLEED*POINTS_PER_INCH,bottomLeftY:BLEED*POINTS_PER_INCH,topRightX:(state.width+BLEED)*POINTS_PER_INCH,topRightY:(state.height+BLEED)*POINTS_PER_INCH};
  context.bleedBox={bottomLeftX:0,bottomLeftY:0,topRightX:(state.width+2*BLEED)*POINTS_PER_INCH,topRightY:(state.height+2*BLEED)*POINTS_PER_INCH};
  return true;
}
