import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapHolidayText} from '../public/calendar/src/scripts/holidays.js';
import {calendarLayout,normalizeLayout} from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0,holidays:{enabled:true}};
const heading=plan=>plan.texts.filter(t=>t.role==='title'||t.role==='year');
test('holiday wrapping preserves words and parenthetical observed suffixes',()=>{
  assert.deepEqual(wrapHolidayText('Christmas Day (observed)',s=>s.length,18),['Christmas Day','(observed)']);
  assert.deepEqual(wrapHolidayText(' New   Year’s Day ',s=>s.length,10),['New Year’s','Day']);
  assert.deepEqual(wrapHolidayText('Supercalifragilistic',s=>s.length,5),['Supercalifragilistic']);
  assert.deepEqual(wrapHolidayText('',s=>s.length,5),[]);
});
test('line limits ellipsize whole words without breaking the final word',()=>{
  assert.deepEqual(wrapHolidayText('Christmas Day (observed)',s=>s.length,18,1),['Christmas Day…']);
  assert.deepEqual(wrapHolidayText('alpha beta gamma delta',s=>s.length,10,1),['alpha…']);
});
test('bottom holiday alignment anchors text independently and keeps date numbers clear',()=>{
  for(const dateVertical of ['top','middle','bottom']) for(const dateShape of ['none','circle']) {
    const plan=calendarLayout({...state,layout:{holidayVertical:'bottom',dateVertical,dateShape}},0);
    const firstHoliday=plan.texts.find(t=>t.role==='holiday');
    const date=plan.texts.filter(t=>t.role==='date').find(t=>t.text==='1');
    assert.ok(firstHoliday.y>date.y);
    const reference=calendarLayout({...state,layout:{holidayVertical:'bottom',dateVertical:'top',dateShape}},0);
    assert.equal(firstHoliday.y,reference.texts.find(t=>t.role==='holiday').y);
  }
  const top=calendarLayout({...state,layout:{holidayVertical:'top'}},0);
  assert.ok(top.texts.find(t=>t.role==='holiday').y<top.texts.find(t=>t.role==='date'&&t.text==='1').y);
});
test('grouped headers follow left/center/right alignment and preserve font point sizes',()=>{
  const plans=['left','center','right'].map(align=>calendarLayout({...state,layout:{headerLayout:'grouped',headerGroupAlign:align,headerGroupGap:18}},0));
  const positions=plans.map(plan=>heading(plan)[0].x);
  assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]);
  assert.ok(Math.abs((positions[0]+positions[2])/2-positions[1])<1e-9);
  for(const plan of plans) for(const item of heading(plan)) assert.equal(item.size,plan.settings.fonts[item.role].size/72);
  const wide=heading(calendarLayout({...state,layout:{headerLayout:'grouped',headerGroupGap:36}},0));
  const tight=heading(calendarLayout({...state,layout:{headerLayout:'grouped',headerGroupGap:0}},0));
  assert.ok(Math.abs(wide[1].x-tight[1].x-.5)<1e-9);
});
test('grouped month and year container styles follow content width',()=>{
  const layout={headerLayout:'grouped',monthHeaderFill:true,monthHeaderBackground:'#123456',yearHeaderFill:true,yearHeaderBackground:'#654321'};
  const january=calendarLayout({...state,layout},0),september=calendarLayout({...state,layout},8);
  const extent=plan=>Math.max(...plan.decorations.find(d=>d.fill==='#123456').points.map(p=>p[0]));
  assert.ok(extent(september)>extent(january));
  const overflowing=calendarLayout({...state,width:4,layout:{headerLayout:'grouped',headerGroupGap:144}},8);
  assert.ok(overflowing.notices.some(n=>n.includes('Month and year group exceeds')));
});
test('new settings survive persistence; older layouts preserve their arrangement',()=>{
  const settings=normalizeLayout({holidayVertical:'bottom',headerLayout:'grouped',headerGroupAlign:'right',headerGroupGap:24});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
  assert.equal(normalizeLayout().headerLayout,'split');
  assert.equal(normalizeLayout().holidayVertical,'flow');
  assert.equal(normalizeLayout({holidayVertical:'bad',headerGroupAlign:'bad',headerGroupGap:-1}).headerGroupGap,0);
});
