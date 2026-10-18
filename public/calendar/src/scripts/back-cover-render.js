import { canvasFont } from './layout.js';
import { roundedOutline, canvasOutline } from './grid-decoration.js';
import { BACK_POINTS, backContentRect, backObjectImageMapping } from './back-cover-model.js';

const BACK_LINE_HEIGHT = 1.35;
const BACK_TEXT_ASCENT = 1.05;
const alignFraction = value => value==='right'||value==='bottom'?1:value==='center'||value==='middle'?.5:0;

/** Shared rounded outline for fills, borders and clipping in every back-cover output. */
export function backContainerPath(context,box,style) {
  canvasOutline(context,roundedOutline(box.x,box.y,box.width,box.height,{tl:style.radiusTL/BACK_POINTS,tr:style.radiusTR/BACK_POINTS,bl:style.radiusBL/BACK_POINTS,br:style.radiusBR/BACK_POINTS}));
}

/** Transparent means no fill operation; borders remain independently printable. */
export function drawBackContainer(context,box,style) {
  context.save();backContainerPath(context,box,style);
  if(!style.transparent){context.fillStyle=style.background;context.fill();}
  if(style.borderWidth>0){context.strokeStyle=style.borderColor;context.lineWidth=style.borderWidth/BACK_POINTS;context.stroke();}
  context.restore();
}

/** Lay out character runs without HTML, font shrinking or mutating saved text. */
export function backTextLines(context,runs,width,fallback) {
  const tokens=[];
  for(const run of runs)for(const text of run.text.match(/\n|[^\S\n]+|[^\s]+/gu)??[])tokens.push({text,font:run.font});
  // Adjacent character runs inside one word wrap together, independent of their styles.
  let wordWidth=0;
  for(let index=tokens.length-1;index>=0;index--) {
    const token=tokens[index];
    if(/^\s+$/u.test(token.text)){wordWidth=0;continue;}
    context.font=canvasFont(token.font,token.font.size/BACK_POINTS);wordWidth+=context.measureText(token.text).width;token.wordWidth=wordWidth;
  }
  const initial=()=>({parts:[],width:0,height:0,size:0}),lines=[];let line=initial();
  const flush=()=>{if(!line.parts.length){line.size=fallback.size/BACK_POINTS;line.height=line.size*BACK_LINE_HEIGHT;}lines.push(line);line=initial();};
  const add=(text,font)=>{context.font=canvasFont(font,font.size/BACK_POINTS);const measured=context.measureText(text).width,last=line.parts.at(-1);if(last&&['family','style','size','color'].every(key=>last.font[key]===font[key])){last.text+=text;last.width+=measured;}else line.parts.push({text,font,x:line.width,width:measured});line.width+=measured;line.size=Math.max(line.size,font.size/BACK_POINTS);line.height=Math.max(line.height,font.size/BACK_POINTS*BACK_LINE_HEIGHT);};
  let insideWord=false;
  for(const token of tokens) {
    if(token.text==='\n'){flush();insideWord=false;continue;}
    const whitespace=/^\s+$/u.test(token.text);
    if(!whitespace&&!insideWord&&line.parts.length&&line.width+token.wordWidth>width)flush();
    add(token.text,token.font);insideWord=!whitespace;
  }
  if(line.parts.length||!lines.length||tokens.at(-1)?.text==='\n')flush();
  return lines;
}

/** Render the identical rich-text layout to preview, scene and generated PDF raster. */
export function drawBackRichText(context,object) {
  const box=backContentRect(object.rect,object.style);if(box.width<=0||box.height<=0)return {overflow:true};
  const lines=backTextLines(context,object.runs,box.width,object.font),height=lines.reduce((sum,line)=>sum+line.height,0),align=object.style.align==='inherit'?object.font.align:object.style.align;
  context.save();backContainerPath(context,object.rect,object.style);context.clip();context.beginPath();context.rect(box.x,box.y,box.width,box.height);context.clip();context.textAlign='left';context.textBaseline='alphabetic';
  let y=box.y+Math.max(0,box.height-height)*alignFraction(object.style.vertical);
  for(const line of lines) {
    const x=box.x+Math.max(0,box.width-line.width)*alignFraction(align);
    for(const part of line.parts){context.font=canvasFont(part.font,part.font.size/BACK_POINTS);context.fillStyle=part.font.color;context.fillText(part.text,x+part.x,y+line.size*BACK_TEXT_ASCENT);}
    y+=line.height;
  }
  context.restore();return {overflow:height>box.height||lines.some(line=>line.width>box.width),height,lines};
}

/** Paint image content inside both padded bounds and its independently rounded container. */
export function drawBackObjectImage(context,object,record) {
  const box=backContentRect(object.rect,object.style);if(box.width<=0||box.height<=0||!record)return;
  context.save();backContainerPath(context,object.rect,object.style);context.clip();context.beginPath();context.rect(box.x,box.y,box.width,box.height);context.clip();
  if(record.fullArtwork)context.drawImage(record.fullArtwork,box.x,box.y,box.width,box.height);
  else if(record.bitmap){const mapping=backObjectImageMapping(object,record.metadata);context.drawImage(record.bitmap,box.x+mapping.x,box.y+mapping.y,mapping.width,mapping.height);}
  context.restore();
}

/** Draw one ordered custom layer. Callers own asset lookup and original-file lifetimes. */
export function drawBackObject(context,object,record=null) {
  drawBackContainer(context,object.rect,object.style);
  let result;
  if(object.type==='text')result=drawBackRichText(context,object);
  else drawBackObjectImage(context,object,record);
  if(object.style.borderWidth>0)drawBackContainer(context,object.rect,{...object.style,transparent:true});
  return result;
}
