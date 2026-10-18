import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarLayout,normalizeLayout} from '../public/calendar/src/scripts/layout.js';
import {roundedOutline,canvasDecoration,pdfDecoration} from '../public/calendar/src/scripts/grid-decoration.js';
import {requiredPhotoKeys} from '../public/calendar/src/scripts/pdf.js';
const state={year:2027,width:12,height:12,margin:.5,binding:.5,week:0};
test('grid segment end gaps shorten every segment and hiding outer boundary preserves internal edges',()=>{
  const plain=calendarLayout(state,0),gapped=calendarLayout({...state,layout:{gridLineGap:4}},0);
  assert.equal(plain.lines.length,gapped.lines.length);
  plain.lines.forEach((line,i)=>assert.ok(Math.hypot(line.x2-line.x1,line.y2-line.y1)>Math.hypot(gapped.lines[i].x2-gapped.lines[i].x1,gapped.lines[i].y2-gapped.lines[i].y1)));
  const internal=calendarLayout({...state,layout:{gridOuterBoundary:false}},0);
  assert.ok(internal.lines.length>0&&internal.lines.length<plain.lines.length);
  assert.ok(internal.lines.every(line=>line.count===2));
});
test('weekday and month/year containers use independent fills, strokes and radii',()=>{
  const layout={weekdayFill:true,weekdayBackground:'#123456',weekdayBorderColor:'#223344',weekdayBorderWidth:2,weekdayRadius:8,monthHeaderFill:true,monthHeaderBackground:'#334455',monthHeaderBorderWidth:1,monthHeaderRadius:12,yearHeaderFill:true,yearHeaderBackground:'#445566'};
  const plan=calendarLayout({...state,layout},0);
  assert.equal(plan.decorations.filter(d=>d.fill==='#123456').length,7);
  assert.equal(plan.decorations.filter(d=>d.fill==='#334455').length,1);
  assert.equal(plan.decorations.filter(d=>d.fill==='#445566').length,1);
  assert.equal(plan.decorations.find(d=>d.stroke==='#223344').width,2/72);
});
test('outer rounding optionally includes weekdays; second border encloses the selected region',()=>{
  for(const include of [false,true]) {
    const plan=calendarLayout({...state,layout:{gridRadius:12,gridRoundWeekdays:include,outerBorder:true,outerBorderWeekdays:include,outerBorderColor:'#abcdef',outerBorderGap:5}},0);
    const minY=Math.min(...plan.gridClip.map(p=>p[1]));
    assert.equal(minY,include?plan.geometry.start:plan.geometry.gridTop);
    const border=plan.decorations.find(d=>d.stroke==='#abcdef');
    assert.ok(Math.min(...border.points.map(p=>p[1]))<minY);
    assert.ok(Math.max(...border.points.map(p=>p[1]))>plan.geometry.gridTop+6*plan.geometry.rowHeight);
  }
});
test('individual rounded cells retain holiday fills and gaps without shared lines',()=>{
  const plan=calendarLayout({...state,layout:{cellGap:8,cellRadius:10},holidays:{enabled:true,color:'#abcdef'}},0);
  assert.equal(plan.lines.length,0);
  assert.equal(plan.rects.length,0);
  const cells=plan.decorations.filter(d=>d.fill==='#ffffff');
  assert.equal(cells.length,42);
  const width=Math.max(...cells[0].points.map(p=>p[0]))-Math.min(...cells[0].points.map(p=>p[0]));
  assert.ok(Math.abs(width-(plan.geometry.cellWidth-8/72))<1e-8);
  assert.ok(plan.decorations.some(d=>d.fill==='#abcdef'&&d.points.length>4));
});
test('transparent cells expose layout background and background image is required only when enabled',()=>{
  const plan=calendarLayout({...state,layout:{cellFill:false,layoutBackground:'#123456'}},0);
  assert.equal(plan.rects.length,0);
  assert.equal(plan.settings.layoutBackground,'#123456');
  assert.ok(!requiredPhotoKeys(state).includes('layout-background'));
  assert.ok(requiredPhotoKeys({...state,layout:{layoutBackgroundImage:true}}).includes('layout-background'));
});
test('styles survive persistence, clamp untrusted input, and never emit non-finite geometry',()=>{
  const input={gridLineGap:9,cellRadius:10,cellGap:24,gridRadius:24,outerBorder:true,outerBorderWeekdays:true,weekdayFill:true,layoutBackgroundImage:true};
  const settings=normalizeLayout(input);
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(settings))),settings);
  assert.equal(normalizeLayout({cellGap:-8,gridRadius:Infinity,weekdayBorderColor:'red'}).cellGap,0);
  for(const height of [4,6,12]) for(const week of [0,1]) for(let month=0;month<12;month++) {
    const plan=calendarLayout({...state,height,week,layout:settings},month);
    assert.ok(plan.decorations.flatMap(d=>d.points.flat()).every(Number.isFinite));
    assert.ok(plan.geometry.cellWidth>2*plan.geometry.paddingX);
    assert.ok(plan.geometry.rowHeight>2*plan.geometry.paddingY);
  }
});
test('Canvas and PDF use identical rounded outlines and clipping, skipping invisible decorations',()=>{
  const item={points:roundedOutline(1,2,3,4,.25),fill:'#ffffff',stroke:'#123456',width:.01,clip:true};
  const calls=[];
  const canvas=new Proxy({}, {get:(_,name)=>(...args)=>calls.push([name,...args]),set:()=>true});
  canvasDecoration(canvas,item,item.points);
  assert.ok(calls.some(([name])=>name==='clip'));
  const pdfCalls=[];
  const pdf=new Proxy({}, {get:(_,name)=>(...args)=>pdfCalls.push([name,...args])});
  pdfDecoration(pdf,item,item.points,.5);
  assert.ok(pdfCalls.some(([name])=>name==='clip'));
  assert.equal(pdfCalls.filter(([name])=>name==='lines').length,2);
  assert.equal(pdfCalls.find(([name])=>name==='lines')[2],item.points[0][0]+.5);
  pdfCalls.length=0;pdfDecoration(pdf,{...item,fill:null,width:0},null,0);
  assert.equal(pdfCalls.length,0);
});
