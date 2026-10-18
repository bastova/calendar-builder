import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,normalizeLayout} from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0};
test('month and year legacy corner radii migrate independently and persist',()=>{
  const layout=normalizeLayout({monthHeaderRadius:10,yearHeaderRadius:20});
  for(const corner of ['TL','TR','BL','BR']) {
    assert.equal(layout[`monthHeaderRadius${corner}`],10);
    assert.equal(layout[`yearHeaderRadius${corner}`],20);
  }
  assert.equal(layout.headerSeparatorMode,'inherit');
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
});
test('outer-end rounding keeps facing corners square for separated and grouped headers',()=>{
  for(const headerLayout of ['split','grouped']) {
    const layout={headerLayout,monthHeaderFill:true,monthHeaderBackground:'#123456',yearHeaderFill:true,yearHeaderBackground:'#654321',monthHeaderRadiusMode:'outer',yearHeaderRadiusMode:'outer',monthHeaderRadiusTL:12,monthHeaderRadiusTR:18,yearHeaderRadiusTL:18,yearHeaderRadiusTR:12};
    const plan=calendarLayout({...state,layout},0);
    for(const color of ['#123456','#654321']) {
      const points=plan.decorations.find(d=>d.fill===color).points;
      assert.equal(points.length,12);
      const facingX=color==='#123456'?Math.max(...points.map(p=>p[0])):Math.min(...points.map(p=>p[0]));
      assert.ok(points.some(([x,y])=>x===facingX&&y===plan.geometry.top));
    }
  }
});
test('facing borders can be hidden or use independent color and width',()=>{
  const base={monthHeaderBorderWidth:2,yearHeaderBorderWidth:3};
  const inherit=calendarLayout({...state,layout:base},0);
  const none=calendarLayout({...state,layout:{...base,headerSeparatorMode:'none'}},0);
  assert.equal(inherit.decorations.length,8);
  assert.equal(none.decorations.length,6);
  const custom=calendarLayout({...state,layout:{...base,headerSeparatorMode:'custom',headerSeparatorColor:'#abcdef',headerSeparatorWidth:4}},0);
  const internal=custom.decorations.filter(d=>d.stroke==='#abcdef');
  assert.equal(internal.length,2);
  assert.ok(internal.every(d=>d.width===4/72&&d.closed===false));
  assert.equal(normalizeLayout({monthHeaderRadiusTL:-10,yearHeaderRadiusBR:100}).yearHeaderRadiusBR,72);
});

test('grouped padding enlarges each container without changing typography',()=>{
  const base={headerLayout:'grouped',monthHeaderFill:true,monthHeaderBackground:'#123456',yearHeaderFill:true,yearHeaderBackground:'#654321'};
  const plain=calendarLayout({...state,layout:base},0);
  const padded=calendarLayout({...state,layout:{...base,monthHeaderPaddingX:18,monthHeaderPaddingY:36,yearHeaderPaddingX:9,yearHeaderPaddingY:6}},0);
  const width=(plan,color)=>{const points=plan.decorations.find(d=>d.fill===color).points;return Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));};
  assert.ok(Math.abs(width(padded,'#123456')-width(plain,'#123456')-.5)<1e-9);
  assert.ok(Math.abs(width(padded,'#654321')-width(plain,'#654321')-.25)<1e-9);
  assert.ok(padded.geometry.heading>plain.geometry.heading);
  for(const role of ['title','year'])assert.equal(padded.texts.find(t=>t.role===role).size,plain.texts.find(t=>t.role===role).size);
  assert.ok(Math.abs(padded.texts.find(t=>t.role==='title').x-plain.texts.find(t=>t.role==='title').x-.25)<1e-9);
});

test('separate containers inset text and padding settings persist with safe bounds',()=>{
  const plain=calendarLayout(state,0);
  const padded=calendarLayout({...state,layout:{monthHeaderPaddingX:18,yearHeaderPaddingX:9}},0);
  assert.ok(Math.abs(padded.texts.find(t=>t.role==='title').x-plain.texts.find(t=>t.role==='title').x-.25)<1e-9);
  assert.ok(Math.abs(padded.texts.find(t=>t.role==='year').x-plain.texts.find(t=>t.role==='year').x+.125)<1e-9);
  const settings=normalizeLayout({monthHeaderPaddingX:18,monthHeaderPaddingY:24,yearHeaderPaddingX:9,yearHeaderPaddingY:6});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
  assert.equal(normalizeLayout({monthHeaderPaddingX:-1,yearHeaderPaddingY:999}).yearHeaderPaddingY,144);
  assert.equal(normalizeLayout().monthHeaderPaddingX,0);
});
