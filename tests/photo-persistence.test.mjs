import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const bridgeSource=await readFile(new URL('../public/calendar/browser-files.js',import.meta.url),'utf8');
function bridge(records, {handle,files}={}) {
  const idb={deleteDatabase(){},open(){const request={};queueMicrotask(()=>{request.result={onversionchange:null,transaction(){const tx={};tx.objectStore=()=>({getAll:()=>operation(()=>[...records.values()]),get:key=>operation(()=>records.get(key)),put:value=>operation(()=>{records.set(value.grantId,structuredCloneSafe(value));return value.grantId;}),delete:key=>operation(()=>records.delete(key))});function operation(fn){const req={};queueMicrotask(()=>{req.result=fn();tx.oncomplete?.();});return req;}return tx;}};request.onsuccess();});return request;}};
  // Native handles are structured-cloneable browser objects; preserve test doubles.
  function structuredCloneSafe(value){return value;}
  const window={indexedDB:idb,addEventListener(){},removeEventListener(){}};
  if(handle)window.showDirectoryPicker=async()=>handle;
  const document={body:{append(){}},createElement(){const listeners={};return {files:files||[],setAttribute(){},addEventListener(name,callback){listeners[name]=callback;},remove(){},click(){listeners.change();}};}};
  vm.runInNewContext(bridgeSource,{window,indexedDB:idb,document,crypto:{randomUUID:()=>String(records.size+1)},setTimeout,clearTimeout,Uint8Array,Map,Date,Number,Promise});
  return window.Bezi.files;
}
test('directory references survive sessions and read permission can be renewed',async()=>{
  const records=new Map();let permission='granted',requests=0;
  const original={size:100*1024*1024,lastModified:1000,type:'image/jpeg',name:'large.jpg'};
  const handle={name:'Photos',queryPermission:async()=>permission,requestPermission:async()=>{requests++;return permission='granted';},isSameEntry:async other=>other===handle,getFileHandle:async()=>({kind:'file',getFile:async()=>original})};
  const first=bridge(records,{handle});const grant=await first.requestDirectory();
  assert.equal(records.get(grant.grantId).handle,handle);
  assert.equal(records.get(grant.grantId).files,undefined);
  permission='prompt';const next=bridge(records,{handle});
  assert.equal((await next.getGrants())[0].available,false);
  await assert.rejects(next.readFile(grant.grantId,'large.jpg'),/permission unavailable/);
  await next.restorePermission(grant.grantId);
  assert.equal(requests,1);
  assert.equal(await next.readFile(grant.grantId,'large.jpg'),original);
});
test('fallback keeps only a manifest and reselecting restores the same grant',async()=>{
  const records=new Map();const file={name:'large.jpg',webkitRelativePath:'Photos/large.jpg',size:100*1024*1024,lastModified:1000,type:'image/jpeg'};
  const first=bridge(records,{files:[file]}),grant=await first.requestDirectory();
  assert.equal(records.get(grant.grantId).files[0].file,undefined);
  assert.equal(await first.readFile(grant.grantId,'large.jpg'),file);
  const next=bridge(records,{files:[file]});
  assert.equal((await next.getGrants())[0].available,false);
  const restored=await next.requestDirectory();
  assert.equal(restored.grantId,grant.grantId);
  assert.equal(await next.readFile(grant.grantId,'large.jpg'),file);
});
test('large originals restore through bounded decoding and Pica without saving image contents',async()=>{
  const storage=new Map(),decodes=[],resizes=[];
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  globalThis.window={pica:()=>({resize:async(source,target)=>resizes.push({width:target.width,height:target.height})})};
  globalThis.document={createElement:()=>({width:0,height:0})};
  globalThis.createImageBitmap=async(source,options)=>{if(options)decodes.push(options);return {width:options?.resizeWidth||source.width,height:options?.resizeHeight||source.height,close(){}};};
  const header=new Uint8Array(24);header.set([137,80,78,71,13,10,26,10]);const view=new DataView(header.buffer);view.setUint32(16,10000);view.setUint32(20,10000);
  const blob=new Blob([header,new Uint8Array(9*1024*1024)]),modified='2026-01-01T00:00:00.000Z';
  storage.set('calendar-layout-photo-assets-v1',JSON.stringify({'month-0':{grantId:'photos',relativePath:'large.png',sourceWidth:10000,sourceHeight:10000,sourceBytes:blob.size,sourceModifiedAt:modified}}));
  const {createAssetStore}=await import('../public/calendar/src/scripts/media.js');
  const assets=createAssetStore();await assets.restore({stat:async()=>({kind:'file',name:'large.png',relativePath:'large.png',size:blob.size,modifiedAt:modified}),readFile:async()=>blob});
  assert.ok(assets.get('month-0').bitmap,assets.get('month-0').error);
  assert.ok(decodes[0].resizeWidth<=1536&&decodes[0].resizeHeight<=1536);
  assert.ok(resizes.some(size=>size.width<=768&&size.height<=768));
  for(const value of storage.values())assert.ok(value.length<2000,'Only references and crops should be persisted');
  assets.dispose();
});
