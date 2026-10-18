import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,normalizeLayout,normalizeArtworkMetadata} from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0,artworkMetadata:normalizeArtworkMetadata({'month-0':{artist:'Artist',title:'Title',description:'Description'}})};
const details=plan=>plan.texts.filter(t=>['artist','artworkTitle','description'].includes(t.role));
test('monthly details align as a stack horizontally and vertically without changing font sizes',()=>{
  const base={artworkPlacement:'footer',artworkDetailsHeight:1.5};
  const plans=['left','center','right'].map(artworkTextAlign=>calendarLayout({...state,layout:{...base,artworkTextAlign}},0));
  const x=plans.map(p=>details(p)[0].x);assert.ok(x[0]<x[1]&&x[1]<x[2]);
  const vertical=['top','middle','bottom'].map(artworkVertical=>calendarLayout({...state,layout:{...base,artworkVertical}},0));
  const y=vertical.map(p=>details(p)[0].y);assert.ok(y[0]<y[1]&&y[1]<y[2]);
  assert.ok(Math.abs(y[1]-(y[0]+y[2])/2)<1e-9);
  for(const plan of [...plans,...vertical])for(const item of details(plan))assert.equal(item.size,plan.settings.fonts[item.role].size/72);
});
test('padding, borders, four radii and background transparency apply to the details container',()=>{
  const layout={artworkPlacement:'header',artworkDetailsHeight:1.5,artworkPaddingX:12,artworkPaddingY:6,artworkBackground:'#123456',artworkBackgroundTransparent:false,artworkBorderColor:'#abcdef',artworkBorderWidth:2,artworkRadiusTL:12,artworkRadiusBR:8};
  const plan=calendarLayout({...state,layout},0),box=plan.decorations.find(d=>d.fill==='#123456');
  assert.ok(box);assert.equal(box.stroke,'#abcdef');assert.equal(box.width,2/72);assert.ok(box.points.length>4);
  assert.ok(details(plan)[0].x>=Math.min(...box.points.map(p=>p[0]))+12/72);
  const transparent=calendarLayout({...state,layout:{...layout,artworkBackgroundTransparent:true}},0);
  assert.ok(!transparent.decorations.some(d=>d.fill==='#123456'));
  assert.ok(transparent.decorations.some(d=>d.stroke==='#abcdef'&&d.width===2/72));
});
test('old layouts inherit per-field alignment and transparent backgrounds; settings persist',()=>{
  const legacy=normalizeLayout();assert.equal(legacy.artworkTextAlign,'inherit');assert.equal(legacy.artworkVertical,'top');assert.equal(legacy.artworkBackgroundTransparent,true);
  const layout=normalizeLayout({artworkTextAlign:'right',artworkVertical:'bottom',artworkPaddingX:12,artworkBackgroundTransparent:false,artworkRadiusTR:9});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
  const plan=calendarLayout({...state,layout:{artworkPlacement:'footer',fonts:{artist:{align:'right'}}}},0);
  assert.equal(plan.texts.find(t=>t.role==='artist').font.align,'right');
  const crowded=calendarLayout({...state,layout:{artworkPlacement:'footer',artworkPaddingY:72}},0);
  assert.ok(crowded.notices.some(n=>n.includes('Artwork details exceed')));
});

const containerBounds=plan=>{
  const box=plan.decorations.find(item=>item.fill==='#123456');
  const xs=box.points.map(point=>point[0]),ys=box.points.map(point=>point[1]);
  return {x:Math.min(...xs),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
};
test('monthly artwork container supports custom width and alignment in every placement',()=>{
  for(const artworkPlacement of ['header','month','year','footer']) {
    const layout={artworkPlacement,artworkDetailsHeight:1.5,artworkDetailsWidth:2,artworkBackground:'#123456',artworkBackgroundTransparent:false};
    const boxes=['left','center','right'].map(artworkContainerAlign=>containerBounds(calendarLayout({...state,layout:{...layout,artworkContainerAlign}},0)));
    for(const box of boxes)assert.ok(Math.abs(box.width-2)<1e-9);
    assert.ok(boxes[0].x<boxes[1].x&&boxes[1].x<boxes[2].x);
    assert.ok(Math.abs(boxes[1].x-(boxes[0].x+boxes[2].x)/2)<1e-9);
    const taller=containerBounds(calendarLayout({...state,layout:{...layout,artworkDetailsHeight:2}},0));
    assert.ok(taller.height>boxes[0].height);
  }
});
test('artwork width defaults to automatic, clamps to placement, and survives saving',()=>{
  assert.equal(normalizeLayout().artworkDetailsWidth,0);
  assert.equal(normalizeLayout().artworkContainerAlign,'left');
  const layout=normalizeLayout({artworkDetailsWidth:4,artworkDetailsHeight:2,artworkContainerAlign:'right'});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
  assert.equal(normalizeLayout({artworkDetailsWidth:-1}).artworkDetailsWidth,0);
  const base={artworkPlacement:'year',artworkBackground:'#123456',artworkBackgroundTransparent:false};
  const automatic=containerBounds(calendarLayout({...state,layout:base},0));
  const oversized=calendarLayout({...state,layout:{...base,artworkDetailsWidth:48}},0);
  assert.deepEqual(containerBounds(oversized),automatic);
  assert.ok(oversized.notices.some(notice=>notice.includes('container width was limited')));
});
