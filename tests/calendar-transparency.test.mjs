import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKGROUND_FIELDS,normalizeLayout,calendarLayout,fillerAppearance,printPages} from '../public/calendar/src/scripts/layout.js';
import {normalizeBackCover,drawBackCover} from '../public/calendar/src/scripts/back-cover.js';
import {drawFillerPage} from '../public/calendar/src/scripts/filler-pages.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,bleed:.125,week:0};
test('transparent options persist without losing chosen background colors',()=>{
  const settings=normalizeLayout({...Object.fromEntries(BACKGROUND_FIELDS.map(key=>[`${key}Transparent`,true])),cellBackground:'#123456'});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
  assert.equal(settings.cellBackground,'#123456');
  assert.equal(normalizeLayout({...settings,cellBackgroundTransparent:false}).cellBackground,'#123456');
  assert.equal(normalizeLayout().cellBackgroundTransparent,false);
  const back=normalizeBackCover({background:'#123456',backgroundTransparent:true,cellBackgroundTransparent:true});
  assert.deepEqual(normalizeBackCover(JSON.parse(JSON.stringify(back))),back);
});
test('transparent cell, holiday and header fills retain text and grid borders',()=>{
  const layout={...Object.fromEntries(BACKGROUND_FIELDS.map(key=>[`${key}Transparent`,true])),monthHeaderFill:true,yearHeaderFill:true,weekdayFill:true,monthHeaderBorderWidth:2,weekdayBorderWidth:1,dateShape:'circle',layoutBackgroundImage:true,fonts:{holiday:{color:'#123456'}}};
  for(const separated of [false,true]) {
    const plan=calendarLayout({...state,layout:{...layout,cellGap:separated?4:0},holidays:{enabled:true}},0);
    assert.equal(plan.rects.length,0);assert.equal(plan.shapes.length,0);
    assert.ok(plan.decorations.every(d=>!d.fill));
    assert.ok(plan.texts.some(t=>t.role==='date'));assert.ok(plan.decorations.some(d=>d.width>0));
    assert.equal(plan.texts.find(t=>t.role==='holiday').color,'#123456');
  }
});
test('each filler face can be transparent and the fallback applies to unconfigured faces',()=>{
  const inherited={...state,layout:{endSpreadColorTransparent:true}};
  assert.equal(fillerAppearance(inherited,'opening-top').transparent,true);
  const explicit={...state,layout:{endSpreadColorTransparent:true,openingTopColor:'#123456',closingBottomColorTransparent:true}};
  assert.equal(fillerAppearance(explicit,'opening-top').transparent,false);
  assert.equal(fillerAppearance(explicit,'closing-bottom').transparent,true);
  assert.equal(printPages(explicit).find(p=>p.fillerKey==='closing-bottom').transparent,true);
  const calls=[];drawFillerPage({fillRect:()=>calls.push('fill')},{...state,layout:{openingTopColorTransparent:true}},'opening-top',400,400);
  assert.deepEqual(calls,[]);
});
test('transparent generated back-cover background and cards omit fills while preserving captions',()=>{
  const calls=[];let fillStyle;
  const context=new Proxy({measureText:s=>({width:s.length*.05})},{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,fillStyle,...args]),set:(target,key,value)=>{if(key==='fillStyle')fillStyle=value;target[key]=value;return true;}});
  drawBackCover(context,{...state,backCover:{background:'#123456',backgroundTransparent:true,cellFill:true,cellBackground:'#654321',cellBackgroundTransparent:true}},600,600);
  assert.ok(!calls.some(([name,color])=>name==='fillRect'&&['#123456','#654321'].includes(color)));
  assert.ok(calls.some(([name])=>name==='fillText'));
});
