import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,normalizeArtworkMetadata,normalizeLayout,printPages,calendarPagePlan,validateSaddleImposition,fillerAppearance,FILLER_KEYS} from '../public/calendar/src/scripts/layout.js';
import {backCoverPlan,normalizeBackCover,drawBackCover} from '../public/calendar/src/scripts/back-cover.js';
import {requiredPhotoKeys} from '../public/calendar/src/scripts/pdf.js';
import {assets} from '../public/calendar/src/scripts/media.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,bleed:.125,week:0};
const artworkMetadata=normalizeArtworkMetadata({'month-0':{artist:'Artist Example',title:'Artwork Example',description:'Description example.'},'front-cover':{artist:'Cover Artist',title:'Cover artwork',description:'Cover description.'}});
test('monthly metadata appears only when enabled and stays outside date cells',()=>{
  const base={...state,artworkMetadata};
  assert.ok(!calendarLayout(base,0).texts.some(t=>t.role==='artist'));
  for(const placement of ['header','month','year','footer']) {
    const plan=calendarLayout({...base,layout:{artworkPlacement:placement,artworkDetailsHeight:1}},0);
    for(const role of ['artist','artworkTitle','description']) {
      const text=plan.texts.find(t=>t.role===role);assert.ok(text);
      assert.equal(text.size,plan.settings.fonts[role].size/72);
      if(placement==='footer')assert.ok(text.y>plan.geometry.gridTop+plan.geometry.rows*plan.geometry.rowHeight);
      else assert.ok(text.y<plan.geometry.gridTop);
    }
  }
  const hidden=calendarLayout({...base,layout:{artworkPlacement:'footer',artworkShowDescription:false}},0);
  assert.ok(!hidden.texts.some(t=>t.role==='description'));
});
test('front-cover credits create an optional text-only card without changing monthly metadata',()=>{
  const base=backCoverPlan({...state,artworkMetadata});assert.equal(base.cards.length,12);
  const plan=backCoverPlan({...state,artworkMetadata,backCover:{frontCoverCredits:true,frontCoverImage:false}});
  assert.equal(plan.cards.length,13);const cover=plan.cards[0];
  assert.equal(cover.key,'front-cover');assert.equal(cover.metadata.artist,'Cover Artist');assert.equal(cover.imageVisible,false);
  assert.ok(cover.text.height>cover.photo.height);
  assert.deepEqual(plan.cards.slice(1).map(card=>card.key),Array.from({length:12},(_,i)=>`month-${i}`));
});
test('four filler faces have independent colors and images without changing physical ordering',()=>{
  const layout={openingTopColor:'#112233',openingBottomColor:'#445566',closingTopColor:'#778899',closingBottomColor:'#aabbcc',openingBottomImage:true,closingTopImage:true};
  const pages=printPages({...state,layout});const fillers=pages.filter(p=>p.fillerKey);
  assert.deepEqual(fillers.map(p=>p.fillerKey),FILLER_KEYS);
  assert.deepEqual(fillers.map(p=>p.color),['#112233','#445566','#778899','#aabbcc']);
  assert.deepEqual(fillers.map(p=>p.kind),['solid','photo','photo','solid']);
  const configured={...state,layout,bindingStyle:'saddle'};
  assert.equal(validateSaddleImposition(configured.year,configured),true);
  assert.equal(calendarPagePlan(configured).logicalPages,calendarPagePlan({...state,bindingStyle:'saddle'}).logicalPages);
  assert.equal(fillerAppearance({...state,endSpreadColor:'#123456'},'opening-top').color,'#123456');
});
test('optional image slots are required only when printed and enabled',()=>{
  const base=requiredPhotoKeys(state);assert.ok(!base.includes('back-cover-background'));
  for(const key of FILLER_KEYS)assert.ok(!base.includes(key));
  const configured={...state,layout:{openingTopImage:true,closingBottomImage:true},backCover:{mode:'dynamic',backgroundImage:true}};
  const required=requiredPhotoKeys(configured);
  assert.ok(required.includes('opening-top'));assert.ok(required.includes('closing-bottom'));assert.ok(required.includes('back-cover-background'));
  const omitted=requiredPhotoKeys({...configured,includeOpeningSpread:false,includeClosingSpread:false});
  assert.ok(!omitted.includes('opening-top'));assert.ok(!omitted.includes('closing-bottom'));
  assert.ok(!requiredPhotoKeys({...configured,backCover:{mode:'image',backgroundImage:true}}).includes('back-cover-background'));
});
test('new artwork and filler settings survive serialization and old defaults stay disabled',()=>{
  const layout=normalizeLayout({artworkPlacement:'footer',artworkDetailsHeight:1,openingTopColor:'#112233',openingBottomImage:true});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
  const back=normalizeBackCover({frontCoverCredits:true,frontCoverImage:false,backgroundImage:true});
  assert.deepEqual(normalizeBackCover(JSON.parse(JSON.stringify(back))),back);
  assert.equal(normalizeLayout().artworkPlacement,'none');assert.equal(normalizeBackCover().frontCoverCredits,false);
  assert.equal(normalizeArtworkMetadata(artworkMetadata)['front-cover'].title,'Cover artwork');
});
test('back-cover background paints before the dynamic cards and text-only front credit omits its image',()=>{
  const originalGet=assets.get,calls=[];
  const context=new Proxy({measureText:s=>({width:s.length*.05})},{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args]),set:(target,key,value)=>{target[key]=value;return true;}});
  const bitmap={width:100,height:100};
  try {
    assets.get=key=>key==='back-cover-background'?{bitmap,metadata:{sourceWidth:100,sourceHeight:100,crop:{zoom:1,x:.5,y:.5}}}:undefined;
    drawBackCover(context,{...state,artworkMetadata,backCover:{backgroundImage:true,frontCoverCredits:true,frontCoverImage:false}},600,600);
    const bg=calls.findIndex(([name,...args])=>name==='drawImage'&&args[0]===bitmap);
    const coverText=calls.findIndex(([name,text])=>name==='fillText'&&text==='Cover Artist');
    assert.ok(bg>=0&&coverText>bg);
  } finally {assets.get=originalGet;}
});
