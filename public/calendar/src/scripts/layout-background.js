import {normalizeLayout} from './layout.js';
import { assets, drawPhoto } from './media.js';
/** Use the normal persisted photo reference and crop, never save image bytes in settings. */
export function paintLayoutBackground(context,state) {
  const record=assets.get('layout-background');
  if(record?.bitmap) {
    const bleed=state.bleed??0;context.save();context.translate(-bleed,-bleed);
    drawPhoto(context,record.bitmap,record.metadata.crop,{...state,photoBackground:normalizeLayout(state.layout).layoutBackgroundTransparent?'transparent':normalizeLayout(state.layout).layoutBackground},state.width+2*bleed,state.height+2*bleed,false,record.metadata);context.restore();
  }
}
