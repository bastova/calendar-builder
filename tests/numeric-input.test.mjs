import test from 'node:test';
import assert from 'node:assert/strict';
import {numericDraft,commitNumericOnBlur} from '../public/calendar/src/scripts/numeric-input.js';
class Input extends EventTarget {
  value='';
  get valueAsNumber(){return this.value.trim()===''?NaN:Number(this.value);}
  blur(){this.dispatchEvent(new Event('blur'));}
  type(value){this.value=value;this.dispatchEvent(new Event('input'));}
}
function setting(min,max,initial,options) {
  const input=new Input();input.value=String(initial);let saved=initial;
  input.addEventListener('input',()=>{const value=numericDraft(input,min,max);if(value!==null)saved=value;});
  commitNumericOnBlur(input,min,max,()=>saved,options);
  return {input,get saved(){return saved;}};
}
test('typing 31 preserves the first digit in a shape-size field',()=>{
  const field=setting(8,100,36);
  field.input.type('3');assert.equal(field.input.value,'3');assert.equal(field.saved,36);
  field.input.type('31');assert.equal(field.saved,31);field.input.blur();assert.equal(field.input.value,'31');
});
test('percent shares, thumbnail zoom, fonts and document sizes allow incomplete drafts',()=>{
  for(const [min,max,initial,draft,complete] of [[15,85,62,'3','31'],[1,4,1,'0','0.5'],[4,144,22,'3','31'],[1900,9999,2027,'2','2028'],[4,24,12,'2','24'],[.25,2,.5,'0','0.75']]) {
    const field=setting(min,max,initial);
    field.input.type(draft);assert.equal(field.input.value,draft);assert.equal(field.saved,initial);
    field.input.type(complete);assert.equal(field.input.value,complete);
    field.input.blur();assert.equal(Number(field.input.value),Math.max(min,Math.min(max,Number(complete))));
  }
});
test('empty and invalid drafts restore last accepted value and high values clamp on commit',()=>{
  const field=setting(8,100,36);
  for(const draft of ['', '-', 'e']) {field.input.type(draft);field.input.blur();assert.equal(field.input.value,'36');}
  field.input.type('999');assert.equal(field.input.value,'999');assert.equal(field.saved,36);
  field.input.blur();assert.equal(field.saved,100);
});
test('Enter commits and document years round only when editing ends',()=>{
  const field=setting(1900,9999,2027,{integer:true});field.input.type('2027.5');
  assert.equal(field.input.value,'2027.5');
  const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Enter'});
  field.input.dispatchEvent(event);assert.equal(field.input.value,'2028');assert.ok(event.defaultPrevented);
});
test('a rejected cross-field change restores the accepted setting',()=>{
  const input=new Input();let saved=12;
  input.addEventListener('input',()=>{const value=numericDraft(input,4,24);if(value!==null&&value>=10)saved=value;});
  commitNumericOnBlur(input,4,24,()=>saved);
  input.type('5');assert.equal(input.value,'5');input.blur();assert.equal(input.value,'12');
});
