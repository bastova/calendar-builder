import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { importCustomFont, restoreCustomFonts } from '../public/calendar/src/scripts/custom-fonts.js';
import { FONT_CATALOG, FONT_LABELS, CSS_FONT_FAMILIES, loadCalendarFonts } from '../public/calendar/src/scripts/fonts.js';
import { LAYOUT_FONTS, normalizeLayout } from '../public/calendar/src/scripts/layout.js';

const fontRoot=new URL('../public/calendar/fonts/',import.meta.url);
const buffer=await readFile(new URL('lato/Lato-Regular.ttf',fontRoot));
const bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
const file=(name='My uploaded face.ttf',data=bytes)=>({name,size:data.byteLength,arrayBuffer:async()=>data.slice(0)});
const records=new Map();
let storageFails=false,faceFails=false,loads=0;
const faces=[];
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
globalThis.FontFace=class {
  constructor(family,data,descriptors){Object.assign(this,{family,data,descriptors,status:'unloaded'});}
  async load(){loads++;if(faceFails)throw new Error('Invalid face');this.status='loaded';return this;}
};
globalThis.document={fonts:{add:face=>faces.push(face)}};
function Pdf(){}
Pdf.API={events:[]};
globalThis.window={jspdf:{jsPDF:Pdf}};
globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>{const data=await readFile(url);return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}});
globalThis.indexedDB={open(){
  const request={};
  queueMicrotask(()=>{
    if(storageFails){request.error=new Error('Storage denied');request.onerror();return;}
    request.result={close(){},transaction(){
      const transaction={};
      transaction.objectStore=()=>({
        put(record){const operation={};queueMicrotask(()=>{records.set(record.family,structuredClone(record));transaction.oncomplete();});return operation;},
        getAll(){const operation={};queueMicrotask(()=>{operation.result=structuredClone([...records.values()]);transaction.oncomplete();});return operation;}
      });
      return transaction;
    }};
    request.onsuccess();
  });
  return request;
}};

test('custom TrueType import, dynamic PDF registry, dedupe, restore and failures',async t=>{
  await loadCalendarFonts();
  const event=Pdf.API.events.find(([name])=>name==='addFonts')[1];
  await t.test('imports real bundled bytes with safe ID and normal-only style',async()=>{
    const result=await importCustomFont(file());
    assert.match(result.family,/^custom_[a-f0-9]{64}$/);
    assert.equal(result.label,'My uploaded face');assert.equal(result.persisted,true);
    assert.equal(FONT_LABELS[result.family],result.label);
    assert.deepEqual(Object.keys(FONT_CATALOG[result.family].files),['normal']);
    assert.equal(CSS_FONT_FAMILIES[result.family],result.family);
    assert.equal(LAYOUT_FONTS,CSS_FONT_FAMILIES);
    assert.equal(normalizeLayout({fonts:{title:{family:result.family,style:'bold'}}}).fonts.title.family,result.family);
    assert.equal(normalizeLayout({fonts:{title:{family:result.family,style:'bold'}}}).fonts.title.style,'normal');
    assert.equal(faces.at(-1).family,result.family);
    assert.deepEqual(faces.at(-1).descriptors,{weight:'400',style:'normal'});
    const before=loads;
    assert.deepEqual(await importCustomFont(file('Renamed.ttf')),result);
    assert.equal(loads,before);assert.equal(records.size,1);
    const registered=[];
    event.call({addFileToVFS(name,data){assert.ok(data.length);},addFont(...args){registered.push(args);}});
    assert.ok(registered.some(([,family,style])=>family===result.family&&style==='normal'));
  });
  await t.test('restores before normalization and isolates damaged records',async()=>{
    const restoredBuffer=await readFile(new URL('abel/Abel-Regular.ttf',fontRoot));
    const data=restoredBuffer.buffer.slice(restoredBuffer.byteOffset,restoredBuffer.byteOffset+restoredBuffer.byteLength);
    records.set('restore',{label:'Restored font',data});
    records.set('broken',{label:'Broken font',data:new ArrayBuffer(2)});
    const errors=await restoreCustomFonts();
    assert.equal(errors.length,1);assert.match(errors[0],/Broken font/);
    const family=Object.keys(FONT_CATALOG).find(key=>FONT_CATALOG[key].label==='Restored font');
    assert.ok(family);assert.equal(normalizeLayout({fonts:{title:{family}}}).fonts.title.family,family);
  });
  await t.test('storage denial is nonfatal and usable in session',async()=>{
    storageFails=true;
    const result=await importCustomFont(file());assert.equal(result.persisted,false);
    assert.ok(FONT_CATALOG[result.family]);
    assert.match((await restoreCustomFonts())[0],/Storage denied/);
    storageFails=false;
  });
  await t.test('rejects unsupported, damaged, oversized and browser-rejected fonts',async()=>{
    await assert.rejects(importCustomFont(file('face.otf')),/\.ttf/);
    await assert.rejects(importCustomFont({...file(),size:11*1024*1024}),/10 MiB/);
    await assert.rejects(importCustomFont(file('empty.ttf',new ArrayBuffer(0))),/non-empty/);
    const invalid=bytes.slice(0);new DataView(invalid).setUint32(0,0x4f54544f);
    await assert.rejects(importCustomFont(file('cff.ttf',invalid)),/OTF\/CFF/);
    const variable=bytes.slice(0);new Uint8Array(variable,12,4).set([102,118,97,114]);
    await assert.rejects(importCustomFont(file('variable.ttf',variable)),/Variable/);
    await assert.rejects(importCustomFont(file('truncated.ttf',bytes.slice(0,100))),/damaged|truncated/);
    const unregistered=bytes.slice(0);new Uint8Array(unregistered)[unregistered.byteLength-1]^=1;
    faceFails=true;
    await assert.rejects(importCustomFont(file('rejected.ttf',unregistered)),/browser could not load/);
    faceFails=false;
    const result=await importCustomFont(file('retry.ttf',unregistered));assert.equal(result.persisted,true);
  });
});
