import { readPreference, writePreference } from './browser-storage.js';
import { MONTHS, normalizeLayout, normalizeArtworkMetadata, canvasFont, readerState } from './layout.js';
import { assets, FILE_LIMIT, isPhotoEntry, safeRelativePath, drawPhoto, printRasterSpec, CENTER_CROP, cropForPlacement, photoPlacement, picaAvailable, resizeImageBitmapToCanvas } from './media.js';

const BACK_PREVIEW_MAX_EDGE = 4096;
const BACK_PREVIEW_MAX_PIXELS = 16 * 1024 * 1024;
const LIST_LIMIT = 50;
const POINTS_PER_INCH = 72;
const LINE_HEIGHT = 1.35;
const TEXT_GUARD = 1.15;
const MONTH_COUNT = 12;
const THUMBNAIL_PREVIEW_EDGE = 500;
const THUMBNAIL_ZOOM_MAX = 4;
const MARGIN_EXTRA_SHARE = .7;
const GAP_SHARE = .35;
const PADDING_SHARE = .2;
const MINI_OVERSAMPLE = 2;
const MINI_MAX_EDGE = 6000;
const MINI_MAX_PIXELS = 20 * 1024 * 1024;
const CROP_MODES = ['monthly','fill','fit'];
const NUMBER_FIELDS = Object.freeze({columns:[1,6],marginTop:[0,12],marginRight:[0,12],marginBottom:[0,12],marginLeft:[0,12],gapX:[0,2],gapY:[0,2],padding:[0,1],imageShare:[.15,.85]});
const THUMBNAIL_DEFAULTS = Object.freeze({mode:'inherit',x:.5,y:.5,zoom:1});
export const BACK_COVER_DEFAULTS = Object.freeze({version:2,columns:3,marginTop:.5,marginRight:.5,marginBottom:.5,marginLeft:.5,gapX:.15,gapY:.15,padding:.06,placement:'top',imageShare:.62,alignX:'center',alignY:'top',cropMode:'monthly',background:'#ffffff',cellBackground:'#f5f5f5',cellFill:false});
const byId = id => document.getElementById(id);
const bounded = (value,fallback,min,max) => Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const validColor = (value,fallback) => typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const positionFraction = (value,axis) => value==='center'||value==='middle'?.5:value===(axis==='x'?'right':'bottom')?1:0;
const frameAnchor = (focal,baseline) => focal<=.5?baseline*focal*2:baseline+(1-baseline)*(focal-.5)*2;

/** Migrate the old shared gap and bound all independent generated layout and thumbnail settings. */
export function normalizeBackCover(value) {
  const result={...BACK_COVER_DEFAULTS,thumbnails:{}};
  for(const [key,[min,max]] of Object.entries(NUMBER_FIELDS)) result[key]=bounded(value?.[key]??(key==='gapX'||key==='gapY'?value?.gap:undefined),BACK_COVER_DEFAULTS[key],min,max);
  result.columns=Math.round(result.columns);
  for(const [key,options] of Object.entries({placement:['left','right','top','bottom'],alignX:['left','center','right'],alignY:['top','middle','bottom'],cropMode:CROP_MODES})) result[key]=options.includes(value?.[key])?value[key]:BACK_COVER_DEFAULTS[key];
  for(const key of ['background','cellBackground'])result[key]=validColor(value?.[key],BACK_COVER_DEFAULTS[key]);
  result.cellFill=value?.cellFill===true;
  MONTHS.forEach((_,month)=>{const key=`month-${month}`,source=value?.thumbnails?.[key];result.thumbnails[key]={mode:['inherit',...CROP_MODES].includes(source?.mode)?source.mode:THUMBNAIL_DEFAULTS.mode,x:bounded(source?.x,.5,0,1),y:bounded(source?.y,.5,0,1),zoom:bounded(source?.zoom,1,1,THUMBNAIL_ZOOM_MAX)};});
  return result;
}

/** Describe derived mode, effective geometry and constraints without discarding unavailable uploads. */
export function backCoverStatus(state) {
  const record=assets.get('back-cover'),missing=MONTHS.flatMap((_,month)=>assets.get(`month-${month}`)?.bitmap?[]:[MONTHS[month]]),plan=backCoverPlan(state);
  return {mode:record?'uploaded':'generated',uploadedAvailable:Boolean(record?.bitmap),missingMonths:missing,ready:record?Boolean(record.bitmap):missing.length===0,settings:plan.settings,effective:plan.effective,notices:plan.notices,textPrinted:!record,thumbnailCropsIndependent:true,chronologicalMonths:MONTHS,raster:printRasterSpec(state)};
}

/** Keep all twelve chronological cards disjoint, even with extreme page shapes and requested spacing. */
export function backCoverPlan(state) {
  const settings=normalizeBackCover(state.backCover),columns=settings.columns,rows=Math.ceil(MONTH_COUNT/columns),notices=[];
  const safe={left:state.margin,right:state.margin,top:Math.max(state.margin,readerState(state).binding),bottom:state.margin};
  const margins={};
  for(const side of ['left','right','top','bottom']) {const key=`margin${side[0].toUpperCase()}${side.slice(1)}`;margins[side]=Math.max(safe[side],settings[key]);if(settings[key]<safe[side])notices.push(`${side} margin raised to the ${safe[side].toFixed(2)} in print-safe / binding floor.`);}
  for(const [a,b,total] of [['left','right',state.width],['top','bottom',state.height]]) {
    const budget=total-safe[a]-safe[b],extra=margins[a]+margins[b]-safe[a]-safe[b],scale=extra?Math.min(1,budget*MARGIN_EXTRA_SHARE/extra):1;
    if(scale<1){margins[a]=safe[a]+(margins[a]-safe[a])*scale;margins[b]=safe[b]+(margins[b]-safe[b])*scale;notices.push(`${a} / ${b} margins reduced to leave at least 30% of the safe area for cards.`);}
  }
  const usableWidth=state.width-margins.left-margins.right,usableHeight=state.height-margins.top-margins.bottom;
  const gapX=columns>1?Math.min(settings.gapX,usableWidth*GAP_SHARE/(columns-1)):0,gapY=rows>1?Math.min(settings.gapY,usableHeight*GAP_SHARE/(rows-1)):0;
  if(columns>1&&gapX<settings.gapX)notices.push('Horizontal gaps reduced to retain usable card width.');
  if(rows>1&&gapY<settings.gapY)notices.push('Vertical gaps reduced to retain usable card height.');
  const cardWidth=(usableWidth-gapX*(columns-1))/columns,cardHeight=(usableHeight-gapY*(rows-1))/rows;
  const padding=Math.min(settings.padding,cardWidth*PADDING_SHARE,cardHeight*PADDING_SHARE),innerWidth=cardWidth-2*padding,innerHeight=cardHeight-2*padding;
  if(padding<settings.padding)notices.push('Card padding reduced to at most 20% of each card dimension.');
  const labelHeight=Math.min(.22,innerHeight*.12),bodyHeight=innerHeight-labelHeight,contentGap=Math.min(padding,bodyHeight*.08,innerWidth*.08),horizontal=['left','right'].includes(settings.placement);
  const photoWidth=horizontal?(innerWidth-contentGap)*settings.imageShare:innerWidth,photoHeight=horizontal?bodyHeight-contentGap:(bodyHeight-contentGap)*settings.imageShare;
  const textWidth=horizontal?innerWidth-contentGap-photoWidth:innerWidth,textHeight=horizontal?photoHeight:bodyHeight-contentGap-photoHeight;
  const metadata=normalizeArtworkMetadata(state.artworkMetadata),fonts=normalizeLayout(state.layout).fonts;
  const cards=MONTHS.map((name,month)=>{
    const x=margins.left+(month%columns)*(cardWidth+gapX),y=margins.top+Math.floor(month/columns)*(cardHeight+gapY),bodyX=x+padding,bodyY=y+padding+labelHeight;
    const photo={x:bodyX,y:bodyY,width:photoWidth,height:photoHeight},text={x:bodyX,y:bodyY,width:textWidth,height:textHeight};
    if(settings.placement==='left')text.x+=photoWidth+contentGap;
    if(settings.placement==='right')photo.x+=textWidth+contentGap;
    if(settings.placement==='top')text.y+=photoHeight+contentGap;
    if(settings.placement==='bottom')photo.y+=textHeight+contentGap;
    return {key:`month-${month}`,month,name,x,y,width:cardWidth,height:cardHeight,padding,labelHeight,label:{x:bodyX,y:y+padding,width:innerWidth,height:labelHeight},photo,text,metadata:metadata[`month-${month}`],thumbnail:settings.thumbnails[`month-${month}`]};
  });
  if(photoWidth<.25||photoHeight<.25||textWidth<.3||textHeight<.25)notices.push('Very small image or caption area: choose fewer columns, smaller margins/gaps, or a different image position/proportion. Text still fits and clips within its own box.');
  return {settings,fonts,cards,notices,effective:{columns,rows,margins,gapX,gapY,padding,cardWidth,cardHeight,photoWidth,photoHeight,textWidth,textHeight}};
}

/** Exact original-source placement used for both screen draw and original-file export sampling. */
export function backThumbnailMapping(state,card,metadata,settings=normalizeBackCover(state.backCover)) {
  const thumbnail=card.thumbnail,mode=thumbnail.mode==='inherit'?settings.cropMode:thumbnail.mode,box=card.photo;
  const anchorX=frameAnchor(thumbnail.x,positionFraction(settings.alignX,'x')),anchorY=frameAnchor(thumbnail.y,positionFraction(settings.alignY,'y'));
  let placement,clip={x:0,y:0,width:box.width,height:box.height};
  if(mode==='monthly') {
    const factor=Math.min(box.width/state.width,box.height/state.height)*thumbnail.zoom;
    const width=state.width*factor,height=state.height*factor;
    // Global alignment positions the monthly frame; per-month focal controls pan its zoomed view.
    const x=(box.width-width)*anchorX,y=(box.height-height)*anchorY;
    clip={x,y,width,height};
    const monthly=photoPlacement(metadata.sourceWidth,metadata.sourceHeight,metadata.crop,readerState(state));
    placement={x:x+(monthly.x-state.bleed)*factor,y:y+(monthly.y-state.bleed)*factor,width:monthly.width*factor,height:monthly.height*factor};
  } else {
    const factor=(mode==='fill'?Math.max:Math.min)(box.width/metadata.sourceWidth,box.height/metadata.sourceHeight)*thumbnail.zoom;
    const width=metadata.sourceWidth*factor,height=metadata.sourceHeight*factor;
    placement={x:(box.width-width)*anchorX,y:(box.height-height)*anchorY,width,height};
  }
  return {...placement,artworkWidth:box.width,artworkHeight:box.height,clip,mode};
}

function wrappedLines(context,text,font,width,height,maxLines) {
  let size=font.size/POINTS_PER_INCH,lines=[];
  const fits=value=>context.measureText(value).width*TEXT_GUARD<=width;
  const wrap=()=>{
    context.font=canvasFont(font,size);const result=[];let line='';
    for(const word of String(text).trim().split(/\s+/u).filter(Boolean)) {
      if(fits(line?`${line} ${word}`:word)){line=line?`${line} ${word}`:word;continue;}
      if(line){result.push(line);line='';}
      if(fits(word))line=word;
      else for(const char of word){if(line&&!fits(line+char)){result.push(line);line='';}line+=char;}
    }
    if(line)result.push(line);return result;
  };
  lines=wrap();
  size=Math.min(size,height/(LINE_HEIGHT*Math.max(1,Math.min(maxLines,lines.length))));
  lines=wrap();
  const count=Math.max(1,Math.min(maxLines,Math.floor((height+.000001)/(size*LINE_HEIGHT)))),visible=lines.slice(0,count);
  if(lines.length>count&&visible.length){let last=visible[visible.length-1];while(last&&!fits(`${last}…`))last=last.slice(0,-1);visible[visible.length-1]=`${last}…`;}
  return {size,lines:visible};
}

function textBlock(context,text,font,box,maxLines) {
  if(!text||box.width<=0||box.height<=0)return;
  context.save();context.beginPath();context.rect(box.x,box.y,box.width,box.height);context.clip();
  const {size,lines}=wrappedLines(context,text,font,box.width,box.height,maxLines);
  context.fillStyle=font.color;context.textBaseline='alphabetic';context.textAlign=font.align;
  const x=box.x+(font.align==='right'?box.width:font.align==='center'?box.width/2:0);
  lines.forEach((line,index)=>context.fillText(line,x,box.y+size*(1.05+index*LINE_HEIGHT),box.width));
  context.restore();
}

function drawMini(context,state,card,bitmap,metadata,settings) {
  const mapping=backThumbnailMapping(state,card,metadata,settings);
  context.save();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.translate(card.photo.x,card.photo.y);
  context.fillStyle='#ffffff';context.fillRect(0,0,card.photo.width,card.photo.height);
  context.beginPath();context.rect(0,0,card.photo.width,card.photo.height);context.clip();
  // A monthly source is additionally clipped to its saved trim page, preserving white gaps.
  context.beginPath();context.rect(mapping.clip.x,mapping.clip.y,mapping.clip.width,mapping.clip.height);context.clip();
  context.drawImage(bitmap,mapping.x,mapping.y,mapping.width,mapping.height);
  context.restore();
}

function drawCaptions(context,card,plan) {
  const blocks=[['title','artworkTitle',2],['artist','artist',2],['description','description',4]].filter(([field])=>card.metadata[field]?.trim());
  if(!blocks.length)return;
  const gap=Math.min(card.padding,card.text.height*.03),available=card.text.height-gap*(blocks.length-1);
  const weights=blocks.map(([field,role,maxLines])=>{
    const font=plan.fonts[role],wrapped=wrappedLines(context,card.metadata[field],font,card.text.width,Number.MAX_SAFE_INTEGER,maxLines);
    return Math.max(1,wrapped.lines.length)*font.size/POINTS_PER_INCH*LINE_HEIGHT;
  });
  const total=weights.reduce((sum,value)=>sum+value,0),scale=Math.min(1,available/total),used=total*scale+gap*(blocks.length-1);
  let y=card.text.y+(card.text.height-used)*positionFraction(plan.settings.alignY,'y');
  blocks.forEach(([field,role,maxLines],index)=>{
    const height=weights[index]*scale;
    textBlock(context,card.metadata[field],{...plan.fonts[role],size:plan.fonts[role].size*scale},{...card.text,y,height},maxLines);
    y+=height+gap;
  });
}

function beginArtwork(context,state,width,height,trim) {
  context.save();context.scale(width/(state.width+(trim?0:2*state.bleed)),height/(state.height+(trim?0:2*state.bleed)));
  if(!trim)context.translate(state.bleed,state.bleed);
}

/** Shared flat / 3D / PDF artwork, with bounded captions and independent thumbnail transforms. */
export function drawBackCover(context,state,width,height,trim=true,previewPhotos=true) {
  const uploaded=assets.get('back-cover');
  if(uploaded?.bitmap) {drawPhoto(context,uploaded.bitmap,uploaded.metadata.crop,state,width,height,trim,uploaded.metadata);return;}
  const plan=backCoverPlan(state);
  beginArtwork(context,state,width,height,trim);
  context.fillStyle=plan.settings.background;context.fillRect(-state.bleed,-state.bleed,state.width+2*state.bleed,state.height+2*state.bleed);
  if(uploaded) {
    textBlock(context,'Uploaded back cover unavailable — reselect its folder or remove the upload to use the generated cover.',{family:'helvetica',style:'normal',size:14,color:'#555555',align:'center'},{x:state.margin,y:state.height*.4,width:state.width-2*state.margin,height:state.height*.2},3);
  } else for(const card of plan.cards) {
    const record=assets.get(card.key);
    if(plan.settings.cellFill){context.fillStyle=plan.settings.cellBackground;context.fillRect(card.x,card.y,card.width,card.height);}
    textBlock(context,card.name,{family:'helvetica',style:'bold',size:9,color:plan.fonts.artist.color,align:plan.settings.alignX},card.label,1);
    if(previewPhotos&&record?.bitmap) drawMini(context,state,card,record.bitmap,record.metadata,plan.settings);
    else {
      context.fillStyle=previewPhotos?'#eeeeee':'#ffffff';context.fillRect(card.photo.x,card.photo.y,card.photo.width,card.photo.height);
      if(previewPhotos)textBlock(context,'Photo missing',{family:'helvetica',style:'normal',size:9,color:'#555555',align:'center'},card.photo,2);
    }
    drawCaptions(context,card,plan);
  }
  context.restore();return plan;
}

/** Reread originals sequentially using the exact thumbnail mapping, then Pica-resample each clipped image. */
export async function printGeneratedBackCover(state,files,onProgress=()=>{}) {
  const spec=printRasterSpec(state),canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
  try {
    const context=canvas.getContext('2d'),plan=drawBackCover(context,state,canvas.width,canvas.height,false,false),warnings=plan.notices.map(notice=>`Generated back cover: ${notice}`);
    for(const card of plan.cards) {
      let bitmap,work,resized;
      try {
        onProgress(`Generated back cover · ${card.name} thumbnail from original…`);
        const record=assets.get(card.key),mapping=backThumbnailMapping(state,card,record.metadata,plan.settings);
        const targetWidth=Math.max(1,Math.ceil(card.photo.width*spec.ppi)),targetHeight=Math.max(1,Math.ceil(card.photo.height*spec.ppi));
        bitmap=await assets.exportBitmap(card.key,files,readerState(state),targetWidth,targetHeight,mapping);
        const detail=Math.min(bitmap.width/mapping.width,bitmap.height/mapping.height),required=Math.min(spec.ppi,300);
        if(detail<required)warnings.push(`${card.name} back thumbnail: bounded original decode supplies about ${Math.floor(detail)} PPI; resizing adds no detail.`);
        const factor=Math.max(1,Math.min(MINI_OVERSAMPLE,detail/spec.ppi,MINI_MAX_EDGE/Math.max(targetWidth,targetHeight),Math.sqrt(MINI_MAX_PIXELS/(targetWidth*targetHeight))));
        work=document.createElement('canvas');work.width=Math.max(1,Math.floor(targetWidth*factor));work.height=Math.max(1,Math.floor(targetHeight*factor));
        const miniContext=work.getContext('2d');miniContext.scale(work.width/card.photo.width,work.height/card.photo.height);
        drawMini(miniContext,state,{...card,photo:{...card.photo,x:0,y:0}},bitmap,record.metadata,plan.settings);
        onProgress(`Generated back cover · ${card.name} Pica thumbnail resize…`);
        resized=await resizeImageBitmapToCanvas(work,targetWidth,targetHeight);
        beginArtwork(context,state,canvas.width,canvas.height,false);
        context.drawImage(resized,card.photo.x,card.photo.y,card.photo.width,card.photo.height);context.restore();
      } finally {bitmap?.close();if(work)work.width=work.height=1;if(resized)resized.width=resized.height=1;}
    }
    return {canvas,spec,warnings};
  } catch(error) {canvas.width=canvas.height=1;throw error;}
}

/** Independent back-cover picker uses documented persistent folder grants, never fake File references. */
export function createBackCoverEditor(getState,onSettingsChange,isBusy=()=>false) {
  const files=window.Bezi?.files,available=files&&['requestDirectory','getGrants','list','stat','readBytes'].every(method=>typeof files[method]==='function')&&typeof createImageBitmap==='function'&&picaAvailable();
  const canvas=byId('back-cover-preview'),context=canvas.getContext('2d'),zoomViewport=byId('back-cover-zoom-viewport'),zoomStage=byId('back-cover-zoom-stage'),zoomOut=byId('back-cover-zoom-out'),zoomIn=byId('back-cover-zoom-in'),zoomFit=byId('back-cover-zoom-fit'),zoomRange=byId('back-cover-zoom-range'),zoomValue=byId('back-cover-zoom-value'),thumbnailCanvas=byId('back-thumbnail-preview'),thumbnailContext=thumbnailCanvas.getContext('2d');
  let grants=[],grant=null,folder='',offset=0,total=0,token=0,notice='',disposed=false,previewZoom=1,previewInitialized=false;
  previewZoom=bounded(readPreference('back-zoom',1),1,.25,4);
  const locked=()=>isBusy()||assets.pending>0;
  const status=text=>{notice=text;byId('back-cover-message').textContent=text;};
  const controls=[];
  let fieldNotice='',thumbnailMonth=Math.round(bounded(readPreference('thumbnail-month',getState().month),getState().month,0,11));
  const changePreviewZoom=value=>{if(locked())return;previewZoom=bounded(value,previewZoom,.25,4);writePreference('back-zoom',previewZoom);render();};
  zoomOut.addEventListener('click',()=>changePreviewZoom(previewZoom-.25));
  zoomIn.addEventListener('click',()=>changePreviewZoom(previewZoom+.25));
  zoomRange.addEventListener('input',()=>changePreviewZoom(Number(zoomRange.value)/100));
  zoomFit.addEventListener('click',()=>{if(locked())return;previewZoom=1;writePreference('back-zoom',1);render();zoomViewport.scrollLeft=0;zoomViewport.scrollTop=0;});
  const previewResizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>render()):null;
  previewResizeObserver?.observe(zoomViewport);
  const optionList=entries=>entries.map(value=>Array.isArray(value)?value:[value,value[0].toUpperCase()+value.slice(1)]);
  const generatedFields=[
    ['columns','Columns / automatic rows','select',Array.from({length:6},(_,index)=>[index+1,`${index+1} columns × ${Math.ceil(MONTH_COUNT/(index+1))} rows`])],
    ['marginTop','Top margin · in','number'],['marginRight','Right margin · in','number'],['marginBottom','Bottom margin · in','number'],['marginLeft','Left margin · in','number'],
    ['gapX','Horizontal card gap · in','number'],['gapY','Vertical card gap · in','number'],['padding','Card padding · in','number'],
    ['placement','Image relative to captions','select',optionList(['left','right','top','bottom'])],['imageShare','Image share of split · %','number'],
    ['alignX','Frame horizontal alignment','select',optionList(['left','center','right'])],['alignY','Frame / captions vertical alignment','select',optionList(['top','middle','bottom'])],
    ['cropMode','Global thumbnail source / framing','select',[['monthly','Saved monthly trim · preserve page'],['fill','Original source · fill thumbnail'],['fit','Original source · fit whole image']]],
    ['background','Cover background','color'],['cellBackground','Card background color','color'],['cellFill','Use card background','checkbox']
  ];
  function numericDraft(control,min,max) {
    const value=control.valueAsNumber;
    if(!Number.isFinite(value)){fieldNotice='Enter a number; the last saved setting remains applied.';renderConstraints();return null;}
    const clamped=Math.max(min,Math.min(max,value));
    fieldNotice=clamped!==value?`Input limited to ${min}–${max}. Requested geometry may be fitted further to protect print safety.`:'';
    if(clamped!==value)control.value=String(clamped);
    return clamped;
  }
  for(const [key,labelText,type,options] of generatedFields) {
    const label=document.createElement('label'),control=document.createElement(type==='select'?'select':'input');
    control.id=`back-cover-${key}`;control.dataset.backControl='';label.htmlFor=control.id;label.append(document.createTextNode(labelText));
    if(options)for(const [value,text] of options){const option=document.createElement('option');option.value=String(value);option.textContent=text;control.append(option);}
    else {
      control.type=type;
      if(type==='number'){const bounds=key==='imageShare'?[15,85]:NUMBER_FIELDS[key];control.min=String(bounds[0]);control.max=String(bounds[1]);control.step=key==='imageShare'?'1':'.01';}
      if(type==='checkbox')label.className='toggle';
    }
    label.append(control);byId('back-layout-controls').append(label);controls.push({key,control});
    control.addEventListener(type==='select'||type==='checkbox'?'change':'input',()=>{
      if(locked()||assets.get('back-cover'))return;
      let value=type==='checkbox'?control.checked:type==='number'?numericDraft(control,...(key==='imageShare'?[15,85]:NUMBER_FIELDS[key])):key==='columns'?Number(control.value):control.value;
      if(value===null)return;if(key==='imageShare')value/=100;
      if(type!=='number')fieldNotice='';
      onSettingsChange(normalizeBackCover({...getState().backCover,[key]:value}));
    });
    control.addEventListener('blur',()=>{if(type==='number'){const saved=normalizeBackCover(getState().backCover)[key];control.value=String(key==='imageShare'?saved*100:saved);}});
  }
  MONTHS.forEach((name,month)=>{const option=document.createElement('option');option.value=String(month);option.textContent=name;byId('back-thumbnail-month').append(option);});
  byId('back-thumbnail-month').addEventListener('change',()=>{if(locked())return;thumbnailMonth=Number(byId('back-thumbnail-month').value);writePreference('thumbnail-month',thumbnailMonth);fieldNotice='';render();});
  for(const [id,key,bounds] of [['back-thumbnail-mode','mode',null],['back-thumbnail-x','x',[0,100]],['back-thumbnail-y','y',[0,100]],['back-thumbnail-zoom','zoom',[1,THUMBNAIL_ZOOM_MAX]]]) {
    const control=byId(id);
    control.addEventListener(key==='mode'?'change':'input',()=>{
      if(locked()||assets.get('back-cover'))return;
      let value=bounds?numericDraft(control,...bounds):control.value;if(value===null)return;if(key==='x'||key==='y')value/=100;
      const settings=normalizeBackCover(getState().backCover),monthKey=`month-${thumbnailMonth}`;
      settings.thumbnails[monthKey]={...settings.thumbnails[monthKey],[key]:value};onSettingsChange(settings);
    });
    control.addEventListener('blur',()=>{if(bounds){const saved=normalizeBackCover(getState().backCover).thumbnails[`month-${thumbnailMonth}`][key];control.value=String(key==='x'||key==='y'?saved*100:saved);}});
  }
  byId('back-thumbnail-reset').addEventListener('click',()=>{
    if(locked()||assets.get('back-cover'))return;const settings=normalizeBackCover(getState().backCover);settings.thumbnails[`month-${thumbnailMonth}`]={...THUMBNAIL_DEFAULTS};fieldNotice=`${MONTHS[thumbnailMonth]} thumbnail framing reset; monthly crop and details kept.`;onSettingsChange(settings);
  });
  byId('back-cover-reset-layout').addEventListener('click',()=>{if(locked()||assets.get('back-cover'))return;fieldNotice='Back grid and thumbnail framing reset. Uploads, monthly photos/crops, details and typography kept.';onSettingsChange(normalizeBackCover());});
  function renderConstraints(summary=backCoverStatus(getState())) {
    const effective=summary.effective,format=value=>value.toFixed(2);
    byId('back-cover-constraints').textContent=[fieldNotice,summary.mode==='uploaded'?'Generated controls are retained but inactive while an uploaded back image takes precedence.':'',`Effective ${effective.columns} columns × ${effective.rows} rows; ${format(effective.cardWidth)} × ${format(effective.cardHeight)} in cards. Margins T / R / B / L: ${['top','right','bottom','left'].map(side=>format(effective.margins[side])).join(' / ')} in. H / V gaps: ${format(effective.gapX)} / ${format(effective.gapY)} in; padding ${format(effective.padding)} in.`,...summary.notices,'Artist / title / description: up to 2 / 2 / 4 lines. Fonts fit down to their box; overflowing text is ellipsized, never spills into images or neighboring cards. Full metadata remains saved.'].filter(Boolean).join(' ');
  }
  function grantOptions() {
    const select=byId('back-cover-grants');select.replaceChildren();
    for(const item of grants){const option=document.createElement('option');option.value=item.grantId;option.textContent=`${item.name}${item.available?'':' — unavailable'}`;select.append(option);}
    select.value=grant?.grantId??'';
  }
  async function browse(nextFolder='',nextOffset=0) {
    if(disposed||locked()||(nextFolder&&!safeRelativePath(nextFolder)))return;
    const request=++token;folder=nextFolder;offset=nextOffset;
    const list=byId('back-cover-file-list');list.replaceChildren();
    byId('back-cover-folder-path').textContent=`${grant?.name??'No folder'} / ${folder||'.'}`;
    render();
    if(!grant?.available){status('Folder permission unavailable. Use Upload image from folder to reselect.');return;}
    try {
      const result=await files.list(grant.grantId,folder,{offset,limit:LIST_LIMIT});if(disposed||request!==token)return;total=result.total;
      for(const entry of result.entries) {
        if(!safeRelativePath(entry.relativePath)||!(entry.kind==='directory'||isPhotoEntry(entry)))continue;
        const button=document.createElement('button');button.type='button';button.className='photo-file';
        const blocked=entry.kind==='file'&&(!Number.isFinite(entry.size)||entry.size<=0||entry.size>FILE_LIMIT);button.dataset.blocked=String(blocked);
        button.textContent=entry.kind==='directory'?`${entry.name} /`:`${entry.name} · ${Number.isFinite(entry.size)?(entry.size/(1024*1024)).toFixed(2):'?'} MiB${blocked?' — unsupported size':''}`;
        button.addEventListener('click',async()=>{
          if(locked())return;if(entry.kind==='directory'){await browse(entry.relativePath);return;}
          const chosenGrant=grant;
          try {await assets.assign('back-cover',chosenGrant,entry,files,{...getState()},status);status(`Uploaded ${entry.name}. This image takes precedence; saved monthly metadata is unchanged.`);}
          catch(error){status(`Upload failed: ${error.message}`);}finally{render();}
        });list.append(button);
      }
      if(!list.children.length)list.textContent='No supported images or folders on this page.';
      render();
    } catch(error){if(request===token)status(`Cannot browse folder: ${error.message}`);}
  }
  byId('back-cover-upload').addEventListener('click',async()=>{
    if(!available||locked())return;
    try {
      const selected=await files.requestDirectory({persistence:'persistent'});if(!selected||disposed)return;
      await assets.restore(files,status);grant=selected;grants=await files.getGrants();grantOptions();byId('back-cover-browser').hidden=false;
      status('Choose an image below to upload to the back cover only.');await browse();
    } catch(error){status(`Folder selection failed: ${error.message}`);}
  });
  byId('back-cover-grants').addEventListener('change',()=>{grant=grants.find(item=>item.grantId===byId('back-cover-grants').value);browse();});
  byId('back-cover-parent').addEventListener('click',()=>browse(folder.split('/').slice(0,-1).join('/')));
  byId('back-cover-prev').addEventListener('click',()=>browse(folder,Math.max(0,offset-LIST_LIMIT)));
  byId('back-cover-next').addEventListener('click',()=>browse(folder,offset+LIST_LIMIT));
  byId('back-cover-remove').addEventListener('click',()=>{if(!locked()){assets.remove('back-cover');status('Upload removed. The cover is generated live from monthly images and details.');render();}});
  for(const mode of ['fill','fit'])byId(`back-cover-${mode}`).addEventListener('click',()=>{
    const record=assets.get('back-cover');if(locked()||!record?.bitmap)return;
    const state=getState(),aw=state.width+2*state.bleed,ah=state.height+2*state.bleed;
    let crop={...CENTER_CROP};
    if(mode==='fit') {const scale=Math.min(aw/record.metadata.sourceWidth,ah/record.metadata.sourceHeight),width=record.metadata.sourceWidth*scale,height=record.metadata.sourceHeight*scale;crop=cropForPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state,{x:(aw-width)/2,y:(ah-height)/2,width,height});}
    assets.setCrop('back-cover',crop);
    const placement=photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state),boundedFit=placement.x<-.000001||placement.y<-.000001||placement.x+placement.width>aw+.000001||placement.y+placement.height>ah+.000001;
    status(mode==='fill'?'Centered fill: image covers the page and bleed.':boundedFit?'The existing minimum image scale prevents a full fit for this extreme aspect ratio; some artwork remains outside bleed. Use a less extreme source aspect ratio.':'Full image fitted inside bleed artwork; uncovered areas print white.');render();
  });
  function render() {
    if(disposed)return;
    const state=getState(),summary=backCoverStatus(state),record=assets.get('back-cover'),settings=summary.settings;
    let focalX=.5,focalY=.5;
    if(previewInitialized&&canvas.clientWidth&&canvas.clientHeight){const viewportRect=zoomViewport.getBoundingClientRect(),canvasRect=canvas.getBoundingClientRect();focalX=bounded(zoomViewport.clientWidth/2-(canvasRect.left-viewportRect.left),.5,0,1);focalY=bounded(zoomViewport.clientHeight/2-(canvasRect.top-viewportRect.top),.5,0,1);}
    const viewportWidth=zoomViewport.clientWidth||zoomViewport.parentElement?.clientWidth||560,viewportHeight=zoomViewport.clientHeight||420;
    const fitScale=Math.min(viewportWidth/state.width,viewportHeight/state.height),displayWidth=state.width*fitScale*previewZoom,displayHeight=state.height*fitScale*previewZoom;
    const pixelScale=Math.min(window.devicePixelRatio||1,BACK_PREVIEW_MAX_EDGE/displayWidth,BACK_PREVIEW_MAX_EDGE/displayHeight,Math.sqrt(BACK_PREVIEW_MAX_PIXELS/(displayWidth*displayHeight)));
    zoomStage.style.width=`${Math.max(viewportWidth,displayWidth)}px`;zoomStage.style.height=`${Math.max(viewportHeight,displayHeight)}px`;
    canvas.style.width=`${displayWidth}px`;canvas.style.height=`${displayHeight}px`;
    canvas.width=Math.max(1,Math.round(displayWidth*pixelScale));canvas.height=Math.max(1,Math.round(displayHeight*pixelScale));
    if(context)drawBackCover(context,state,canvas.width,canvas.height,true);
    if(previewInitialized){const viewportRect=zoomViewport.getBoundingClientRect(),canvasRect=canvas.getBoundingClientRect(),canvasLeft=canvasRect.left-viewportRect.left+zoomViewport.scrollLeft,canvasTop=canvasRect.top-viewportRect.top+zoomViewport.scrollTop;zoomViewport.scrollLeft=Math.max(0,canvasLeft+focalX*displayWidth-zoomViewport.clientWidth/2);zoomViewport.scrollTop=Math.max(0,canvasTop+focalY*displayHeight-zoomViewport.clientHeight/2);}
    previewInitialized=true;
    zoomRange.value=String(Math.round(previewZoom*100));zoomValue.textContent=`${Math.round(previewZoom*100)}%`;
    zoomOut.disabled=locked()||previewZoom<=.25;zoomIn.disabled=locked()||previewZoom>=4;zoomFit.disabled=locked();zoomRange.disabled=locked();
    canvas.setAttribute('aria-label',summary.mode==='uploaded'?'Uploaded exterior back-cover trim preview':`Generated exterior back cover: January through December, ${settings.columns} columns, artist names, artwork titles and descriptions.`);
    byId('back-cover-mode').textContent=summary.mode==='uploaded'?'UPLOADED IMAGE':'GENERATED / LIVE';
    byId('back-cover-status').textContent=record?record.bitmap?`Using ${record.metadata.grantName} / ${record.metadata.relativePath}. Saved crop is respected in preview, 3D and PDF.`:`Saved upload unavailable: ${record.error||'restoration pending'}. Reselect its folder or remove the upload; it is not silently replaced.`:`Generated live from 12 chronological images with independent back-thumbnail framing and saved artist/title/description details.${summary.missingMonths.length?` Missing photos: ${summary.missingMonths.join(', ')}. Placeholders are preview only; normal PDF preflight still requires every month and the front cover.`:' All monthly photos are available.'}`;
    byId('back-cover-upload').disabled=!available||locked();byId('back-cover-remove').disabled=locked()||!record;
    for(const mode of ['fill','fit'])byId(`back-cover-${mode}`).disabled=locked()||!record?.bitmap;
    for(const {key,control} of controls){if(document.activeElement!==control){if(control.type==='checkbox')control.checked=settings[key];else control.value=String(key==='imageShare'?settings[key]*100:settings[key]);}control.disabled=locked()||Boolean(record);}
    const thumbnail=settings.thumbnails[`month-${thumbnailMonth}`];
    byId('back-thumbnail-month').value=String(thumbnailMonth);
    for(const [id,value] of [['back-thumbnail-mode',thumbnail.mode],['back-thumbnail-x',thumbnail.x*100],['back-thumbnail-y',thumbnail.y*100],['back-thumbnail-zoom',thumbnail.zoom]]){const control=byId(id);if(document.activeElement!==control)control.value=String(value);}
    for(const id of ['back-thumbnail-month','back-thumbnail-mode','back-thumbnail-x','back-thumbnail-y','back-thumbnail-zoom','back-thumbnail-reset','back-cover-reset-layout'])byId(id).disabled=locked()||Boolean(record);
    const monthRecord=assets.get(`month-${thumbnailMonth}`),mode=thumbnail.mode==='inherit'?settings.cropMode:thumbnail.mode;
    const selectedCard=backCoverPlan(state).cards[thumbnailMonth],thumbnailScale=THUMBNAIL_PREVIEW_EDGE/Math.max(selectedCard.photo.width,selectedCard.photo.height);
    thumbnailCanvas.width=Math.max(1,Math.round(selectedCard.photo.width*thumbnailScale));thumbnailCanvas.height=Math.max(1,Math.round(selectedCard.photo.height*thumbnailScale));
    thumbnailCanvas.setAttribute('aria-label',`${MONTHS[thumbnailMonth]} back thumbnail only: ${mode} source, ${thumbnail.zoom.toFixed(2)} times zoom. Monthly crop unchanged.`);
    if(thumbnailContext){
      thumbnailContext.save();thumbnailContext.scale(thumbnailCanvas.width/selectedCard.photo.width,thumbnailCanvas.height/selectedCard.photo.height);
      if(monthRecord?.bitmap)drawMini(thumbnailContext,state,{...selectedCard,photo:{...selectedCard.photo,x:0,y:0}},monthRecord.bitmap,monthRecord.metadata,settings);
      else {thumbnailContext.fillStyle='#eeeeee';thumbnailContext.fillRect(0,0,selectedCard.photo.width,selectedCard.photo.height);textBlock(thumbnailContext,'Photo missing',{family:'helvetica',style:'normal',size:9,color:'#555555',align:'center'},{x:0,y:0,width:selectedCard.photo.width,height:selectedCard.photo.height},2);}
      thumbnailContext.restore();
    }
    byId('back-thumbnail-status').textContent=`${MONTHS[thumbnailMonth]} only · ${thumbnail.mode==='inherit'?'inherits global':'independent'} ${mode==='monthly'?'saved monthly trim':mode==='fill'?'original-source fill':'original-source fit'} · ${thumbnail.zoom.toFixed(2)}× zoom.${monthRecord?.bitmap?` Source ${monthRecord.metadata.sourceWidth} × ${monthRecord.metadata.sourceHeight} px.`:' Assign this monthly photo to see its framing; these settings can be saved first.'} Monthly image crop remains unchanged.`;
    renderConstraints(summary);
    byId('back-cover-grants').disabled=locked();byId('back-cover-parent').disabled=locked()||!folder;
    byId('back-cover-prev').disabled=locked()||offset===0;byId('back-cover-next').disabled=locked()||offset+LIST_LIMIT>=total;
    byId('back-cover-page').textContent=`${Math.min(offset+1,total)}–${Math.min(offset+LIST_LIMIT,total)} of ${total} entries`;
    byId('back-cover-file-list').querySelectorAll('button').forEach(button=>{button.disabled=locked()||button.dataset.blocked==='true';});
    byId('back-cover-message').textContent=notice||(!available?'Upload requires Bezi directory grants, bounded decoding and Pica. Generated-cover preview still works; no unpersisted file-picker fallback is used.':'');
  }
  /** Restore the browser list without requesting permission outside a user gesture. */
  async function restore() {
    if(!available)return;
    try {grants=await files.getGrants();if(disposed)return;const saved=assets.get('back-cover');grant=grants.find(item=>item.grantId===saved?.metadata.grantId)||grants.find(item=>item.available)||null;grantOptions();if(grant){byId('back-cover-browser').hidden=false;await browse();}}
    catch(error){status(`Folder list unavailable: ${error.message}`);}
  }
  return {render,restore,summary:()=>backCoverStatus(getState()),dispose(){disposed=true;token++;previewResizeObserver?.disconnect();canvas.width=canvas.height=1;thumbnailCanvas.width=thumbnailCanvas.height=1;}};
}
