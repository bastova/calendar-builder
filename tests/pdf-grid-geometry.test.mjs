import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {calendarLayout, drawCalendarGrid} from '../public/calendar/src/scripts/layout.js';
import {pdfOutline, pdfDecoration} from '../public/calendar/src/scripts/grid-decoration.js';
import {prestoPhotoExportState} from '../public/calendar/src/scripts/prestophoto.js';

const source=await readFile(new URL('../public/calendar/src/scripts/pdf.js',import.meta.url),'utf8');
const vectorGrid=new Function('calendarLayout','pdfOutline','pdfDecoration','POINTS_PER_INCH',`${source.slice(source.indexOf('function vectorGrid('),source.indexOf('/** Encode only'))};return vectorGrid;`)(calendarLayout,pdfOutline,pdfDecoration,72);
const stateFor=layout=>prestoPhotoExportState({year:2027,width:12,height:12,margin:.25,binding:.3,bindingStyle:'wire',week:0,layout});
const capture=()=>{const calls=[];return {calls,doc:new Proxy({},{get:(_,name)=>(...args)=>calls.push([name,...args])})};};

for(let month=0;month<12;month++)test(`month ${month+1}: full bleed background and single trim translation match Canvas`,()=>{
  const state={...stateFor({layoutBackground:'#24683a',layoutBackgroundImage:true,gridRadius:12}),gridBackgroundJpeg:'saved-crop'};
  const plan=calendarLayout(state,month),{calls,doc}=capture();
  vectorGrid(doc,state,month,0);
  assert.deepEqual(calls[1],['rect',0,0,12.25,12.25,'F']);
  assert.deepEqual(calls[2],['addImage','saved-crop','JPEG',0,0,12.25,12.25,undefined,'NONE']);
  const fills=calls.filter(([name])=>name==='rect').slice(1);
  assert.deepEqual(fills,plan.rects.map(rect=>['rect',.125+rect.x,.125+rect.y,rect.width,rect.height,'F']));
  const canvasFills=[];
  const context=new Proxy({},{get:(_,name)=>(...args)=>{if(name==='fillRect')canvasFills.push(args);},set:()=>true});
  drawCalendarGrid(context,state,month,1200,1200);
  assert.deepEqual(canvasFills[0],[0,0,12,12]);
  assert.deepEqual(canvasFills.slice(1),plan.rects.map(rect=>[rect.x,rect.y,rect.width,rect.height]));
  const clip=calls.find(([name])=>name==='lines');
  assert.equal(clip[2],plan.gridClip[0][0]+.125);
  assert.equal(clip[3],plan.gridClip[0][1]+.125);
});

test('assembly slug is preserved, saddle trim-local background extends into negative bleed',()=>{
  const state=stateFor({layoutBackground:'#24683a'});
  for(const offset of [.25,-state.bleed]){
    const {calls,doc}=capture();vectorGrid(doc,state,0,offset);
    assert.deepEqual(calls[1],['rect',offset,offset,12.25,12.25,'F']);
  }
  assert.match(source,/vectorGrid\(pdf,gridState,page.month,-state.bleed\)/);
});

test('transparent background remains unprinted rather than forcing a colored bleed',()=>{
  const state=stateFor({layoutBackgroundTransparent:true}),{calls,doc}=capture();
  vectorGrid(doc,state,0,0);
  assert.equal(calls.some(([name,x,y,w,h])=>name==='rect'&&x===0&&y===0&&w===12.25&&h===12.25),false);
});

test('jsPDF 4.2.1 serializes full 882pt media fill and trim-local saddle bleed', {skip:!process.env.JSPDF_TEST_LIBRARY},()=>{
  const {jsPDF}=createRequire(import.meta.url)(process.env.JSPDF_TEST_LIBRARY);
  assert.equal(jsPDF.version,'4.2.1');
  const state=stateFor({layoutBackground:'#24683a'});
  for(const [offset,expected] of [[0,'0. 882. 882. -882. re'],[-.125,'-9. 891. 882. -882. re']]){
    const doc=new jsPDF({unit:'in',format:[12.25,12.25],compress:false,precision:6});
    vectorGrid(doc,state,0,offset);
    assert.ok(doc.output().includes(expected),expected);
  }
});
