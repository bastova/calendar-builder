import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,miniCalendarPlacement,monthDates,normalizeLayout} from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0};
test('miniatures are opt-in and normalized settings survive persistence',()=>{
  assert.deepEqual(miniCalendarPlacement(state,0),{rows:6,cells:[]});
  const layout=normalizeLayout({miniCalendars:true,miniCalendarPlacement:'beginning',miniCalendarExtraRow:true,miniCalendarSize:8});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
  assert.equal(normalizeLayout({miniCalendarPlacement:'bad',miniCalendarSize:100}).miniCalendarSize,18);
});
test('every placement keeps both miniatures clear of real dates for both week starts',()=>{
  for(const year of [2027,2028]) for(const week of [0,1]) for(let month=0;month<12;month++) for(const placement of ['beginning','end']) for(const extra of [false,true]) {
    const settings={...state,year,week,layout:{miniCalendars:true,miniCalendarPlacement:placement,miniCalendarExtraRow:extra}};
    const {rows,cells}=miniCalendarPlacement(settings,month),dates=monthDates(year,month,week);
    assert.equal(cells.length,2);
    assert.equal(cells[1],cells[0]+1);
    for(const cell of cells) assert.ok(cell<dates.first||cell>=dates.first+dates.count);
    if(placement==='beginning'&&dates.first>=2) assert.deepEqual(cells,[0,1]);
    else assert.deepEqual(cells,[rows*7-2,rows*7-1]);
    if(extra) assert.ok(rows>Math.ceil((dates.first+dates.count)/7));
  }
});
test('titles cross years, leap February has 29 dates, and preview cells have no fills or internal lines',()=>{
  const settings={...state,year:2028,layout:{miniCalendars:true,miniCalendarPlacement:'beginning',leadingMode:'dates',trailingMode:'dates'}};
  assert.ok(calendarLayout(settings,0).texts.some(t=>t.text==='December 2027'));
  assert.ok(calendarLayout(settings,11).texts.some(t=>t.text==='January 2029'));
  const plan=calendarLayout(settings,2),{cells}=miniCalendarPlacement(settings,2);
  // March's previous month is leap February; its date list ends in 29.
  const title=plan.texts.findIndex(t=>t.text==='February 2028');
  assert.equal(plan.texts[title+7+29].text,'29');
  const g=plan.geometry;
  for(const cell of cells) {
    const x=g.left+(cell%7)*g.cellWidth,y=g.gridTop+Math.floor(cell/7)*g.rowHeight;
    assert.ok(!plan.rects.some(r=>r.x===x&&r.y===y));
    assert.ok(!plan.lines.some(l=>l.x1>x&&l.x1<x+g.cellWidth&&l.y1>y&&l.y1<y+g.rowHeight));
  }
});

test('miniature typography migrates old size and supports independent fonts, colors and alignment',()=>{
  const legacy=normalizeLayout({miniCalendarSize:8,fonts:{date:{family:'courier',color:'#123456',style:'italic'}}});
  for(const role of ['miniMonth','miniWeekday','miniDate']) {
    assert.equal(legacy.fonts[role].size,8);
    assert.equal(legacy.fonts[role].family,'courier');
    assert.equal(legacy.fonts[role].color,'#123456');
  }
  const fonts={miniMonth:{family:'times',color:'#112233',size:7,align:'left',style:'bold'},miniWeekday:{family:'courier',color:'#445566',size:5,align:'right',style:'italic'},miniDate:{family:'helvetica',color:'#778899',size:6,align:'center',style:'normal'}};
  const layout=normalizeLayout({miniCalendars:true,fonts,miniMonthVertical:'top',miniWeekdayVertical:'bottom'});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))),layout);
  const plan=calendarLayout({...state,layout},0);
  for(const [role,font] of Object.entries(fonts)) {
    const items=plan.texts.filter(t=>t.role===role);
    assert.ok(items.length>0);
    for(const item of items) {
      assert.equal(item.color,font.color);
      assert.equal(item.size,font.size/72);
      assert.equal(item.font.align,font.align);
      assert.equal(item.font.family,font.family);
      assert.equal(item.font.style,font.style);
    }
  }
  const aligned=calendarLayout({...state,layout:{...layout,fonts:{...layout.fonts,miniMonth:{...layout.fonts.miniMonth,align:'right'}},miniMonthVertical:'bottom'}},0);
  const before=plan.texts.find(t=>t.role==='miniMonth'),after=aligned.texts.find(t=>t.role==='miniMonth');
  assert.ok(after.x>before.x);
  assert.ok(after.y>before.y);
});
