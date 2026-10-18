import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,normalizeLayout} from '../public/calendar/src/scripts/layout.js';
import {roundedOutline} from '../public/calendar/src/scripts/grid-decoration.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0};
const fills=plan=>plan.decorations.filter(d=>d.fill==='#123456');
test('old weekday radius and borders migrate to independent corner and separator settings',()=>{
  const settings=normalizeLayout({weekdayRadius:10,weekdayBorderWidth:2,weekdayBorderColor:'#123456'});
  for(const corner of ['TL','TR','BL','BR'])assert.equal(settings[`weekdayRadius${corner}`],10);
  assert.equal(settings.weekdaySeparatorWidth,2);
  assert.equal(settings.weekdaySeparatorColor,'#123456');
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
});
test('outer-only top rounding forms a continuous weekday band with square bottom corners',()=>{
  for(const week of [0,1]) {
    const plan=calendarLayout({...state,week,layout:{weekdayFill:true,weekdayBackground:'#123456',weekdayRadiusMode:'outer',weekdayRadiusTL:12,weekdayRadiusTR:18,weekdayRadiusBL:0,weekdayRadiusBR:0,weekdaySeparators:false,weekdayBorderWidth:1}},0);
    const cells=fills(plan),g=plan.geometry;
    assert.equal(cells.length,7);
    assert.ok(cells[0].points.length>4&&cells[6].points.length>4);
    for(const cell of cells.slice(1,6))assert.equal(cell.points.length,4);
    assert.ok(cells[0].points.some(([x,y])=>x===g.left&&y===g.start+g.weekdayHeight));
    assert.ok(!plan.decorations.some(d=>d.closed===false&&d.points.every(p=>p[0]===g.left+g.cellWidth)));
  }
});
test('each corner changes independently and inner cells can be rounded too',()=>{
  const square=roundedOutline(0,0,4,2,0);
  assert.equal(square.length,4);
  for(const corner of ['tl','tr','bl','br']) {
    const points=roundedOutline(0,0,4,2,{[corner]:.5});
    assert.equal(points.length,12);
    assert.ok(points.flat().every(Number.isFinite));
  }
  const plan=calendarLayout({...state,layout:{weekdayFill:true,weekdayBackground:'#123456',weekdayRadiusTL:12,weekdayRadiusMode:'each'}},0);
  assert.ok(fills(plan).every(cell=>cell.points.length>4));
});
test('internal borders use their own color and thickness independently of the perimeter',()=>{
  const plan=calendarLayout({...state,layout:{weekdayBorderWidth:2,weekdayBorderColor:'#111111',weekdaySeparators:true,weekdaySeparatorWidth:3,weekdaySeparatorColor:'#abcdef'}},0);
  assert.equal(plan.decorations.filter(d=>d.stroke==='#abcdef').length,12);
  assert.ok(plan.decorations.filter(d=>d.stroke==='#abcdef').every(d=>d.width===3/72&&d.closed===false));
  const noDividers=calendarLayout({...state,layout:{weekdayBorderWidth:2,weekdaySeparators:false,weekdaySeparatorColor:'#abcdef',weekdaySeparatorWidth:3}},0);
  assert.ok(!noDividers.decorations.some(d=>d.stroke==='#abcdef'));
  assert.ok(noDividers.decorations.some(d=>d.stroke==='#aaaaaa'&&d.width===2/72));
});
test('oversized asymmetric radii fit their rectangle without crossing or non-finite coordinates',()=>{
  const points=roundedOutline(1,2,3,1,{tl:100,tr:40,bl:20,br:80});
  for(const [x,y] of points)assert.ok(x>=1-1e-9&&x<=4+1e-9&&y>=2-1e-9&&y<=3+1e-9);
  assert.equal(normalizeLayout({weekdayRadiusTL:-3}).weekdayRadiusTL,0);
});
