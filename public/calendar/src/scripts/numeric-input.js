/** Incomplete numeric drafts never replace the last applied setting. */
export function numericDraft(control,min,max) {
  const value=control.valueAsNumber;
  return Number.isFinite(value)&&value>=min&&value<=max?value:null;
}
/** Apply bounds on blur/Enter, then restore the accepted value if validation rejected it. */
export function commitNumericOnBlur(control,min,max,getSaved,{integer=false}={}) {
  control.addEventListener('blur',()=>{
    const draft=control.valueAsNumber;
    if(Number.isFinite(draft)) {
      let value=Math.max(min,Math.min(max,draft));
      if(integer)value=Math.round(value);
      control.value=String(value);
      control.dispatchEvent(new Event('input'));
    }
    const accepted=String(getSaved());
    if(control.value!==accepted) {
      control.value=accepted;
      control.dispatchEvent(new Event('input'));
    }
  });
  control.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();control.blur();}
  });
}
