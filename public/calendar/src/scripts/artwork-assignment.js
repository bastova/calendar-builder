import {normalizeLayout,FILLER_KEYS,fillerPrefix} from './layout.js';
import {normalizeBackCover} from './back-cover.js';
/** Activate optional artwork only after a successful user assignment, never on restore or crop edits. */
export function activateAssignedArtwork(state,key) {
  if(key==='layout-background')return {...state,layout:normalizeLayout({...state.layout,layoutBackgroundImage:true}),previewClosed:false,endSpread:null};
  if(key==='back-cover-background')return {...state,backCover:normalizeBackCover({...state.backCover,mode:'dynamic',backgroundImage:true})};
  if(FILLER_KEYS.includes(key))return {...state,layout:normalizeLayout({...state.layout,[`${fillerPrefix(key)}Image`]:true}),previewClosed:false,endSpread:state[key.startsWith('opening')?'includeOpeningSpread':'includeClosingSpread']!==false?key.split('-')[0]:null};
  return state;
}
