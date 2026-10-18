import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarLayout, normalizeLayout } from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:0.5,binding:0.5,week:0};
const dateTexts=plan=>plan.texts.filter(text=>text.role==='date');

test('older layouts retain blank cells and their existing background',()=>{
  const layout=normalizeLayout({cellBackground:'#abcdef'});
  assert.equal(layout.leadingBackground,'#abcdef');
  assert.equal(layout.trailingBackground,'#abcdef');
  const plan=calendarLayout({...state,layout},0);
  assert.equal(plan.rects.length,42);
  assert.equal(dateTexts(plan).length,31);
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
});

test('leading and trailing dates have independent backgrounds and text colors across year boundaries',()=>{
  const layout={leadingMode:'dates',trailingMode:'dates',leadingBackground:'#eeeeee',trailingBackground:'#dddddd',leadingColor:'#888888',trailingColor:'#777777'};
  const january=calendarLayout({...state,layout},0);
  assert.deepEqual(dateTexts(january).filter(t=>t.color==='#888888').map(t=>t.text),['27','28','29','30','31']);
  assert.deepEqual(dateTexts(january).filter(t=>t.color==='#777777').map(t=>t.text),['1','2','3','4','5','6']);
  assert.equal(january.rects[0].color,'#eeeeee');
  assert.equal(january.rects.at(-1).color,'#dddddd');
  const december=calendarLayout({...state,layout},11);
  assert.equal(dateTexts(december).filter(t=>t.color==='#777777')[0].text,'1');
});

test('hidden cells remove fills and unused grid edges while retaining current-month boundaries',()=>{
  const plan=calendarLayout({...state,layout:{leadingMode:'hidden',trailingMode:'hidden'}},0);
  assert.equal(plan.rects.length,31);
  const {left,gridTop,cellWidth,rowHeight}=plan.geometry;
  assert.ok(!plan.lines.some(l=>l.x1===left&&l.y1===gridTop));
  assert.ok(plan.lines.some(l=>l.x1===left+5*cellWidth&&l.y1===gridTop&&l.y2===gridTop+rowHeight));
  assert.equal(dateTexts(plan).length,31);
});

test('Monday-first leap February and independently hidden sides',()=>{
  const plan=calendarLayout({...state,year:2028,week:1,layout:{leadingMode:'dates',trailingMode:'hidden'}},1);
  assert.deepEqual(dateTexts(plan).slice(0,1).map(t=>t.text),['31']);
  assert.equal(dateTexts(plan).length,30);
  assert.equal(plan.rects.length,30);
  const invalid=normalizeLayout({leadingMode:'invalid',trailingColor:'red'});
  assert.equal(invalid.leadingMode,'blank');
  assert.equal(invalid.trailingColor,'#999999');
});
