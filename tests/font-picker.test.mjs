import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshFontPicker, bindFontPicker } from '../public/calendar/src/scripts/font-picker.js';
import { FONT_LABELS, CSS_FONT_FAMILIES } from '../public/calendar/src/scripts/fonts.js';

class Element {
  constructor() { this.value='';this.dataset={};this.style={};this.children=[];this.listeners={};this.attributes={}; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children=[]; }
  setAttribute(key,value) { this.attributes[key]=value; }
  addEventListener(type,callback) { (this.listeners[type]??=[]).push(callback); }
  click() { this.clicked=true; }
}

test('font pickers refresh live families, preserve selection, and expose upload',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>new Element()};
  try {
    const select=new Element();select.value='times';
    refreshFontPicker(select);
    assert.equal(select.value,'times');
    assert.equal(select.children.at(-1).textContent,'Upload custom font…');
    FONT_LABELS.custom_test='My uploaded font';CSS_FONT_FAMILIES.custom_test='custom_test';
    refreshFontPicker(select);
    assert.equal(select.children.find(option=>option.value==='custom_test').textContent,'My uploaded font');
    assert.equal(select.value,'times');
  } finally {delete FONT_LABELS.custom_test;delete CSS_FONT_FAMILIES.custom_test;globalThis.document=original;}
});

test('upload choice opens a restricted file chooser without applying sentinel as a family',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>new Element()};
  try {
    const select=new Element();select.value='helvetica';select.parentElement=new Element();
    bindFontPicker(select);
    const [input,status]=select.parentElement.children;
    assert.equal(input.accept,'.ttf');assert.equal(status.attributes.role,'status');
    select.value='__upload_custom_font__';let stopped=false;
    select.listeners.change[0]({stopImmediatePropagation(){stopped=true;}});
    assert.equal(select.value,'helvetica');assert.equal(input.clicked,true);assert.equal(stopped,true);
    assert.match(status.textContent,/static .ttf/);
  } finally {globalThis.document=original;}
});
