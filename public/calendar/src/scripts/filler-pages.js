import {assets,drawPhoto} from './media.js';
import {fillerAppearance} from './layout.js';
export function drawFillerPage(context,state,key,width,height,trim=true) {
  const appearance=fillerAppearance(state,key),record=appearance.image?assets.get(key):null;
  if(!appearance.transparent){context.fillStyle=appearance.color;context.fillRect(0,0,width,height);}
  if(record?.bitmap)drawPhoto(context,record.bitmap,record.metadata.crop,{...state,photoBackground:appearance.transparent?'transparent':appearance.color},width,height,trim,record.metadata);
}
