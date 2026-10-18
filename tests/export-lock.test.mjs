import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/calendar/src/scripts/main.js',import.meta.url),'utf8');
const handlers=source.slice(source.indexOf('let previewUrl;'),source.indexOf("byId('share-design').disabled"));
function setup({fail=false,setupError=false,cleanupError=false}={}) {
  const nodes=new Map();
  function node(id,disabled=false,dialog=false) {
    const item={disabled,isConnected:true,textContent:'',listeners:{},closest:selector=>selector==='dialog'&&dialog?item:null,addEventListener(type,fn){this.listeners[type]=fn;},showModal(){this.open=true;},close(){this.open=false;}};
    nodes.set(id,item);return item;
  }
  const enabled=node('enabled'),disabled=node('disabled',true),photo=node('photo');
  for(const id of ['pdf-preview-dialog','close-pdf-preview','pdf-preview-frame','save-preview-pdf','pdf-progress','preview-pdf','download-pdf'])node(id,false,id.includes('preview'));
  let resolve;
  const result=new Promise((done,reject)=>{resolve=()=>fail?reject(new Error('PDF failed')):done({blob:{},filename:'calendar.pdf',pages:14,mediaWidth:12,mediaHeight:12,warnings:[]});});
  const classes=new Set();
  const context=vm.createContext({Map,Boolean,URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL(){}},document:{querySelector:()=>null,querySelectorAll:()=>[enabled,disabled,photo,nodes.get('close-pdf-preview')],body:{classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)}}},byId:id=>nodes.get(id),assets:{pending:0},photoEditor:{files:{},setBusy(value){photo.disabled=value;if(value&&setupError)throw new Error('setup render');if(!value&&cleanupError)throw new Error('cleanup render');}},preflight:()=>({ready:true}),state:{},downloadCalendarPdf:()=>result,format:String,render(){},busy:false});
  vm.runInContext(handlers,context);
  return {nodes,classes,context,resolve,run:action=>nodes.get(action).listeners.click()};
}
for(const action of ['preview-pdf','download-pdf'])for(const fail of [false,true]) {
  test(`${action} ${fail?'failure':'success'} restores pre-export controls`,async()=>{
    const app=setup({fail});const running=app.run(action);
    assert.equal(app.nodes.get('enabled').disabled,true);
    assert.equal(app.nodes.get('close-pdf-preview').disabled,false);
    app.nodes.get('close-pdf-preview').listeners.click();
    app.resolve();await running;
    assert.equal(app.context.busy,false);
    assert.equal(app.classes.size,0);
    assert.equal(app.nodes.get('enabled').disabled,false);
    assert.equal(app.nodes.get('disabled').disabled,true);
    assert.equal(app.nodes.get('photo').disabled,false);
    assert.match(app.nodes.get('pdf-progress').textContent,fail?/Export failed/:action==='preview-pdf'?/Preview ready/:/Download requested/);
  });
}
for(const options of [{setupError:true},{cleanupError:true}])test(`render exception releases export lock ${JSON.stringify(options)}`,async()=>{
  const app=setup(options);const running=app.run('preview-pdf');app.resolve();await running;
  assert.equal(app.context.busy,false);
  assert.equal(app.nodes.get('enabled').disabled,false);
  assert.equal(app.nodes.get('photo').disabled,false);
  assert.equal(app.nodes.get('disabled').disabled,true);
});

test('preparation does not capture-block the workspace; export exempts dialogs',()=>{
  const capture=source.slice(source.indexOf("for(const type of ['click'"),source.indexOf("byId('pdf-export-target').addEventListener",source.indexOf("for(const type of ['click'")));
  let handler;
  class Element {constructor(dialog=false){this.dialog=dialog;}closest(selector){return selector==='main'||(selector==='dialog'&&this.dialog);}}
  const context=vm.createContext({Element,busy:false,assets:{pending:1},document:{addEventListener(type,fn){handler=fn;}}});
  vm.runInContext(capture,context);
  let blocked=false;
  const event=dialog=>({target:new Element(dialog),preventDefault(){blocked=true;},stopImmediatePropagation(){}});
  handler(event(false));assert.equal(blocked,false);
  context.busy=true;handler(event(true));assert.equal(blocked,false);
  handler(event(false));assert.equal(blocked,true);
});

test('throwing asset subscribers cannot leak pending or prevent export unlock',async()=>{
  globalThis.localStorage={getItem:()=>null,setItem(){}};
  globalThis.window={pica:()=>({resize:async()=>{}})};
  const {createAssetStore}=await import('../public/calendar/src/scripts/media.js');
  const store=createAssetStore();let notifications=0;
  const original=console.error;console.error=()=>{};
  try {
    store.subscribe(()=>{throw new Error('subscriber render');});
    store.subscribe(()=>notifications++);
    const end=store.beginFileOperation();assert.equal(store.pending,1);
    end();end();assert.equal(store.pending,0);assert.equal(notifications,2);
    await store.restore({});assert.equal(store.pending,0);
    store.beginExport();assert.throws(()=>store.beginFileOperation(),/locked/);
    store.endExport();const finish=store.beginFileOperation();finish();assert.equal(store.pending,0);
  } finally {console.error=original;store.dispose();}
});
