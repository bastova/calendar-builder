import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarLayout } from '../public/calendar/src/scripts/layout.js';
import { federalHolidays } from '../public/calendar/src/scripts/holidays.js';

const state = {year:2027,width:12,height:6,margin:0.5,binding:0.5,week:0};
const sizes = plan => Object.fromEntries(['title','year','weekday','date'].map(role =>
  [role, [...new Set(plan.texts.filter(text => text.role===role).map(text => text.size))]]));

test('six-inch calendar uses consistent typography across all months with holidays enabled', () => {
  const settings = {...state,holidays:{enabled:true}};
  const january = calendarLayout(settings,0);
  assert.ok(january.texts.some(text => text.role==='holiday'));
  assert.ok(!calendarLayout(settings,2).texts.some(text => text.role==='holiday'));
  for(let month=1;month<12;month++) {
    assert.deepEqual(sizes(calendarLayout(settings,month)),sizes(january));
  }
});

test('a custom holiday reserves date space throughout the year', () => {
  const settings = {...state,holidays:{enabled:true,
    removed:federalHolidays(state.year).map(holiday => holiday.id),
    custom:[{id:'custom-march',name:'Birthday',date:'2027-03-12'}]}};
  assert.deepEqual(sizes(calendarLayout(settings,0)),sizes(calendarLayout(settings,2)));
});

test('disabled or fully removed holidays leave the full date space available', () => {
  const without = sizes(calendarLayout(state,0));
  for(const holidays of [
    {enabled:false},
    {enabled:true,removed:federalHolidays(state.year).map(holiday => holiday.id)},
  ]) {
    assert.deepEqual(sizes(calendarLayout({...state,holidays},0)),without);
  }
  assert.ok(without.date[0]>sizes(calendarLayout({...state,holidays:{enabled:true}},0)).date[0]);
});
