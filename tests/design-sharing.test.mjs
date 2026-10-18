import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDesign, designFontFamilies, shareDesign, readDesignFolder, DESIGN_FILE } from '../public/calendar/src/scripts/design-sharing.js';
const settings={year:2027,layout:{fonts:{title:{family:'times'}}}};
const manifest=(changes={})=>JSON.stringify({format:'calendar-builder-design',version:1,state:settings,images:{},fonts:[],...changes});

test('portable design manifest validates version, structure and paths',()=>{
  assert.equal(decodeDesign(manifest()).state.year,2027);
  for(const changes of [{version:2},{format:'other'},{state:[]},{images:[]},{fonts:{}},{images:{'month-0':{path:'images/../private.jpg'}}},{fonts:[{family:'x',style:'normal',custom:true,path:'../font.ttf'}]}]) assert.throws(()=>decodeDesign(manifest(changes)));
});

test('font discovery includes nested back-cover and layout roles',()=>{
  assert.deepEqual([...designFontFamilies({layout:{fonts:{date:{family:'lato'}}},backCover:{objects:[{font:{family:'courier'}}]}})],['lato','courier']);
});

test('ZIP includes deduplicated originals and encoded settings without local grant IDs',async()=>{
  let reads=0;
  const metadata={'month-0':{grantId:'private-grant',relativePath:'photos/test.jpg',crop:{x:0.25}},'front-cover':{grantId:'private-grant',relativePath:'photos/test.jpg',crop:{x:0.5}}};
  const blob=await shareDesign(settings,metadata,{readFile:async()=>{reads++;return new Blob(['original-image']);}});
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const text=new TextDecoder().decode(bytes);
  assert.equal(reads,1);assert.equal(blob.type,'application/zip');
  assert.ok(text.includes(DESIGN_FILE));assert.ok(text.includes('original-image'));assert.ok(text.includes('"x": 0.25'));assert.ok(!text.includes('private-grant'));
});

test('missing original rejects sharing instead of creating an incomplete bundle',async()=>{
  await assert.rejects(shareDesign(settings,{'month-0':{grantId:'g',relativePath:'a.jpg'}},{readFile:async()=>{throw new Error('Permission unavailable');}}),/Permission unavailable/);
});

test('folder import rebinds paths to recipient grant and retains crops',async()=>{
  const encoded=manifest({images:{'month-0':{path:'images/test.jpg',crop:{x:0.3,y:0.4,scale:1}}}});
  const result=await readDesignFolder({grantId:'new-local-id',name:'Received design'},{readFile:async(id,path)=>{assert.equal(id,'new-local-id');assert.equal(path,DESIGN_FILE);return new Blob([encoded]);}});
  assert.equal(result.metadata['month-0'].grantId,'new-local-id');
  assert.equal(result.metadata['month-0'].relativePath,'images/test.jpg');
  assert.equal(result.metadata['month-0'].crop.x,0.3);
  assert.deepEqual(result.state,settings);
});
