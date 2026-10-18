/** Shared rounded outlines and drawing operations for Canvas and jsPDF. */
export function roundedSides(x,y,width,height,radius=0) {
  const source=typeof radius==='number'?{tl:radius,tr:radius,br:radius,bl:radius}:radius;
  let r=Object.fromEntries(['tl','tr','br','bl'].map(key=>[key,Math.max(0,Number(source[key])||0)]));
  const scale=Math.min(1,width/Math.max(1e-9,r.tl+r.tr,r.bl+r.br),height/Math.max(1e-9,r.tl+r.bl,r.tr+r.br));
  r=Object.fromEntries(Object.entries(r).map(([key,value])=>[key,value*scale]));
  const arc=(cx,cy,r,start)=>r?Array.from({length:9},(_,i)=>[cx+r*Math.cos(start+i*Math.PI/16),cy+r*Math.sin(start+i*Math.PI/16)]):[[cx,cy]];
  const tl=arc(x+r.tl,y+r.tl,r.tl,Math.PI),tr=arc(x+width-r.tr,y+r.tr,r.tr,-Math.PI/2),br=arc(x+width-r.br,y+height-r.br,r.br,0),bl=arc(x+r.bl,y+height-r.bl,r.bl,Math.PI/2);
  return {top:[...tl,...tr],right:[tr.at(-1),br[0]],bottom:[...br,...bl],left:[bl.at(-1),tl[0]]};
}
export function roundedOutline(x,y,width,height,radius=0) {
  const sides=roundedSides(x,y,width,height,radius);
  return [...sides.top,...sides.bottom];
}
export function canvasOutline(ctx,points,closed=true) {ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(closed)ctx.closePath();}
export function pdfOutline(doc,points,shift=0,style=null,closed=true) {
  const [first,...rest]=points;
  doc.lines(rest.map((point,index)=>[point[0]-points[index][0],point[1]-points[index][1]]),first[0]+shift,first[1]+shift,[1,1],style,closed);
}
export function canvasDecoration(ctx,item,clip) {
  ctx.save();if(item.clip&&clip){canvasOutline(ctx,clip);ctx.clip();}
  canvasOutline(ctx,item.points,item.closed!==false);
  if(item.fill){ctx.fillStyle=item.fill;ctx.fill();}
  if(item.stroke&&item.width>0){ctx.strokeStyle=item.stroke;ctx.lineWidth=item.width;ctx.stroke();}
  ctx.restore();
}
export function pdfDecoration(doc,item,clip,shift) {
  if(!item.fill&&!(item.stroke&&item.width>0)) return;
  doc.saveGraphicsState();if(item.clip&&clip){pdfOutline(doc,clip,shift);doc.clip();doc.discardPath();}
  if(item.fill)doc.setFillColor(item.fill);
  if(item.stroke&&item.width>0){doc.setDrawColor(item.stroke);doc.setLineWidth(item.width);}
  pdfOutline(doc,item.points,shift,item.fill?(item.stroke&&item.width>0?'FD':'F'):'S',item.closed!==false);doc.restoreGraphicsState();
}
