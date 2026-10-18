import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackCover, backCoverPlan, drawBackCover, printGeneratedBackCover } from '../public/calendar/src/scripts/back-cover.js';
import { normalizeBackObjects, normalizeBackRuns, normalizeBackStyle, normalizeBackFont, formatBackRuns, replaceBackText, resizeBackRect, transformBackRect, backImageKey, backObjectImageMapping, backContentRect, BACK_TEXT_LIMIT, BACK_OBJECT_LIMIT, isBackImageKey } from '../public/calendar/src/scripts/back-cover-model.js';
import { drawBackContainer, drawBackObject, backTextLines } from '../public/calendar/src/scripts/back-cover-render.js';
import { assets, createAssetStore } from '../public/calendar/src/scripts/media.js';
import { requiredPhotoKeys, preflight } from '../public/calendar/src/scripts/pdf.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,bleed:.125,week:0};
import { createBackCoverControls } from '../public/calendar/src/scripts/back-cover-controls.js';
const font=normalizeBackFont({family:'times',style:'bold',size:18,color:'#123456'});
const text=()=>normalizeBackObjects([{id:'text-one',type:'text',rect:{x:1,y:1,width:4,height:2},runs:[{text:'Hello world',font}]}])[0];
const image=()=>normalizeBackObjects([{id:'image-one',type:'image',rect:{x:2,y:3,width:4,height:2},crop:{mode:'fill',x:.25,y:.75,zoom:2}}])[0];
function drawingContext(calls=[]) {
  return new Proxy({measureText(value){const size=Number.parseFloat(this.font?.match(/[\d.]+px/)?.[0]??'.1');return {width:String(value).length*size*.5};}}, {get(target,key){return key in target?target[key]:(...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;calls.push(['set',key,value]);return true;}});
}

test('back-cover normalization bounds hostile objects, geometry, styles and runs without accepting markup configuration',()=>{
  const normalized=normalizeBackCover({grid:{x:Infinity,y:-200,width:-4,height:NaN,rotation:90},detailsStyle:{transparent:false,background:'url(javascript:bad)',borderWidth:Infinity,paddingX:200,radiusTR:900},objects:[{id:'../../escape',type:'image',rect:{width:Infinity},crop:{mode:'bad',x:40,y:-2,zoom:Infinity}},{id:'same',type:'text',runs:[{text:'<img src=x onerror=alert(1)>',font:{family:'evil;url()',size:-6,color:'red',style:'unsafe'}}]},{id:'same',type:'text'},{id:'bad',type:'html'}]});
  assert.equal(normalized.version,3);assert.equal(normalized.grid.x,.5);assert.equal(normalized.grid.y,-48);assert.equal(normalized.grid.width,.1);assert.equal(normalized.grid.height,1);assert.equal(normalized.grid.rotation,undefined);
  assert.equal(normalized.detailsStyle.background,'#ffffff');assert.equal(normalized.detailsStyle.paddingX,144);assert.equal(normalized.detailsStyle.radiusTR,144);assert.equal(normalized.detailsStyle.borderWidth,0);
  assert.equal(normalized.objects.length,2);assert.ok(isBackImageKey(backImageKey(normalized.objects[0].id)));assert.deepEqual(normalized.objects[0].crop,{mode:'fill',x:1,y:0,zoom:1});
  assert.equal(normalized.objects[1].runs[0].text,'<img src=x onerror=alert(1)>');assert.equal(normalized.objects[1].runs[0].font.family,'helvetica');
  assert.equal(normalizeBackObjects(Array.from({length:100},(_,i)=>({id:`id-${i}`,type:'text'}))).length,BACK_OBJECT_LIMIT);
  assert.equal(normalizeBackRuns([{text:'x'.repeat(BACK_TEXT_LIMIT+10)}])[0].text.length,BACK_TEXT_LIMIT);
  assert.deepEqual(normalizeBackCover(JSON.parse(JSON.stringify(normalized))),normalized);
});

test('monthly image and artwork styles stay independent and inset all twelve chronological cards',()=>{
  const base=backCoverPlan(state),configured=backCoverPlan({...state,backCover:{detailsStyle:{paddingX:12,paddingY:6,background:'#123456',transparent:false,borderWidth:2,radiusTL:9,align:'right',vertical:'bottom'},imageStyle:{paddingX:18,paddingY:9,borderWidth:4,radiusBR:12}}});
  assert.equal(configured.cards.length,12);
  for(const [index,card] of configured.cards.entries()) {
    assert.equal(card.key,`month-${index}`);assert.equal(card.textFrame.width,base.cards[index].text.width);
    assert.ok(Math.abs(card.text.x-card.textFrame.x-13/72)<1e-9);assert.ok(Math.abs(card.photo.x-card.photoFrame.x-20/72)<1e-9);
    assert.ok(Math.abs(card.photo.y-card.photoFrame.y-11/72)<1e-9);
  }
  assert.equal(configured.settings.detailsStyle.align,'right');assert.equal(configured.settings.imageStyle.align,'inherit');assert.equal(configured.settings.imageStyle.transparent,true);
  const extreme=backCoverPlan({...state,backCover:{grid:{x:0,y:0,width:.1,height:.1},imageStyle:{paddingX:144,paddingY:144}}});
  for(const card of extreme.cards){assert.ok(card.photo.width>=0&&card.photo.height>=0);assert.ok(Number.isFinite(card.text.x));}
});

test('grid transform scales every card and its nested rectangles without scaling typography',()=>{
  const base=backCoverPlan(state),grid={x:2,y:1,width:base.grid.width/2,height:base.grid.height/3,aspectLocked:false};
  const transformed=backCoverPlan({...state,backCover:{grid}});
  for(const [index,card] of transformed.cards.entries()) {
    for(const key of ['photoFrame','textFrame','label']) {
      const expected=transformBackRect(base.cards[index][key],base.grid,grid);
      for(const field of ['x','y','width','height'])assert.ok(Math.abs(card[key][field]-expected[field])<1e-9);
    }
    assert.ok(Math.abs(card.width-base.cards[index].width/2)<1e-9);assert.ok(Math.abs(card.height-base.cards[index].height/3)<1e-9);
  }
  assert.deepEqual(transformed.fonts,base.fonts);
  assert.deepEqual(backCoverPlan({...state,backCover:{grid:null}}).grid,base.grid);
});

test('all eight corner and edge handles preserve aspect by default, pin opposites and permit free resizing',()=>{
  const original={x:2,y:3,width:4,height:2,aspectLocked:true};
  for(const handle of ['nw','n','ne','e','se','s','sw','w']) {
    const result=resizeBackRect(original,handle,.5,.25);
    assert.ok(Math.abs(result.width/result.height-2)<1e-9,handle);
    if(handle.includes('w'))assert.equal(result.x+result.width,6);
    if(handle.includes('n'))assert.equal(result.y+result.height,5);
    if(handle.includes('e'))assert.equal(result.x,2);
    if(handle.includes('s'))assert.equal(result.y,3);
    assert.equal(result.rotation,undefined);
  }
  const free=resizeBackRect(original,'e',1,0,false);assert.equal(free.width,5);assert.equal(free.height,2);
  assert.deepEqual(resizeBackRect(original,'move',1,-1),{...original,x:3,y:2});
  const inverted=resizeBackRect(original,'nw',100,100);assert.ok(inverted.width>0&&inverted.height>0);assert.ok(Math.abs(inverted.width/inverted.height-2)<1e-9);
});

test('character range formatting and subsequent plain-text edits preserve all unaffected runs',()=>{
  const original=[{text:'Hello world',font}],styled=formatBackRuns(original,1,5,{style:'italic',size:24,color:'#abcdef'});
  assert.deepEqual(styled.map(run=>run.text),['H','ello',' world']);assert.equal(styled[0].font.style,'bold');assert.equal(styled[1].font.style,'italic');assert.equal(styled[2].font.size,18);
  const edited=replaceBackText(styled,'Hello brave world',font,normalizeBackFont({style:'bolditalic'}));
  assert.equal(edited.map(run=>run.text).join(''),'Hello brave world');assert.equal(edited[0].font.style,'bold');assert.equal(edited[1].font.style,'italic');assert.ok(edited.some(run=>run.text.includes('brave')&&run.font.style==='bolditalic'));
  const restored=normalizeBackCover(JSON.parse(JSON.stringify({objects:[{...text(),runs:edited}]}))).objects[0];assert.deepEqual(restored.runs,edited);
  const unicode=formatBackRuns([{text:'A😀BC',font}],1,3,{style:'normal'});assert.equal(unicode[1].text,'😀');
  const collapsed=normalizeBackRuns([{text:'a',font},{text:'b',font}]);assert.equal(collapsed.length,1);assert.equal(collapsed[0].text,'ab');
});

test('transparent and rounded containers skip fill but keep borders; rich text uses exact styled canvas fonts',()=>{
  const calls=[],context=drawingContext(calls),style=normalizeBackStyle({transparent:true,borderWidth:2,radiusTL:18,radiusBR:9});
  drawBackContainer(context,{x:1,y:2,width:3,height:4},style);
  assert.ok(!calls.some(call=>call[0]==='fill'));assert.ok(calls.some(call=>call[0]==='stroke'));assert.ok(calls.filter(call=>call[0]==='lineTo').length>4);
  calls.length=0;const object=text();object.runs=formatBackRuns(object.runs,6,11,{family:'courier',style:'bolditalic',size:24,color:'#abcdef'});drawBackObject(context,object);
  assert.ok(calls.some(call=>call[0]==='fillText'&&call[1]==='world'));assert.ok(calls.some(call=>call[0]==='set'&&call[1]==='font'&&call[2].includes('italic bold')&&call[2].includes('Courier')));assert.ok(calls.some(call=>call[0]==='set'&&call[1]==='fillStyle'&&call[2]==='#abcdef'));
  const lines=backTextLines(context,[{text:'first\nsecond',font}],3,font);assert.equal(lines.length,2);
  const word=backTextLines(context,[{text:'A lon',font},{text:'gword',font:{...font,style:'italic'}}],.9,font);
  assert.equal(word.length,2);assert.equal(word[1].parts.map(part=>part.text).join(''),'longword');
});

test('custom image mapping, fit/fill, focal point and zoom never change container geometry or escape clips',()=>{
  const object=image(),metadata={sourceWidth:800,sourceHeight:200},original=structuredClone(object.rect),fill=backObjectImageMapping(object,metadata);
  assert.deepEqual(fill,{x:-3,y:-1.5,width:16,height:4,artworkWidth:4,artworkHeight:2});
  object.crop.mode='fit';object.crop.zoom=1;const fit=backObjectImageMapping(object,metadata);assert.equal(fit.width,4);assert.equal(fit.height,1);assert.equal(fit.y,.75);
  object.style.paddingX=18;object.style.paddingY=9;const padded=backContentRect(object.rect,object.style);assert.equal(padded.width,3.5);assert.equal(padded.height,1.75);
  const calls=[],bitmap={width:100,height:25};drawBackObject(drawingContext(calls),object,{bitmap,metadata});
  assert.ok(calls.filter(call=>call[0]==='clip').length>=2);assert.ok(calls.some(call=>call[0]==='drawImage'&&call[1]===bitmap));assert.deepEqual(object.rect,original);
});

test('preflight requires custom image assets only in generated mode and reports their actual placed DPI',()=>{
  const originalGet=assets.get;globalThis.window={pica:()=>({})};
  try {
    const object=image(),configured={...state,backCover:{mode:'dynamic',objects:[object]}},key=backImageKey(object.id);
    assets.get=()=>undefined;assert.ok(requiredPhotoKeys(configured).includes(key));assert.ok(preflight(configured).missing.includes(key));
    assert.ok(!requiredPhotoKeys({...configured,backCover:{...configured.backCover,mode:'image'}}).includes(key));
    assets.get=slot=>slot===key?{bitmap:{},metadata:{sourceWidth:800,sourceHeight:200,crop:{}}}:undefined;
    assert.ok(preflight(configured).low.some(value=>value.includes(object.name)&&value.includes('50 DPI')));
  } finally {assets.get=originalGet;delete globalThis.window;}
});

test('custom asset references restore across sessions without contents, reject path keys and verify originals at export',async()=>{
  const storage=new Map(),closed=[];globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  globalThis.window={pica:()=>({resize:async()=>{}})};globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>drawingContext()})};globalThis.createImageBitmap=async(source,options)=>({width:options?.resizeWidth??source.width,height:options?.resizeHeight??source.height,close(){closed.push(true);}});
  const header=new Uint8Array(24);header.set([137,80,78,71,13,10,26,10]);const view=new DataView(header.buffer);view.setUint32(16,800);view.setUint32(20,200);const blob=new Blob([header]),key=backImageKey('saved-image'),modifiedAt='2026-04-01T00:00:00.000Z';
  const metadata={grantId:'photos',grantName:'Photos',relativePath:'cover.png',sourceWidth:800,sourceHeight:200,sourceModifiedAt:modifiedAt,sourceBytes:blob.size};
  storage.set('calendar-layout-photo-assets-v1',JSON.stringify({[key]:metadata,'back-object-../../escape':metadata}));
  const store=createAssetStore(),files={stat:async()=>({kind:'file',name:'cover.png',relativePath:'cover.png',size:blob.size,modifiedAt}),readFile:async()=>blob};
  try {
    assert.ok(store.get(key));assert.equal(store.get('back-object-../../escape'),undefined);await store.restore(files);assert.ok(store.get(key).bitmap,store.get(key).error);
    const bitmap=await store.exportBitmap(key,files,state,300,300,{width:4,height:1,artworkWidth:4,artworkHeight:2});bitmap.close();
    const assignedKey=backImageKey('new-image');
    await store.assign(assignedKey,{grantId:'photos',name:'Photos'},{relativePath:'cover.png'},files,{...state,width:4,height:2,bleed:0});
    assert.ok(store.get(assignedKey).bitmap);assert.equal(store.get(assignedKey).metadata.relativePath,'cover.png');
    const restarted=createAssetStore();assert.ok(restarted.get(assignedKey));assert.equal(restarted.get(assignedKey).bitmap,null);await restarted.restore(files);assert.ok(restarted.get(assignedKey).bitmap);restarted.dispose();
    await assert.rejects(store.assign('back-object-../invalid',{grantId:'photos',name:'Photos'},{relativePath:'cover.png'},files,state),/Unknown artwork slot/);
    await assert.rejects(store.exportBitmap(key,{...files,stat:async()=>({kind:'file',name:'cover.png',relativePath:'cover.png',size:blob.size,modifiedAt:'changed'})},state,300,300),/changed on disk/);
    for(const value of storage.values())assert.ok(value.length<2000);
    store.remove(key);assert.ok(!store.get(key));assert.ok(closed.length>0);
  } finally {store.dispose();delete globalThis.localStorage;delete globalThis.window;delete globalThis.document;delete globalThis.createImageBitmap;}
});

test('shared preview and bounded-original generated export include custom layers in the same stacking order',async()=>{
  const calls=[],canvases=[],originalGet=assets.get,originalExport=assets.exportBitmap,exports=[];
  globalThis.document={createElement(){const canvas={width:0,height:0,getContext(){return drawingContext(calls);}};canvases.push(canvas);return canvas;}};
  globalThis.window={pica:()=>({resize:async()=>{}})};
  const object=image(),rich=text(),bitmap={width:800,height:200,close(){}},metadata={sourceWidth:800,sourceHeight:200,crop:{x:.5,y:.5,zoom:1}};
  try {
    assets.get=()=>({bitmap,metadata});assets.exportBitmap=async(key,files,documentState,width,height,placement)=>{exports.push({key,width,height,placement});return bitmap;};
    const configured={...state,backCover:{mode:'dynamic',objects:[object,rich],imageStyle:{radiusTL:18},detailsStyle:{background:'#f0e0d0',transparent:false}},artworkMetadata:{'month-0':{title:'Monthly title'}}};
    drawBackCover(drawingContext(calls),configured,600,600);assert.ok(calls.some(call=>call[0]==='fillText'&&call[1]==='Hello world'));
    calls.length=0;const result=await printGeneratedBackCover(configured,{});assert.equal(result.canvas.width,3675);



    const exported=exports.find(entry=>entry.key===backImageKey(object.id));assert.ok(exported);assert.deepEqual(exported.placement,backObjectImageMapping(object,metadata));
    const lastImage=calls.findLastIndex(call=>call[0]==='drawImage'),lastText=calls.findLastIndex(call=>call[0]==='fillText'&&call[1]==='Hello world');assert.ok(lastText>lastImage);
    assert.ok(canvases.slice(1).every(canvas=>canvas.width===1&&canvas.height===1));
  } finally {assets.get=originalGet;assets.exportBitmap=originalExport;delete globalThis.document;delete globalThis.window;}
});


test('uploaded source remains a pure original photo and retains generated custom settings when switching back',()=>{
  const originalGet=assets.get,calls=[],bitmap={width:800,height:400},metadata={sourceWidth:800,sourceHeight:400,crop:{}};
  try {
    const generated=normalizeBackCover({mode:'dynamic',objects:[text(),image()],detailsStyle:{borderWidth:2}}),uploaded=normalizeBackCover({...generated,mode:'image'});
    assets.get=key=>key==='back-cover'?{bitmap,metadata}:undefined;
    drawBackCover(drawingContext(calls),{...state,backCover:uploaded},600,600);
    assert.ok(calls.some(call=>call[0]==='drawImage'&&call[1]===bitmap));assert.ok(!calls.some(call=>call[0]==='fillText'&&call[1]==='Hello world'));
    assert.deepEqual(normalizeBackCover({...uploaded,mode:'dynamic'}).objects,generated.objects);assert.equal(uploaded.detailsStyle.borderWidth,2);
  } finally {assets.get=originalGet;}
});

test('native editor menu adds, styles, transforms and removes objects while retaining text range selection',()=>{
  class Element extends EventTarget {
    constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.dataset={};this.style={};this.attributes={};this.value='';this.className='';this.textContent='';this.classList={contains:name=>this.className.split(' ').includes(name),add:name=>{this.className+=` ${name}`;},remove:name=>{this.className=this.className.split(' ').filter(item=>item!==name).join(' ');}};}
    append(...nodes){for(const child of nodes){child.parentElement=this;this.children.push(child);}}
    replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);}
    setAttribute(key,value){this.attributes[key]=String(value);}
    getAttribute(key){return this.attributes[key];}
    get options(){return this.tagName==='SELECT'?this.children:[];}
    get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
    get isConnected(){return this.parentElement!==null;}
    contains(element){return this===element||this.children.some(child=>child.contains(element));}
    closest(selector){return selector===`#${this.id}`?this:this.parentElement?.closest(selector)??null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...((selector==='button'&&child.tagName==='BUTTON')||(selector==='textarea'&&child.tagName==='TEXTAREA')||(selector==='[data-custom-image-status]'&&Object.hasOwn(child.dataset,'customImageStatus'))?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    getBoundingClientRect(){return {left:0,top:0,width:600,height:600};}
    click(){this.dispatchEvent(new Event('click'));}
    focus(){globalThis.document.activeElement=this;}
    setPointerCapture(id){this.capture=id;}
    hasPointerCapture(id){return this.capture===id;}
    releasePointerCapture(){this.capture=null;}
    remove(){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  }
  const elements=Object.fromEntries(['back-object-controls','back-shared-styles','back-grid-controls'].map(id=>{const element=new Element();element.id=id;return [id,element];}));
  const canvas=new Element('canvas'),stage=new Element(),windowTarget=new EventTarget();stage.append(canvas);
  globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>elements[id],activeElement:null};globalThis.window=windowTarget;
  let current={...state,backCover:normalizeBackCover({mode:'dynamic'})},controls,busy=false,picked;
  try {
    controls=createBackCoverControls({getState:()=>current,onChange:backCover=>{current={...current,backCover};controls.render();},normalize:normalizeBackCover,planFor:backCoverPlan,canvas,stage,locked:()=>busy,chooseImage:key=>{picked=key;},refresh(){}});controls.render();
    const host=elements['back-object-controls'],button=label=>host.querySelectorAll('button').find(element=>element.textContent===label);
    button('Add text').click();assert.equal(current.backCover.objects.length,1);const textId=current.backCover.objects[0].id,textarea=host.querySelector('textarea');assert.equal(textarea.value,'Your text');
    textarea.selectionStart=0;textarea.selectionEnd=4;textarea.dispatchEvent(new Event('select'));
    host.querySelectorAll('button').find(element=>element.getAttribute('aria-label')==='Bold').click();assert.equal(current.backCover.objects[0].runs[0].text,'Your');assert.equal(current.backCover.objects[0].runs[0].font.style,'bold');assert.equal(current.backCover.objects[0].runs[1].font.style,'normal');
    const descendants=element=>[element,...element.children.flatMap(descendants)],width=descendants(host).find(element=>element.getAttribute('aria-label')==='Width · in');width.value='6';width.dispatchEvent(new Event('input'));assert.equal(current.backCover.objects[0].rect.width,6);assert.equal(current.backCover.objects[0].rect.height,2);
    const handle=descendants(stage).find(element=>element.dataset.handle==='se');const pointer=new Event('pointerdown',{cancelable:true});Object.assign(pointer,{button:0,pointerId:1,clientX:350,clientY:150});
    // Native browsers bubble the handle event to its selection outline.
    Object.defineProperty(pointer,'target',{value:handle});handle.parentElement.dispatchEvent(pointer);
    const move=new Event('pointermove');Object.assign(move,{pointerId:1,clientX:400,clientY:200,altKey:false});windowTarget.dispatchEvent(move);assert.ok(current.backCover.objects[0].rect.width>6);assert.ok(Math.abs(current.backCover.objects[0].rect.width/current.backCover.objects[0].rect.height-3)<1e-9);
    const release=new Event('pointerup');Object.assign(release,{pointerId:1});windowTarget.dispatchEvent(release);
    button('Add image').click();assert.equal(current.backCover.objects.length,2);button('Choose / replace image…').click();assert.equal(picked,backImageKey(current.backCover.objects[1].id));
    busy=true;controls.render();assert.equal(button('Remove container').disabled,true);assert.equal(host.querySelector('textarea'),null);busy=false;controls.render();button('Remove container').click();assert.deepEqual(current.backCover.objects.map(object=>object.id),[textId]);
    assert.equal(stage.children.length,2);
  } finally {controls?.dispose();delete globalThis.document;delete globalThis.window;}
});
