import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map(), bitmaps = [], decodes = [];
globalThis.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
globalThis.window = {pica:()=>({resize:async()=>{}})};
globalThis.document = {createElement:()=>({width:0,height:0})};
globalThis.createImageBitmap = async (source,options) => {
  if (options) decodes.push(options);
  const bitmap = {width:options?.resizeWidth||source.width,height:options?.resizeHeight||source.height,closed:false,close(){this.closed=true;}};
  bitmaps.push(bitmap);return bitmap;
};
const {createAssetStore,normalizeCrop} = await import('../public/calendar/src/scripts/media.js');
const {BACK_OBJECT_LIMIT} = await import('../public/calendar/src/scripts/back-cover-model.js');
const header = new Uint8Array(24);
header.set([137,80,78,71,13,10,26,10]);
new DataView(header.buffer).setUint32(16,10000);
new DataView(header.buffer).setUint32(20,10000);
const blob = new Blob([header]);
const files = {stat:async(_grant,path)=>({kind:'file',name:path,relativePath:path,size:blob.size,modifiedAt:'today'}),readFile:async()=>blob};
const reference = {grantId:'imported',grantName:'Imported folder',relativePath:'art.png',crop:{x:.2,y:.8,zoomX:1.5,zoomY:.6,offsetX:.1,offsetY:-.2,aspectLocked:false}};

test('import stages bounded previews, commits atomically and persists only references and crops',async()=>{
  storage.clear();const store=createAssetStore();let notifications=0;
  store.subscribe(()=>notifications++);
  const transaction=await store.prepareImport({'month-0':reference,'back-object-art':reference},files);
  assert.deepEqual(store.metadata(),{});assert.equal(storage.size,0);assert.equal(notifications,0);
  assert.ok(decodes.every(options=>options.resizeWidth<=1536&&options.resizeHeight<=1536));
  assert.equal(transaction.commit(),undefined);
  assert.deepEqual(store.get('month-0').metadata.crop,normalizeCrop(reference.crop));
  assert.ok(store.get('month-0').bitmap.width<=768);assert.equal(notifications,1);
  const oldBitmap=store.get('month-0').bitmap;
  transaction.dispose();assert.equal(oldBitmap.closed,false);
  const saved=JSON.parse([...storage.values()][0]);
  assert.equal(saved['month-0'].bitmap,undefined);assert.equal(saved['month-0'].relativePath,'art.png');
  const replacement=await store.prepareImport({},files);replacement.commit();
  assert.equal(oldBitmap.closed,true);assert.deepEqual(store.metadata(),{});
  store.dispose();
});

test('failed import releases staged images without touching current records or persistence',async()=>{
  storage.clear();const store=createAssetStore();
  (await store.prepareImport({'month-0':reference},files)).commit();
  const record=store.get('month-0'),before=[...storage],start=bitmaps.length;
  await assert.rejects(store.prepareImport({'month-1':reference,'month-2':{...reference,relativePath:'missing.png'}},{...files,readFile:async(_grant,path)=>{if(path==='missing.png')throw new Error('Missing image');return blob;}}),/Missing image/);
  assert.equal(store.get('month-0'),record);assert.deepEqual([...storage],before);
  assert.ok(bitmaps.slice(start).every(bitmap=>bitmap.closed));
  await assert.rejects(store.prepareImport({'month-1':reference},{...files,readFile:async()=>new Blob(['unreadable'])}),/changed|Unsupported/);
  assert.equal(store.get('month-0'),record);store.dispose();
});

test('validation bounds keys and paths, while dispose and commit enforce transaction lifetime and edit locks',async()=>{
  storage.clear();const store=createAssetStore();
  await assert.rejects(store.prepareImport({unknown:reference},files),/Unknown artwork/);
  await assert.rejects(store.prepareImport({'month-0':{...reference,relativePath:'../bad.png'}},files),/Invalid photo reference/);
  const excessive=Object.fromEntries(Array.from({length:BACK_OBJECT_LIMIT+1},(_,index)=>[`back-object-${index}`,reference]));
  await assert.rejects(store.prepareImport(excessive,files),/limit/);
  const transaction=await store.prepareImport({'month-0':reference},files),preview=bitmaps.at(-1);
  const finish=store.beginFileOperation();assert.throws(()=>transaction.commit(),/Wait for/);finish();
  store.beginExport();assert.throws(()=>transaction.commit(),/locked/);store.endExport();
  transaction.dispose();transaction.dispose();assert.equal(preview.closed,true);
  assert.throws(()=>transaction.commit(),/disposed/);assert.deepEqual(store.metadata(),{});assert.equal(storage.size,0);
  const next=await store.prepareImport({},files);next.commit();assert.throws(()=>next.commit(),/already committed/);
  store.dispose();
});
