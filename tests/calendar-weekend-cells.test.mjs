import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_FIELDS, normalizeLayout, calendarLayout, monthDates, miniCalendarPlacement } from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0};
const styles={weekendStyle:true,weekendBackground:'#123456',weekendColor:'#abcdef',leadingWeekendStyle:true,leadingWeekendBackground:'#234567',leadingWeekendColor:'#bcdef0',trailingWeekendStyle:true,trailingWeekendBackground:'#345678',trailingWeekendColor:'#cdef01'};
const dates=plan=>plan.texts.filter(t=>t.role==='date');
const day=(plan,value)=>dates(plan).find(t=>t.text===String(value));

test('legacy defaults preserve fills, date colors and weekday weekend colors',()=>{
  const settings=normalizeLayout({fonts:{date:{color:'#456789'}}});
  assert.equal(settings.weekendStyle,false);assert.equal(settings.leadingWeekendStyle,false);assert.equal(settings.trailingWeekendStyle,false);
  assert.equal(settings.weekendBackground,'#eeeeee');assert.equal(settings.weekendColor,'#456789');
  const plan=calendarLayout({...state,layout:{weekendColors:true}},0);
  assert.equal(day(plan,2).color,plan.settings.saturdayColor);
  assert.equal(plan.rects.length,42);assert.ok(plan.rects.every(r=>r.color==='#ffffff'));
});

test('normalization requires explicit booleans, validates colors, inherits independent defaults and roundtrips',()=>{
  const settings=normalizeLayout({weekendStyle:'true',leadingWeekendStyle:1,trailingWeekendStyle:true,weekendBackground:'red',weekendColor:null,leadingBackground:'#102030',leadingColor:'#203040',trailingBackground:'#304050',trailingColor:'#405060',leadingWeekendBackground:'invalid',trailingWeekendColor:42,fonts:{date:{color:'#506070'}}});
  assert.equal(settings.weekendStyle,false);assert.equal(settings.leadingWeekendStyle,false);assert.equal(settings.trailingWeekendStyle,true);
  assert.equal(settings.weekendBackground,'#eeeeee');assert.equal(settings.weekendColor,'#506070');
  assert.equal(settings.leadingWeekendBackground,'#102030');assert.equal(settings.leadingWeekendColor,'#203040');
  assert.equal(settings.trailingWeekendBackground,'#304050');assert.equal(settings.trailingWeekendColor,'#405060');
  for(const prefix of ['weekend','leadingWeekend','trailingWeekend']) {
    assert.ok(BACKGROUND_FIELDS.includes(`${prefix}Background`));
    assert.equal(normalizeLayout({[`${prefix}BackgroundTransparent`]:'true'})[`${prefix}BackgroundTransparent`],false);
  }
  const valid=normalizeLayout({...styles,weekendBackgroundTransparent:true});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(valid))),valid);
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
});

for(const week of [0,1]) test(`weekend cells follow actual weekdays with week start ${week}, including adjacent years`,()=>{
  for(const month of [0,11]) {
    const plan=calendarLayout({...state,week,layout:{...styles,leadingMode:'dates',trailingMode:'dates',weekendColors:true}},month);
    const info=monthDates(state.year,month,week);
    for(let cell=0;cell<plan.geometry.rows*7;cell++) {
      const side=cell<info.first?'leading':cell>=info.first+info.count?'trailing':null;
      const weekend=[0,6].includes((cell%7+week)%7);
      const prefix=side?`${side}Weekend`:'weekend';
      assert.equal(plan.rects[cell].color,weekend?styles[`${prefix}Background`]:'#ffffff');
      const value=new Date(state.year,month,cell-info.first+1).getDate();
      const text=side?dates(plan).filter(t=>t.color===(weekend?styles[`${prefix}Color`]:'#999999')).find(t=>t.text===String(value)):dates(plan).find(t=>t.text===String(value)&&t.color===(weekend?styles.weekendColor:'#111111'));
      assert.ok(text);assert.equal(text.color,weekend?styles[`${prefix}Color`]:side?'#999999':'#111111');
    }
    assert.equal(plan.texts.find(t=>t.text==='SUN').color,plan.settings.sundayColor);
    assert.equal(plan.texts.find(t=>t.text==='SAT').color,plan.settings.saturdayColor);
  }
});

test('toggles are independent and adjacent blank cells receive fill without numbers',()=>{
  for(const prefix of ['weekend','leadingWeekend','trailingWeekend']) {
    const plan=calendarLayout({...state,layout:{...styles,weekendStyle:false,leadingWeekendStyle:false,trailingWeekendStyle:false,[`${prefix}Style`]:true}},0);
    for(const other of ['weekend','leadingWeekend','trailingWeekend']) assert.equal(plan.rects.some(r=>r.color===styles[`${other}Background`]),other===prefix);
    assert.equal(dates(plan).length,31);
  }
});

test('transparent weekend backgrounds omit only their own layer and retain text and borders',()=>{
  for(const prefix of ['weekend','leadingWeekend','trailingWeekend']) {
    const plan=calendarLayout({...state,layout:{...styles,[`${prefix}BackgroundTransparent`]:true,leadingMode:'dates',trailingMode:'dates'}},0);
    assert.ok(!plan.rects.some(r=>r.color===styles[`${prefix}Background`]));
    assert.ok(dates(plan).some(t=>t.color===styles[`${prefix}Color`]));assert.ok(plan.lines.length);
  }
});

const holidays={enabled:true,color:'#eeeeee',custom:[{id:'weekend',name:'Weekend holiday',date:'2027-01-02'}]};
test('holiday fill and contrast override weekend styling; transparent holiday uses effective weekend fill',()=>{
  const build=layout=>calendarLayout({...state,holidays,layout:{...styles,weekendBackground:'#000000',...layout}},0);
  const filled=build({});assert.equal(day(filled,2).color,'#111111');assert.equal(filled.rects.at(-1).color,holidays.color);
  const transparent=build({holidayBackgroundTransparent:true});assert.equal(day(transparent,2).color,'#ffffff');
  assert.ok(transparent.texts.filter(t=>t.role==='holiday'&&t.text.includes('Weekend')).every(t=>t.color==='#ffffff'));
  assert.equal(day(build({holidayContrast:false}),2).color,styles.weekendColor);
  assert.equal(day(build({holidayBackgroundTransparent:true,weekendBackgroundTransparent:true}),2).color,'#111111');
  assert.equal(day(build({holidayBackgroundTransparent:true,dateShape:'circle',dateShapeColor:'#ffffff'}),2).color,'#111111');
});

test('cellFill false disables base, weekend and adjacent fills but preserves independent holiday highlights',()=>{
  for(const cellGap of [0,4]) {
    for(const holidayBackgroundTransparent of [false,true]) {
      const plan=calendarLayout({...state,holidays:{...holidays,color:'#000000'},layout:{...styles,cellFill:false,cellGap,holidayBackgroundTransparent}},0);
      const fills=[...plan.rects.map(r=>r.color),...plan.decorations.map(d=>d.fill).filter(Boolean)];
      assert.equal(fills.length>0,!holidayBackgroundTransparent);
      assert.ok(fills.every(fill=>fill==='#000000'));
      assert.equal(day(plan,2).color,holidayBackgroundTransparent?'#111111':'#ffffff');
      assert.equal(dates(plan).length,31);
      if(cellGap) assert.equal(plan.rects.length,0);
      else assert.ok(plan.decorations.every(d=>!d.fill));
    }
  }
});

test('separated rounded cell decorations carry the same weekend fills and holiday layering',()=>{
  const plan=calendarLayout({...state,holidays,layout:{...styles,cellGap:4,cellRadius:8}},0);
  assert.equal(plan.rects.length,0);
  for(const prefix of ['weekend','leadingWeekend','trailingWeekend']) assert.ok(plan.decorations.some(d=>d.fill===styles[`${prefix}Background`]&&d.points.length>4));
  assert.equal(plan.decorations.at(-1).fill,holidays.color);
  const transparent=calendarLayout({...state,layout:{...styles,cellGap:4,weekendBackgroundTransparent:true}},0);
  assert.ok(!transparent.decorations.some(d=>d.fill===styles.weekendBackground));assert.ok(transparent.decorations.some(d=>d.stroke));
});

test('hidden adjacent cells and miniature slots stay excluded',()=>{
  const hidden=calendarLayout({...state,layout:{...styles,leadingMode:'hidden',trailingMode:'hidden'}},0);
  assert.equal(hidden.rects.length,31);assert.ok(!hidden.rects.some(r=>[styles.leadingWeekendBackground,styles.trailingWeekendBackground].includes(r.color)));
  const input={...state,layout:{...styles,miniCalendars:true,miniCalendarPlacement:'beginning',miniCalendarExtraRow:true}};
  const plan=calendarLayout(input,0),slots=miniCalendarPlacement(input,0).cells;
  assert.equal(slots.length,2);
  for(const cell of slots) {
    const {left,gridTop,cellWidth,rowHeight}=plan.geometry;
    assert.ok(!plan.rects.some(r=>r.x===left+(cell%7)*cellWidth&&r.y===gridTop+Math.floor(cell/7)*rowHeight));
  }
});
