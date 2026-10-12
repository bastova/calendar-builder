const supportCache=new WeakMap();
/** Match export's fallback slug when this jsPDF build cannot write page boxes. */
export function pdfPageBoxSupport(Constructor=globalThis.window?.jspdf?.jsPDF){
  if(typeof Constructor!=='function')return null;
  if(!supportCache.has(Constructor)){
    const doc=new Constructor({unit:'in'});
    const context=doc.internal?.getCurrentPageInfo?.()?.pageContext ?? doc.getCurrentPageInfo?.()?.pageContext;
    supportCache.set(Constructor,Boolean(context&&'trimBox' in context&&'bleedBox' in context));
  }
  return supportCache.get(Constructor);
}
export function pdfSheetGeometry(state,boxSupport=pdfPageBoxSupport()){
  const slug=(state.cropMarks||boxSupport===false) ? .25 : 0;
  return {width:state.width+2*state.bleed+2*slug,height:state.height*(state.bindingStyle==='saddle'?2:1)+2*state.bleed+2*slug,slug,boxSupport,uncertain:boxSupport===null&&!state.cropMarks};
}
