import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,normalizeLayout,dateShapePoints} from '../public/calendar/src/scripts/layout.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0};
test('shapes are opt-in and saved settings normalize safely',()=>{
  assert.deepEqual(calendarLayout(state,0).shapes,[]);
  assert.equal(normalizeLayout({dateShape:'bad'}).dateShape,'none');
  const settings=normalizeLayout({dateShape:'star',dateShapeSize:42,dateShapeColor:'#123456'});
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
});
test('all six outlines produce finite vector coordinates behind every main date',()=>{
  for(const shape of ['circle','diamond','star','oval','square','squircle']) {
    const plan=calendarLayout({...state,layout:{dateShape:shape,dateShapeColor:'#123456'},holidays:{enabled:true}},0);
    assert.equal(plan.shapes.length,31);
    for(const item of plan.shapes) {
      assert.equal(item.color,'#123456');
      assert.ok(item.points.length>=4);
      assert.ok(item.points.flat().every(Number.isFinite));
    }
    assert.equal(plan.shapes[0].points.length,shape==='star'?10:['square','diamond'].includes(shape)?4:64);
  }
  const oval=dateShapePoints('oval',0,0,1);
  assert.equal(Math.max(...oval.map(p=>p[0])),.7);
});
test('badges follow alignment, reserve holiday spacing, and exclude miniature dates',()=>{
  const plan=calendarLayout({...state,layout:{dateShape:'circle',dateShapeSize:36,miniCalendars:true},holidays:{enabled:true}},0);
  assert.equal(plan.shapes.length,31);
  for(const vertical of ['top','middle','bottom']) for(const align of ['left','center','right']) {
    const layout={dateShape:'square',dateShapeSize:36,dateVertical:vertical,fonts:{date:{align}}};
    const result=calendarLayout({...state,layout},0),g=result.geometry;
    const first=result.shapes[0].points;
    const x=g.left+5*g.cellWidth,y=g.gridTop;
    assert.ok(first.every(([px,py])=>px>=x&&px<=x+g.cellWidth&&py>=y&&py<=y+g.rowHeight));
  }
});
