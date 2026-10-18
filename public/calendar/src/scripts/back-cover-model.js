import { FONT_CATALOG, FONT_LABELS } from './fonts.js';

export const BACK_POINTS = 72;
export const BACK_OBJECT_LIMIT = 40;
export const BACK_TEXT_LIMIT = 20000;
export const BACK_RUN_LIMIT = BACK_TEXT_LIMIT;
export const BACK_MIN_SIZE = .1;
export const BACK_MAX_SIZE = 48;
export const BACK_STYLE_LIMITS = Object.freeze({borderWidth:[0,12],paddingX:[0,144],paddingY:[0,144],radiusTL:[0,144],radiusTR:[0,144],radiusBL:[0,144],radiusBR:[0,144]});
export const BACK_CONTAINER_DEFAULTS = Object.freeze({background:'#ffffff',transparent:true,borderColor:'#aaaaaa',borderWidth:0,paddingX:0,paddingY:0,radiusTL:0,radiusTR:0,radiusBL:0,radiusBR:0,align:'inherit',vertical:'top'});
export const BACK_TEXT_FONT = Object.freeze({family:'helvetica',style:'normal',size:14,color:'#111111',align:'left'});
export const backBound = (value,fallback,min,max) => typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export const backColor = (value,fallback) => typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value)?value:fallback;
export const backImageKey = id => `back-object-${id}`;
export const isBackImageKey = key => typeof key==='string'&&/^back-object-[a-zA-Z0-9_-]{1,64}$/.test(key);
const choice = (value,options,fallback) => options.includes(value)?value:fallback;
const sameFont = (left,right) => ['family','style','size','color','align'].every(key=>left[key]===right[key]);

/** Normalize only approved font families/styles; saved text never supplies CSS or markup. */
export function normalizeBackFont(value,fallback=BACK_TEXT_FONT) {
  const family=Object.hasOwn(FONT_LABELS,value?.family)?value.family:fallback.family;
  const styles=FONT_CATALOG[family]?Object.keys(FONT_CATALOG[family].files):['normal','bold','italic','bolditalic'];
  return {family,style:choice(value?.style,styles,styles.includes(fallback.style)?fallback.style:'normal'),size:backBound(value?.size,fallback.size,4,144),color:backColor(value?.color,fallback.color),align:choice(value?.align,['left','center','right'],fallback.align)};
}

/** Shared monthly and custom container appearance, in print points. */
export function normalizeBackStyle(value,fallback=BACK_CONTAINER_DEFAULTS) {
  const result={background:backColor(value?.background,fallback.background),transparent:typeof value?.transparent==='boolean'?value.transparent:fallback.transparent,borderColor:backColor(value?.borderColor,fallback.borderColor),align:choice(value?.align,['inherit','left','center','right'],fallback.align),vertical:choice(value?.vertical,['inherit','top','middle','bottom'],fallback.vertical)};
  for(const [key,[min,max]] of Object.entries(BACK_STYLE_LIMITS))result[key]=backBound(value?.[key],fallback[key],min,max);
  return result;
}

/** Keep geometry finite, positive, nonrotating and independent of image crop coordinates. */
export function normalizeBackRect(value,fallback={x:.5,y:.5,width:3,height:1,aspectLocked:true}) {
  return {x:backBound(value?.x,fallback.x,-BACK_MAX_SIZE,BACK_MAX_SIZE),y:backBound(value?.y,fallback.y,-BACK_MAX_SIZE,BACK_MAX_SIZE),width:backBound(value?.width,fallback.width,BACK_MIN_SIZE,BACK_MAX_SIZE),height:backBound(value?.height,fallback.height,BACK_MIN_SIZE,BACK_MAX_SIZE),aspectLocked:value?.aspectLocked!==false};
}

/** Coalesce adjacent equal runs, cap imported text and discard all non-text payloads. */
export function normalizeBackRuns(value,fallback=BACK_TEXT_FONT) {
  const result=[];let remaining=BACK_TEXT_LIMIT;
  for(const source of (Array.isArray(value)?value:[]).slice(0,BACK_RUN_LIMIT)) {
    if(typeof source?.text!=='string'||!remaining)continue;
    const text=source.text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,remaining),font=normalizeBackFont(source.font,fallback);
    remaining-=text.length;if(!text)continue;
    if(result.length&&sameFont(result.at(-1).font,font))result.at(-1).text+=text;else result.push({text,font});
  }
  return result;
}

/** Range formatting uses textarea UTF-16 offsets, preserving every other character's styling. */
export function formatBackRuns(runs,start,end,patch,fallback=BACK_TEXT_FONT) {
  const normalized=normalizeBackRuns(runs,fallback),length=normalized.reduce((sum,run)=>sum+run.text.length,0);
  start=backBound(start,0,0,length);end=backBound(end,length,start,length);
  const result=[];let offset=0;
  for(const run of normalized) {
    const left=Math.max(0,start-offset),right=Math.min(run.text.length,end-offset);
    if(right>left){if(left)result.push({...run,text:run.text.slice(0,left)});result.push({text:run.text.slice(left,right),font:normalizeBackFont({...run.font,...patch},run.font)});if(right<run.text.length)result.push({...run,text:run.text.slice(right)});}
    else result.push(run);
    offset+=run.text.length;
  }
  return normalizeBackRuns(result,fallback);
}

/** Apply a plain-text edit while retaining runs on the unchanged prefix and suffix. */
export function replaceBackText(runs,text,fallback=BACK_TEXT_FONT,insertionFont=fallback) {
  const normalized=normalizeBackRuns(runs,fallback),previous=normalized.map(run=>run.text).join('');
  text=typeof text==='string'?text.slice(0,BACK_TEXT_LIMIT):'';
  let start=0,suffix=0;
  while(start<previous.length&&start<text.length&&previous[start]===text[start])start++;
  while(suffix<previous.length-start&&suffix<text.length-start&&previous[previous.length-1-suffix]===text[text.length-1-suffix])suffix++;
  const slice=(from,to)=>{let offset=0;return normalized.flatMap(run=>{const part=run.text.slice(Math.max(0,from-offset),Math.max(0,Math.min(run.text.length,to-offset)));offset+=run.text.length;return part?[{...run,text:part}]:[];});};
  const inserted=text.slice(start,text.length-suffix);
  return normalizeBackRuns([...slice(0,start),...(inserted?[{text:inserted,font:insertionFont}]:[]),...slice(previous.length-suffix,previous.length)],fallback);
}

/** Normalize bounded custom objects with unique stable asset identities. */
export function normalizeBackObjects(value) {
  const seen=new Set();
  return (Array.isArray(value)?value:[]).slice(0,BACK_OBJECT_LIMIT).flatMap((source,index)=>{
    if(!source||!['text','image'].includes(source.type))return [];
    let id=typeof source.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(source.id)?source.id:`object-${index+1}`;
    if(seen.has(id))return [];seen.add(id);
    const font=normalizeBackFont(source.font),object={id,type:source.type,name:typeof source.name==='string'?source.name.slice(0,120):`${source.type==='text'?'Text':'Image'} ${index+1}`,rect:normalizeBackRect(source.rect),style:normalizeBackStyle(source.style),font};
    if(source.type==='text')object.runs=normalizeBackRuns(source.runs??[{text:typeof source.text==='string'?source.text:'',font}],font);
    else object.crop={mode:choice(source.crop?.mode,['fit','fill'],'fill'),x:backBound(source.crop?.x,.5,0,1),y:backBound(source.crop?.y,.5,0,1),zoom:backBound(source.crop?.zoom,1,.1,16)};
    return [object];
  });
}

/** Inset content without allowing extreme padding to create negative drawing dimensions. */
export function backContentRect(box,style) {
  const x=Math.min(box.width/2,(style.paddingX+style.borderWidth/2)/BACK_POINTS),y=Math.min(box.height/2,(style.paddingY+style.borderWidth/2)/BACK_POINTS);
  return {x:box.x+x,y:box.y+y,width:Math.max(0,box.width-2*x),height:Math.max(0,box.height-2*y)};
}

/** Affine group resize preserves the disjoint card grid; configured type sizes stay in points. */
export function transformBackRect(box,from,to) {
  return {...box,x:to.x+(box.x-from.x)*to.width/from.width,y:to.y+(box.y-from.y)*to.height/from.height,width:box.width*to.width/from.width,height:box.height*to.height/from.height};
}

/** Resize opposite a corner or edge; a locked edge resize expands about the other axis's center. */
export function resizeBackRect(original,handle,dx,dy,preserveAspect=original.aspectLocked!==false) {
  if(handle==='move')return normalizeBackRect({...original,x:original.x+dx,y:original.y+dy},original);
  const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s');
  let width=Math.max(BACK_MIN_SIZE,original.width+(east?dx:west?-dx:0)),height=Math.max(BACK_MIN_SIZE,original.height+(south?dy:north?-dy:0));
  if(preserveAspect){const ratio=original.width/original.height;if((west||east)&&!(north||south))height=width/ratio;else if((north||south)&&!(west||east))width=height*ratio;else if(Math.abs(width/original.width-1)>=Math.abs(height/original.height-1))height=width/ratio;else width=height*ratio;const scale=Math.min(1,BACK_MAX_SIZE/width,BACK_MAX_SIZE/height);width*=scale;height*=scale;const minimum=Math.max(1,BACK_MIN_SIZE/width,BACK_MIN_SIZE/height);width*=minimum;height*=minimum;}
  const x=west?original.x+original.width-width:east?original.x:original.x+(original.width-width)/2,y=north?original.y+original.height-height:south?original.y:original.y+(original.height-height)/2;
  return normalizeBackRect({...original,x,y,width,height},original);
}

/** Exact source placement also instructs bounded original decoding for custom-image PDF export. */
export function backObjectImageMapping(object,metadata) {
  const box=backContentRect(object.rect,object.style),crop=object.crop;
  const scale=(crop.mode==='fit'?Math.min:Math.max)(box.width/metadata.sourceWidth,box.height/metadata.sourceHeight)*crop.zoom;
  const width=metadata.sourceWidth*scale,height=metadata.sourceHeight*scale;
  return {x:(box.width-width)*crop.x,y:(box.height-height)*crop.y,width,height,artworkWidth:box.width,artworkHeight:box.height};
}
