import { numericDraft as readNumericDraft, commitNumericOnBlur } from './numeric-input.js';
import { normalizeBackStyle, normalizeBackFont, normalizeBackObjects, normalizeBackRect, transformBackRect, backContentRect, backImageKey, backObjectImageMapping } from './back-cover-model.js';
import { backContainerPath, drawBackContainer, drawBackObject, drawBackRichText, backTextLines } from './back-cover-render.js';
import { createBackCoverControls } from './back-cover-controls.js';
import { readPreference, writePreference } from './browser-storage.js';
import { MONTHS, normalizeLayout, normalizeArtworkMetadata, canvasFont, readerState } from './layout.js';
import { backCoverUsesImage, assets, FILE_LIMIT, isPhotoEntry, safeRelativePath, drawPhoto, printRasterSpec, printPhotoCanvas, CENTER_CROP, cropForPlacement, photoPlacement, picaAvailable, resizeImageBitmapToCanvas } from './media.js';

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
export const BACK_COVER_DEFAULTS = Object.freeze({version:3,backgroundTransparent:false,cellBackgroundTransparent:false,frontCoverCredits:false,frontCoverImage:true,backgroundImage:false,columns:3,marginTop:.5,marginRight:.5,marginBottom:.5,marginLeft:.5,gapX:.15,gapY:.15,padding:.06,placement:'top',imageShare:.62,alignX:'center',alignY:'top',cropMode:'monthly',background:'#ffffff',cellBackground:'#f5f5f5',cellFill:false});
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
  result.mode=['dynamic','image'].includes(value?.mode)?value.mode:'auto';
  result.cellFill=value?.cellFill===true;
  result.backgroundTransparent=value?.backgroundTransparent===true;result.cellBackgroundTransparent=value?.cellBackgroundTransparent===true;
  result.frontCoverCredits=value?.frontCoverCredits===true;result.frontCoverImage=value?.frontCoverImage!==false;result.backgroundImage=value?.backgroundImage===true;
  MONTHS.forEach((_,month)=>{const key=`month-${month}`,source=value?.thumbnails?.[key];result.thumbnails[key]={mode:['inherit',...CROP_MODES].includes(source?.mode)?source.mode:THUMBNAIL_DEFAULTS.mode,x:bounded(source?.x,.5,0,1),y:bounded(source?.y,.5,0,1),zoom:bounded(source?.zoom,1,1,THUMBNAIL_ZOOM_MAX)};});
  result.thumbnails['front-cover']={mode:'monthly',x:.5,y:.5,zoom:1};
  result.version=3;
  result.grid=value?.grid&&typeof value.grid==='object'?normalizeBackRect(value.grid):null;
  result.detailsStyle=normalizeBackStyle(value?.detailsStyle,{...normalizeBackStyle(),vertical:result.alignY});
  result.imageStyle=normalizeBackStyle(value?.imageStyle,{...normalizeBackStyle(),vertical:'inherit'});
  result.detailsFonts=Object.fromEntries(['artist','artworkTitle','description'].map(role=>[role,value?.detailsFonts?.[role]&&typeof value.detailsFonts[role]==='object'?normalizeBackFont(value.detailsFonts[role]):null]));
  result.objects=normalizeBackObjects(value?.objects);
  return result;
}

/** Describe derived mode, effective geometry and constraints without discarding unavailable uploads. */
export function backCoverStatus(state) {
  const record=backCoverUsesImage(state)?assets.get('back-cover'):null,missing=MONTHS.flatMap((_,month)=>assets.get(`month-${month}`)?.bitmap?[]:[MONTHS[month]]),plan=backCoverPlan(state);
  return {mode:backCoverUsesImage(state)?'uploaded':'generated',uploadedAvailable:Boolean(record?.bitmap),missingMonths:missing,ready:backCoverUsesImage(state)?Boolean(record?.bitmap):missing.length===0&&(!plan.settings.backgroundImage||Boolean(assets.get('back-cover-background')?.bitmap))&&(!plan.settings.frontCoverCredits||!plan.settings.frontCoverImage||Boolean(assets.get('front-cover')?.bitmap))&&plan.settings.objects.filter(object=>object.type==='image').every(object=>Boolean(assets.get(backImageKey(object.id))?.bitmap)),settings:plan.settings,effective:plan.effective,notices:plan.notices,textPrinted:!backCoverUsesImage(state),thumbnailCropsIndependent:true,chronologicalMonths:MONTHS,raster:printRasterSpec(state)};
}

/** Keep all twelve chronological cards disjoint, even with extreme page shapes and requested spacing. */
export function backCoverPlan(state) {
  const settings=normalizeBackCover(state.backCover),columns=settings.columns,rows=Math.ceil((MONTH_COUNT+(settings.frontCoverCredits?1:0))/columns),notices=[];
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
  const entries=[...(settings.frontCoverCredits?[{key:'front-cover',name:'Front cover',month:null}]:[]),...MONTHS.map((name,month)=>({key:`month-${month}`,name,month}))];
  const cards=entries.map(({key,name,month},index)=>{
    const x=margins.left+(index%columns)*(cardWidth+gapX),y=margins.top+Math.floor(index/columns)*(cardHeight+gapY),bodyX=x+padding,bodyY=y+padding+labelHeight;
    const photo={x:bodyX,y:bodyY,width:photoWidth,height:photoHeight},text={x:bodyX,y:bodyY,width:textWidth,height:textHeight};
    if(settings.placement==='left')text.x+=photoWidth+contentGap;
    if(settings.placement==='right')photo.x+=textWidth+contentGap;
    if(settings.placement==='top')text.y+=photoHeight+contentGap;
    if(settings.placement==='bottom')photo.y+=textHeight+contentGap;
    const imageVisible=key!=='front-cover'||settings.frontCoverImage;
    if(!imageVisible)Object.assign(text,{x:bodyX,y:bodyY,width:innerWidth,height:bodyHeight});
    return {key,month,name,x,y,width:cardWidth,height:cardHeight,padding,labelHeight,label:{x:bodyX,y:y+padding,width:innerWidth,height:labelHeight},photo,text,imageVisible,metadata:metadata[key],thumbnail:settings.thumbnails[key]};
  });
  const automaticGrid={x:margins.left,y:margins.top,width:usableWidth,height:usableHeight,aspectLocked:true},grid=settings.grid??automaticGrid;
  if(settings.grid)for(const card of cards) {
    Object.assign(card,transformBackRect(card,automaticGrid,grid));
    for(const key of ['label','photo','text'])card[key]=transformBackRect(card[key],automaticGrid,grid);
    card.padding*=Math.min(grid.width/automaticGrid.width,grid.height/automaticGrid.height);
  }
  for(const card of cards) {
    card.photoFrame={...card.photo};card.textFrame={...card.text};
    card.photo=backContentRect(card.photoFrame,settings.imageStyle);card.text=backContentRect(card.textFrame,settings.detailsStyle);
  }
  for(const role of ['artist','artworkTitle','description'])if(settings.detailsFonts[role])fonts[role]=settings.detailsFonts[role];
  if(photoWidth<.25||photoHeight<.25||textWidth<.3||textHeight<.25)notices.push('Small image or caption area: text keeps its configured size and clips at the container.');
  if(grid.x<0||grid.y<0||grid.x+grid.width>state.width||grid.y+grid.height>state.height)notices.push('Monthly grid extends beyond the trim; artwork outside the page is clipped.');
  return {settings,fonts,cards,grid,automaticGrid,notices,effective:{columns,rows,margins,gapX,gapY,padding,cardWidth,cardHeight,photoWidth,photoHeight,textWidth,textHeight}};
}

/** Exact original-source placement used for both screen draw and original-file export sampling. */
export function backThumbnailMapping(state,card,metadata,settings=normalizeBackCover(state.backCover)) {
  const thumbnail=card.thumbnail,mode=thumbnail.mode==='inherit'?settings.cropMode:thumbnail.mode,box=card.photo;
  const anchorX=frameAnchor(thumbnail.x,positionFraction(settings.imageStyle.align==='inherit'?settings.alignX:settings.imageStyle.align,'x')),anchorY=frameAnchor(thumbnail.y,positionFraction(settings.imageStyle.vertical==='inherit'?settings.alignY:settings.imageStyle.vertical,'y'));
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
  const availableHeight=Math.max(.01,height),minimumWidth=Math.max(.01,width);
  width=minimumWidth;
  size=Math.min(size,availableHeight/(LINE_HEIGHT*Math.max(1,Math.min(maxLines,lines.length))));
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
  if(card.photo.width<=0||card.photo.height<=0)return;
  const mapping=backThumbnailMapping(state,card,metadata,settings);
  context.save();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  backContainerPath(context,card.photoFrame??card.photo,settings.imageStyle);context.clip();
  context.translate(card.photo.x,card.photo.y);
  context.beginPath();context.rect(0,0,card.photo.width,card.photo.height);context.clip();
  // A monthly source is additionally clipped to its saved trim page, preserving transparent gaps.
  context.beginPath();context.rect(mapping.clip.x,mapping.clip.y,mapping.clip.width,mapping.clip.height);context.clip();
  context.drawImage(bitmap,mapping.x,mapping.y,mapping.width,mapping.height);
  context.restore();
}

function drawCaptions(context,card,plan) {
  const style=plan.settings.detailsStyle,blocks=[['title','artworkTitle'],['artist','artist'],['description','description']].filter(([field])=>card.metadata[field]?.trim());
  const runs=blocks.flatMap(([field,role],index)=>[{text:`${index?'\n':''}${card.metadata[field]}`,font:plan.fonts[role]}]);
  if(!runs.length)return;
  // Each field retains its inherited alignment unless a shared container alignment is selected.
  context.save();backContainerPath(context,card.textFrame,style);context.clip();context.beginPath();context.rect(card.text.x,card.text.y,card.text.width,card.text.height);context.clip();
  if(style.align!=='inherit') {
    const result=drawBackRichText(context,{rect:card.textFrame,style,font:plan.fonts.artworkTitle,runs});
    if(result?.overflow)plan.notices.push(`${card.name}: artwork details exceed their container; adjust typography or grid geometry.`);
  } else {
    const measured=blocks.map(([field,role])=>{const object={rect:card.textFrame,style:{...style,vertical:'top'},font:plan.fonts[role],runs:[{text:card.metadata[field],font:plan.fonts[role]}]},lines=backTextLines(context,object.runs,card.text.width,object.font);return {object,height:lines.reduce((sum,line)=>sum+line.height,0),wide:lines.some(line=>line.width>card.text.width)};});
    const height=measured.reduce((sum,item)=>sum+item.height,0);let y=card.text.y+Math.max(0,card.text.height-height)*positionFraction(style.vertical,'y');
    for(const item of measured){const font=item.object.font;drawBackRichText(context,{...item.object,rect:{x:card.text.x,y,width:card.text.width,height:item.height},style:{...normalizeBackStyle(),align:font.align},font});y+=item.height;}
    if(height>card.text.height||measured.some(item=>item.wide))plan.notices.push(`${card.name}: artwork details exceed their container; adjust typography or grid geometry.`);
  }
  context.restore();
}

function beginArtwork(context,state,width,height,trim) {
  context.save();context.scale(width/(state.width+(trim?0:2*state.bleed)),height/(state.height+(trim?0:2*state.bleed)));
  if(!trim)context.translate(state.bleed,state.bleed);
}

/** Shared flat / 3D / PDF artwork, with bounded captions and independent thumbnail transforms. */
export function drawBackCover(context,state,width,height,trim=true,previewPhotos=true,backgroundRecord=null) {
  const uploaded=backCoverUsesImage(state)?assets.get('back-cover'):null;
  if(uploaded?.bitmap) {drawPhoto(context,uploaded.bitmap,uploaded.metadata.crop,state,width,height,trim,uploaded.metadata);return;}
  const plan=backCoverPlan(state);
  beginArtwork(context,state,width,height,trim);
  if(!plan.settings.backgroundTransparent){context.fillStyle=plan.settings.background;context.fillRect(-state.bleed,-state.bleed,state.width+2*state.bleed,state.height+2*state.bleed);}
  const background=backgroundRecord??(plan.settings.backgroundImage?assets.get('back-cover-background'):null);
  if(background?.fullArtwork)context.drawImage(background.fullArtwork,-state.bleed,-state.bleed,state.width+2*state.bleed,state.height+2*state.bleed);
  else if(background?.bitmap) {
    context.save();context.translate(-state.bleed,-state.bleed);
    drawPhoto(context,background.bitmap,background.metadata.crop,{...state,photoBackground:plan.settings.backgroundTransparent?'transparent':plan.settings.background},state.width+2*state.bleed,state.height+2*state.bleed,false,background.metadata);context.restore();
  }
  if(backCoverUsesImage(state)) {
    textBlock(context,'Choose a back-cover image.',{family:'helvetica',style:'normal',size:14,color:'#555555',align:'center'},{x:state.margin,y:state.height*.4,width:state.width-2*state.margin,height:state.height*.2},3);
  } else for(const card of plan.cards) {
    const record=assets.get(card.key);
    if(plan.settings.cellFill&&!plan.settings.cellBackgroundTransparent){context.fillStyle=plan.settings.cellBackground;context.fillRect(card.x,card.y,card.width,card.height);}
    drawBackContainer(context,card.textFrame,plan.settings.detailsStyle);
    if(card.imageVisible)drawBackContainer(context,card.photoFrame,plan.settings.imageStyle);
    textBlock(context,card.name,{family:'helvetica',style:'bold',size:9,color:plan.fonts.artist.color,align:plan.settings.alignX},card.label,1);
    if(!card.imageVisible) {drawCaptions(context,card,plan);continue;}
    if(previewPhotos&&record?.bitmap) drawMini(context,state,card,record.bitmap,record.metadata,plan.settings);
    else if(previewPhotos)textBlock(context,'Photo missing',{family:'helvetica',style:'normal',size:9,color:'#555555',align:'center'},card.photo,2);
    drawCaptions(context,card,plan);
    if(card.imageVisible&&plan.settings.imageStyle.borderWidth>0)drawBackContainer(context,card.photoFrame,{...plan.settings.imageStyle,transparent:true});
  }
  if(!backCoverUsesImage(state)&&previewPhotos)for(const object of plan.settings.objects) {
    const result=drawBackObject(context,object,object.type==='image'?assets.get(backImageKey(object.id)):null);
    if(result?.overflow)plan.notices.push(`${object.name}: text exceeds its container; adjust typography or size.`);
  }
  context.restore();return plan;
}

/** Bound oversized off-page containers before either original decoding or Pica allocation. */
function backImageRaster(box,spec) {
  const width=Math.max(1,Math.ceil(box.width*spec.ppi)),height=Math.max(1,Math.ceil(box.height*spec.ppi)),scale=Math.min(1,MINI_MAX_EDGE/Math.max(width,height),Math.sqrt(MINI_MAX_PIXELS/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

/** Reread originals sequentially using the exact thumbnail mapping, then Pica-resample each clipped image. */
export async function printGeneratedBackCover(state,files,onProgress=()=>{}) {
  if(backCoverUsesImage(state))throw new Error('Uploaded back covers use the original-photo PDF export path.');
  const spec=printRasterSpec(state),canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
  try {
    const context=canvas.getContext('2d');
    let backgroundBitmap,backgroundCanvas;let plan;
    try {
      if(normalizeBackCover(state.backCover).backgroundImage) {
        backgroundBitmap=await assets.exportBitmap('back-cover-background',files,state,spec.width,spec.height);
        backgroundCanvas=(await printPhotoCanvas(backgroundBitmap,assets.get('back-cover-background').metadata,{...state,photoBackground:normalizeBackCover(state.backCover).backgroundTransparent?'transparent':normalizeBackCover(state.backCover).background},onProgress)).canvas;
      }
      plan=drawBackCover(context,state,canvas.width,canvas.height,false,false,backgroundCanvas?{fullArtwork:backgroundCanvas}:null);
    } finally {backgroundBitmap?.close();if(backgroundCanvas)backgroundCanvas.width=backgroundCanvas.height=1;}
    const warnings=plan.notices.map(notice=>`Generated back cover: ${notice}`);
    for(const card of plan.cards) {
      if(!card.imageVisible||card.photo.width<=0||card.photo.height<=0)continue;
      let bitmap,work,resized;
      try {
        onProgress(`Generated back cover · ${card.name} thumbnail from original…`);
        const record=assets.get(card.key),mapping=backThumbnailMapping(state,card,record.metadata,plan.settings);
        const target=backImageRaster(card.photo,spec),targetWidth=target.width,targetHeight=target.height;
        if(Math.min(targetWidth/card.photo.width,targetHeight/card.photo.height)<spec.ppi-1)warnings.push(`${card.name}: oversized thumbnail raster capped to ${targetWidth} × ${targetHeight} px.`);
        bitmap=await assets.exportBitmap(card.key,files,readerState(state),targetWidth,targetHeight,mapping);
        const detail=Math.min(bitmap.width/mapping.width,bitmap.height/mapping.height),required=Math.min(spec.ppi,300);
        if(detail<required)warnings.push(`${card.name} back thumbnail: bounded original decode supplies about ${Math.floor(detail)} PPI; resizing adds no detail.`);
        const factor=Math.max(1,Math.min(MINI_OVERSAMPLE,detail/spec.ppi,MINI_MAX_EDGE/Math.max(targetWidth,targetHeight),Math.sqrt(MINI_MAX_PIXELS/(targetWidth*targetHeight))));
        work=document.createElement('canvas');work.width=Math.max(1,Math.floor(targetWidth*factor));work.height=Math.max(1,Math.floor(targetHeight*factor));
        const miniContext=work.getContext('2d');miniContext.scale(work.width/card.photo.width,work.height/card.photo.height);
        drawMini(miniContext,state,{...card,photoFrame:{...card.photoFrame,x:card.photoFrame.x-card.photo.x,y:card.photoFrame.y-card.photo.y},photo:{...card.photo,x:0,y:0}},bitmap,record.metadata,plan.settings);
        onProgress(`Generated back cover · ${card.name} Pica thumbnail resize…`);
        resized=await resizeImageBitmapToCanvas(work,targetWidth,targetHeight);
        beginArtwork(context,state,canvas.width,canvas.height,false);
        context.drawImage(resized,card.photo.x,card.photo.y,card.photo.width,card.photo.height);context.restore();
      } finally {bitmap?.close();if(work)work.width=work.height=1;if(resized)resized.width=resized.height=1;}
    }
    if(plan.settings.imageStyle.borderWidth>0) {
      beginArtwork(context,state,canvas.width,canvas.height,false);
      for(const card of plan.cards)if(card.imageVisible)drawBackContainer(context,card.photoFrame,{...plan.settings.imageStyle,transparent:true});
      context.restore();
    }
    for(const object of plan.settings.objects) {
      let bitmap,work,resized;
      try {
        let record=null;
        if(object.type==='image') {
          const box=backContentRect(object.rect,object.style),key=backImageKey(object.id),source=assets.get(key);
          if(!source?.bitmap)throw new Error(`${object.name}: image missing or photo access not restored.`);
          if(box.width>0&&box.height>0) {
            const mapping=backObjectImageMapping(object,source.metadata),target=backImageRaster(box,spec),targetWidth=target.width,targetHeight=target.height;
            if(Math.min(targetWidth/box.width,targetHeight/box.height)<spec.ppi-1)warnings.push(`${object.name}: oversized image raster capped to ${targetWidth} × ${targetHeight} px.`);
            onProgress(`Generated back cover · ${object.name} from original…`);
            bitmap=await assets.exportBitmap(key,files,state,targetWidth,targetHeight,mapping);
            const detail=Math.min(bitmap.width/mapping.width,bitmap.height/mapping.height);
            if(detail<Math.min(spec.ppi,300))warnings.push(`${object.name}: bounded original supplies about ${Math.floor(detail)} PPI; resizing adds no detail.`);
            work=document.createElement('canvas');work.width=targetWidth;work.height=targetHeight;
            const imageContext=work.getContext('2d');imageContext.scale(targetWidth/box.width,targetHeight/box.height);
            imageContext.drawImage(bitmap,mapping.x,mapping.y,mapping.width,mapping.height);
            resized=await resizeImageBitmapToCanvas(work,targetWidth,targetHeight);record={fullArtwork:resized};
          }
        }
        beginArtwork(context,state,canvas.width,canvas.height,false);
        const result=drawBackObject(context,object,record);context.restore();
        if(result?.overflow)warnings.push(`${object.name}: text exceeds its container and is clipped.`);
      } finally {bitmap?.close();if(work)work.width=work.height=1;if(resized)resized.width=resized.height=1;}
    }
    return {canvas,spec,warnings};
  } catch(error) {canvas.width=canvas.height=1;throw error;}
}

/** Independent back-cover picker uses documented persistent folder grants, never fake File references. */
export function createBackCoverEditor(getState,onSettingsChange,isBusy=()=>false) {
  const files=window.Bezi?.files,available=files&&['requestDirectory','getGrants','list','stat','readBytes'].every(method=>typeof files[method]==='function')&&typeof createImageBitmap==='function'&&picaAvailable();
  const canvas=byId('back-cover-preview'),context=canvas.getContext('2d'),zoomViewport=byId('back-cover-zoom-viewport'),zoomStage=byId('back-cover-zoom-stage'),zoomOut=byId('back-cover-zoom-out'),zoomIn=byId('back-cover-zoom-in'),zoomFit=byId('back-cover-zoom-fit'),zoomRange=byId('back-cover-zoom-range'),zoomValue=byId('back-cover-zoom-value'),thumbnailCanvas=byId('back-thumbnail-preview'),thumbnailContext=thumbnailCanvas.getContext('2d');
  let grants=[],grant=null,folder='',offset=0,total=0,token=0,notice='',disposed=false,previewZoom=1,previewInitialized=false,pickerKey='back-cover';
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
    ['frontCoverCredits','Include front-cover credits','checkbox'],['frontCoverImage','Include front-cover image','checkbox'],['backgroundImage','Use background image','checkbox'],['background','Cover background','color'],['backgroundTransparent','Transparent cover background','checkbox'],['cellBackground','Card background color','color'],['cellBackgroundTransparent','Transparent card background','checkbox'],['cellFill','Use card background','checkbox']
  ];
  function numericDraft(control,min,max) {
    const value=readNumericDraft(control,min,max);
    fieldNotice='';
    return value;
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
      if(locked()||backCoverUsesImage(getState()))return;
      let value=type==='checkbox'?control.checked:type==='number'?numericDraft(control,...(key==='imageShare'?[15,85]:NUMBER_FIELDS[key])):key==='columns'?Number(control.value):control.value;
      if(value===null)return;if(key==='imageShare')value/=100;
      if(type!=='number')fieldNotice='';
      onSettingsChange(normalizeBackCover({...getState().backCover,[key]:value}));
    });
    if(type==='number') commitNumericOnBlur(control,...(key==='imageShare'?[15,85]:NUMBER_FIELDS[key]),()=>{const saved=normalizeBackCover(getState().backCover)[key];return key==='imageShare'?saved*100:saved;});
  }
  const chooseBackground=document.createElement('button');chooseBackground.type='button';chooseBackground.className='layout-image-picker';chooseBackground.textContent='Choose / frame background image';
  chooseBackground.addEventListener('click',()=>{byId('image-picker-tab').click();const target=byId('photo-target');target.value='back-cover-background';target.dispatchEvent(new Event('change'));});byId('back-layout-controls').append(chooseBackground);
  MONTHS.forEach((name,month)=>{const option=document.createElement('option');option.value=String(month);option.textContent=name;byId('back-thumbnail-month').append(option);});
  byId('back-thumbnail-month').addEventListener('change',()=>{if(locked())return;thumbnailMonth=Number(byId('back-thumbnail-month').value);writePreference('thumbnail-month',thumbnailMonth);fieldNotice='';render();});
  for(const [id,key,bounds] of [['back-thumbnail-mode','mode',null],['back-thumbnail-x','x',[0,100]],['back-thumbnail-y','y',[0,100]],['back-thumbnail-zoom','zoom',[1,THUMBNAIL_ZOOM_MAX]]]) {
    const control=byId(id);
    control.addEventListener(key==='mode'?'change':'input',()=>{
      if(locked()||backCoverUsesImage(getState()))return;
      let value=bounds?numericDraft(control,...bounds):control.value;if(value===null)return;if(key==='x'||key==='y')value/=100;
      const settings=normalizeBackCover(getState().backCover),monthKey=`month-${thumbnailMonth}`;
      settings.thumbnails[monthKey]={...settings.thumbnails[monthKey],[key]:value};onSettingsChange(settings);
    });
    if(bounds) commitNumericOnBlur(control,...bounds,()=>{const saved=normalizeBackCover(getState().backCover).thumbnails[`month-${thumbnailMonth}`][key];return key==='x'||key==='y'?saved*100:saved;});
  }
  byId('back-thumbnail-reset').addEventListener('click',()=>{
    if(locked()||backCoverUsesImage(getState()))return;const settings=normalizeBackCover(getState().backCover);settings.thumbnails[`month-${thumbnailMonth}`]={...THUMBNAIL_DEFAULTS};fieldNotice=`${MONTHS[thumbnailMonth]} thumbnail framing reset; monthly crop and details kept.`;onSettingsChange(settings);
  });
  byId('back-cover-reset-layout').addEventListener('click',()=>{if(locked()||backCoverUsesImage(getState()))return;fieldNotice='Back grid and thumbnail framing reset. Custom containers, shared styles, uploads, monthly crops and typography kept.';onSettingsChange(normalizeBackCover({...BACK_COVER_DEFAULTS,mode:'dynamic',objects:normalizeBackCover(getState().backCover).objects,detailsStyle:normalizeBackCover(getState().backCover).detailsStyle,imageStyle:normalizeBackCover(getState().backCover).imageStyle,detailsFonts:normalizeBackCover(getState().backCover).detailsFonts}));});
  function renderConstraints(summary=backCoverStatus(getState())) {
    byId('back-cover-constraints').textContent=[fieldNotice,...summary.notices].filter(Boolean).join(' ');
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
    if(!grant?.available){status('Folder permission unavailable. Choose an image folder to restore access.');return;}
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
          try {
            const target=pickerKey,object=normalizeBackCover(getState().backCover).objects.find(item=>backImageKey(item.id)===target),state={...getState(),...(object?{width:object.rect.width,height:object.rect.height,bleed:0}:{})};
            if(target!=='back-cover'&&!object)throw new Error('This image container was removed.');
            await assets.assign(target,chosenGrant,entry,files,state,status);status('');
          }
          catch(error){status(`Upload failed: ${error.message}`);}finally{render();}
        });list.append(button);
      }
      if(!list.children.length)list.textContent='No supported images or folders on this page.';
      render();
    } catch(error){if(request===token)status(`Cannot browse folder: ${error.message}`);}
  }
  function selectSource(mode) { if(locked())return;notice='';if(mode==='image')pickerKey='back-cover';onSettingsChange(normalizeBackCover({...getState().backCover,mode})); }
  for(const [id,mode] of [['back-dynamic-tab','dynamic'],['back-image-tab','image']]) {
    byId(id).addEventListener('click',()=>selectSource(mode));
    byId(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'dynamic':event.key==='End'?'image':mode==='dynamic'?'image':'dynamic';selectSource(next);byId(next==='dynamic'?'back-dynamic-tab':'back-image-tab').focus();}});
  }
  byId('back-cover-upload').addEventListener('click',async()=>{
    if(!available||locked())return;
    try {
      const selected=await files.requestDirectory({persistence:'persistent'});if(!selected||disposed)return;
      await assets.restore(files,status);grant=selected;grants=await files.getGrants();grantOptions();byId('back-cover-browser').hidden=false;
      status('');await browse();
    } catch(error){status(`Folder selection failed: ${error.message}`);}
  });
  byId('back-cover-grants').addEventListener('change',()=>{grant=grants.find(item=>item.grantId===byId('back-cover-grants').value);browse();});
  byId('back-cover-parent').addEventListener('click',()=>browse(folder.split('/').slice(0,-1).join('/')));
  byId('back-cover-prev').addEventListener('click',()=>browse(folder,Math.max(0,offset-LIST_LIMIT)));
  byId('back-cover-next').addEventListener('click',()=>browse(folder,offset+LIST_LIMIT));
  byId('back-cover-remove').addEventListener('click',()=>{if(!locked()){assets.remove('back-cover');status('');render();}});
  for(const mode of ['fill','fit'])byId(`back-cover-${mode}`).addEventListener('click',()=>{
    const record=assets.get('back-cover');if(locked()||!record?.bitmap)return;
    const state=getState(),aw=state.width+2*state.bleed,ah=state.height+2*state.bleed;
    let crop={...CENTER_CROP};
    if(mode==='fit') {const scale=Math.min(aw/record.metadata.sourceWidth,ah/record.metadata.sourceHeight),width=record.metadata.sourceWidth*scale,height=record.metadata.sourceHeight*scale;crop=cropForPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state,{x:(aw-width)/2,y:(ah-height)/2,width,height});}
    assets.setCrop('back-cover',crop);
    const placement=photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state),boundedFit=placement.x<-.000001||placement.y<-.000001||placement.x+placement.width>aw+.000001||placement.y+placement.height>ah+.000001;
    status(mode==='fill'?'Centered fill: image covers the page and bleed.':boundedFit?'The existing minimum image scale prevents a full fit for this extreme aspect ratio; some artwork remains outside bleed. Use a less extreme source aspect ratio.':'Full image fitted inside bleed artwork; uncovered areas print white.');render();
  });
  byId('back-cover-browse-folder').addEventListener('click',()=>byId('back-cover-upload').click());
  const objectControls=createBackCoverControls({getState,onChange:onSettingsChange,normalize:normalizeBackCover,planFor:backCoverPlan,canvas,stage:zoomStage,locked,refresh:render,chooseImage:async key=>{
    if(locked())return;pickerKey=key;
    if(!available){status('Image folder access unavailable. Reopen in a browser with photo folder access.');render();return;}
    if(!grant?.available)byId('back-cover-upload').click();else {await browse();byId('back-cover-browser').scrollIntoView({block:'nearest'});}
  }});
  function render() {
    if(disposed)return;
    const state=getState(),summary=backCoverStatus(state),record=assets.get('back-cover'),settings=summary.settings;
    for(const option of byId('back-cover-columns').options)option.textContent=`${option.value} columns × ${Math.ceil((12+(settings.frontCoverCredits?1:0))/Number(option.value))} rows`;
    let focalX=.5,focalY=.5;
    if(previewInitialized&&canvas.clientWidth&&canvas.clientHeight){const viewportRect=zoomViewport.getBoundingClientRect(),canvasRect=canvas.getBoundingClientRect();focalX=bounded((zoomViewport.clientWidth/2-(canvasRect.left-viewportRect.left))/canvasRect.width,.5,0,1);focalY=bounded((zoomViewport.clientHeight/2-(canvasRect.top-viewportRect.top))/canvasRect.height,.5,0,1);}
    const viewportWidth=zoomViewport.clientWidth||zoomViewport.parentElement?.clientWidth||560,viewportHeight=zoomViewport.clientHeight||420;
    const fitScale=Math.min(viewportWidth/state.width,viewportHeight/state.height),displayWidth=state.width*fitScale*previewZoom,displayHeight=state.height*fitScale*previewZoom;
    const pixelScale=Math.min(window.devicePixelRatio||1,BACK_PREVIEW_MAX_EDGE/displayWidth,BACK_PREVIEW_MAX_EDGE/displayHeight,Math.sqrt(BACK_PREVIEW_MAX_PIXELS/(displayWidth*displayHeight)));
    zoomStage.style.width=`${Math.max(viewportWidth,displayWidth)}px`;zoomStage.style.height=`${Math.max(viewportHeight,displayHeight)}px`;
    canvas.style.width=`${displayWidth}px`;canvas.style.height=`${displayHeight}px`;
    canvas.width=Math.max(1,Math.round(displayWidth*pixelScale));canvas.height=Math.max(1,Math.round(displayHeight*pixelScale));
    if(context){const artworkPlan=drawBackCover(context,state,canvas.width,canvas.height,true);if(artworkPlan)summary.notices=[...new Set([...summary.notices,...artworkPlan.notices])];}
    if(previewInitialized){const viewportRect=zoomViewport.getBoundingClientRect(),canvasRect=canvas.getBoundingClientRect(),canvasLeft=canvasRect.left-viewportRect.left+zoomViewport.scrollLeft,canvasTop=canvasRect.top-viewportRect.top+zoomViewport.scrollTop;zoomViewport.scrollLeft=Math.max(0,canvasLeft+focalX*displayWidth-zoomViewport.clientWidth/2);zoomViewport.scrollTop=Math.max(0,canvasTop+focalY*displayHeight-zoomViewport.clientHeight/2);}
    previewInitialized=true;
    zoomRange.value=String(Math.round(previewZoom*100));zoomValue.textContent=`${Math.round(previewZoom*100)}%`;
    zoomOut.disabled=locked()||previewZoom<=.25;zoomIn.disabled=locked()||previewZoom>=4;zoomFit.disabled=locked();zoomRange.disabled=locked();
    canvas.setAttribute('aria-label',summary.mode==='uploaded'?'Uploaded exterior back-cover trim preview':`Generated exterior back cover: ${settings.frontCoverCredits?'front-cover credits plus ':''}January through December, ${settings.columns} columns, artist names, artwork titles and descriptions.`);
    const imageMode=backCoverUsesImage(state);
    for(const [id,active] of [['back-dynamic-tab',!imageMode],['back-image-tab',imageMode]]){const tab=byId(id);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;tab.disabled=locked();}
    byId('back-dynamic-settings').hidden=imageMode;byId('back-image-settings').hidden=!imageMode;
    byId('back-cover-browser').hidden=!grant||(imageMode?pickerKey!=='back-cover':pickerKey==='back-cover');
    const pickerObject=settings.objects.find(object=>backImageKey(object.id)===pickerKey);
    byId('back-cover-browser-target').textContent=pickerObject?`Choose image for ${pickerObject.name}`:'Choose back-cover image';
    byId('back-cover-browse-folder').disabled=locked();
    byId('back-cover-mode').parentElement.hidden=true;
    byId('back-cover-status').textContent=record?record.bitmap?`Using ${record.metadata.grantName} / ${record.metadata.relativePath}. Saved crop is respected in preview, 3D and PDF.`:`Saved upload unavailable: ${record.error||'restoration pending'}. Reselect its folder or remove the upload; it is not silently replaced.`:'';
    byId('back-cover-status').hidden=!imageMode||!record||Boolean(record.bitmap);
    byId('back-cover-upload').disabled=!available||locked();byId('back-cover-remove').disabled=locked()||!record;
    for(const mode of ['fill','fit'])byId(`back-cover-${mode}`).disabled=locked()||!record?.bitmap;
    for(const {key,control} of controls){if(document.activeElement!==control){if(control.type==='checkbox')control.checked=settings[key];else control.value=String(key==='imageShare'?settings[key]*100:settings[key]);}control.disabled=locked()||imageMode||(control.type==='color'&&settings[`${key}Transparent`]===true);}
    const thumbnail=settings.thumbnails[`month-${thumbnailMonth}`];
    byId('back-thumbnail-month').value=String(thumbnailMonth);
    for(const [id,value] of [['back-thumbnail-mode',thumbnail.mode],['back-thumbnail-x',thumbnail.x*100],['back-thumbnail-y',thumbnail.y*100],['back-thumbnail-zoom',thumbnail.zoom]]){const control=byId(id);if(document.activeElement!==control)control.value=String(value);}
    for(const id of ['back-thumbnail-month','back-thumbnail-mode','back-thumbnail-x','back-thumbnail-y','back-thumbnail-zoom','back-thumbnail-reset','back-cover-reset-layout'])byId(id).disabled=locked()||imageMode;
    const monthRecord=assets.get(`month-${thumbnailMonth}`),mode=thumbnail.mode==='inherit'?settings.cropMode:thumbnail.mode;
    const selectedCard=backCoverPlan(state).cards.find(card=>card.key===`month-${thumbnailMonth}`),thumbnailBox=selectedCard.photoFrame,thumbnailScale=THUMBNAIL_PREVIEW_EDGE/Math.max(thumbnailBox.width,thumbnailBox.height);
    thumbnailCanvas.width=Math.max(1,Math.round(thumbnailBox.width*thumbnailScale));thumbnailCanvas.height=Math.max(1,Math.round(thumbnailBox.height*thumbnailScale));
    thumbnailCanvas.setAttribute('aria-label',`${MONTHS[thumbnailMonth]} back thumbnail only: ${mode} source, ${thumbnail.zoom.toFixed(2)} times zoom. Monthly crop unchanged.`);
    if(thumbnailContext){
      const localCard={...selectedCard,photoFrame:{...thumbnailBox,x:0,y:0},photo:{...selectedCard.photo,x:selectedCard.photo.x-thumbnailBox.x,y:selectedCard.photo.y-thumbnailBox.y}};
      thumbnailContext.save();thumbnailContext.scale(thumbnailCanvas.width/thumbnailBox.width,thumbnailCanvas.height/thumbnailBox.height);
      drawBackContainer(thumbnailContext,localCard.photoFrame,settings.imageStyle);
      if(monthRecord?.bitmap)drawMini(thumbnailContext,state,localCard,monthRecord.bitmap,monthRecord.metadata,settings);
      else textBlock(thumbnailContext,'Photo missing',{family:'helvetica',style:'normal',size:9,color:'#555555',align:'center'},localCard.photoFrame,2);
      if(settings.imageStyle.borderWidth>0)drawBackContainer(thumbnailContext,localCard.photoFrame,{...settings.imageStyle,transparent:true});
      thumbnailContext.restore();
    }
    byId('back-thumbnail-status').textContent='';
    renderConstraints(summary);
    byId('back-cover-grants').disabled=locked();byId('back-cover-parent').disabled=locked()||!folder;
    byId('back-cover-prev').disabled=locked()||offset===0;byId('back-cover-next').disabled=locked()||offset+LIST_LIMIT>=total;
    byId('back-cover-page').textContent=`${Math.min(offset+1,total)}–${Math.min(offset+LIST_LIMIT,total)} of ${total} entries`;
    byId('back-cover-file-list').querySelectorAll('button').forEach(button=>{button.disabled=locked()||button.dataset.blocked==='true';});
    byId('back-cover-message').textContent=notice||(!available&&imageMode?'Image folder access unavailable.':'');
    objectControls.render();
  }
  /** Restore the browser list without requesting permission outside a user gesture. */
  async function restore() {
    if(!available)return;
    try {grants=await files.getGrants();if(disposed)return;const saved=assets.get('back-cover');grant=grants.find(item=>item.grantId===saved?.metadata.grantId)||grants.find(item=>item.available)||null;grantOptions();if(grant){byId('back-cover-browser').hidden=false;await browse();}}
    catch(error){status(`Folder list unavailable: ${error.message}`);}
  }
  return {render,restore,summary:()=>backCoverStatus(getState()),dispose(){disposed=true;token++;objectControls.dispose();previewResizeObserver?.disconnect();canvas.width=canvas.height=1;thumbnailCanvas.width=thumbnailCanvas.height=1;}};
}
