import test from 'node:test';
import assert from 'node:assert/strict';
import { PRINTERS, printerById, assessPrinterMedia } from '../public/calendar/src/scripts/printers.js';
import { pdfSheetGeometry, pdfPageBoxSupport } from '../public/calendar/src/scripts/pdf-geometry.js';
import { normalizePrintColor, simulatePaperPixels, printColorSummary, createPrintColorPanel } from '../public/calendar/src/scripts/print-color.js';
const base={width:12,height:12,bleed:.125,bindingStyle:'wire',cropMarks:false};
test('catalog preserves every selection and migrates legacy targets',()=>{
 assert.equal(new Set(PRINTERS.map(p=>p.id)).size,46);
 for(const printer of PRINTERS){assert.equal(normalizePrintColor({target:printer.id}).target,printer.id);assert.ok(printer.source.startsWith('https://'));assert.ok(printer.sheet||printer.rollWidth||printer.id==='commercial');}
 assert.equal(normalizePrintColor({target:'unknown'}).target,'epson');
 assert.equal(normalizePrintColor({target:'commercial'}).target,'commercial');
});
test('actual sheet dimensions include bleed, saddle imposition and fallback crop-mark slug',()=>{
 assert.equal(pdfSheetGeometry(base,true).width,12.25);
 assert.equal(pdfSheetGeometry(base,false).width,12.75);
 assert.equal(pdfSheetGeometry({...base,cropMarks:true},true).height,12.75);
 assert.equal(pdfSheetGeometry({...base,bindingStyle:'saddle'},false).height,24.75);
 assert.equal(pdfSheetGeometry(base,null).uncertain,true);
 class WithBoxes{internal={getCurrentPageInfo:()=>({pageContext:{trimBox:null,bleedBox:null}})}}
 class WithoutBoxes{internal={getCurrentPageInfo:()=>({pageContext:{}})}}
 assert.equal(pdfPageBoxSupport(WithBoxes),true);assert.equal(pdfPageBoxSupport(WithoutBoxes),false);
});
test('fit checks distinguish standard sheets, image area, rolls and unknown capacity',()=>{
 assert.equal(assessPrinterMedia(printerById('epson'),pdfSheetGeometry(base,true)).status,'nominal-fit');
 assert.equal(assessPrinterMedia(printerById('epson'),pdfSheetGeometry({...base,bindingStyle:'saddle'},true)).status,'outside-reference');
 assert.equal(assessPrinterMedia(printerById('indigo15k'),pdfSheetGeometry({...base,bindingStyle:'saddle'},true)).status,'nominal-fit');
 assert.equal(assessPrinterMedia(printerById('et8500'),pdfSheetGeometry(base,true)).status,'outside-reference');
 assert.equal(assessPrinterMedia(printerById('indigo7kplus'),{width:12.75,height:18}).printable,false);
 assert.equal(assessPrinterMedia(printerById('p7570'),{width:24.25,height:24.25}).status,'outside-width');
 assert.equal(assessPrinterMedia(printerById('p7570'),{width:12.25,height:24.25}).status,'width-only');
 assert.equal(assessPrinterMedia(printerById('commercial'),{width:12,height:24}).status,'unknown');
 assert.equal(assessPrinterMedia(printerById('office9730'),{width:11,height:17}).status,'nominal-fit');
 assert.equal(assessPrinterMedia(printerById('office9730'),{width:11.5,height:16.8}).status,'outside-reference');
 assert.equal(assessPrinterMedia(printerById('epson'),{width:19,height:13}).status,'nominal-fit');
});
test('paper model is bounded, neutral, alpha-preserving and identity at neutral settings',()=>{
 const source=new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,0,0,128,65,129,201,255]);
 assert.deepEqual(simulatePaperPixels({data:source.slice()},{white:100,black:0,chroma:0}).data,source);
 const output=simulatePaperPixels({data:source.slice()},{white:94,black:3,chroma:10}).data;
 assert.ok(output[0]>0&&output[4]<255);assert.equal(output[0],output[1]);assert.equal(output[4],output[5]);assert.equal(output[11],128);
 for(let i=0;i<256;i++){const data=new Uint8ClampedArray([i,i,i,255]);simulatePaperPixels({data},{white:88,black:6,chroma:60});assert.equal(data[0],data[1]);assert.equal(data[1],data[2]);}
});
test('summaries never claim calibration, ICC conversion or device-specific color measurements',()=>{
 for(const printer of PRINTERS){const summary=printColorSummary({...base,printColor:{target:printer.id}});assert.equal(summary.calibrated,false);assert.equal(summary.iccTransformApplied,false);assert.equal(summary.deviceColorProfileAvailable,false);assert.equal(summary.pdfColorSpace,'RGB');}
});
test('printer selector renders all groups and updates source and media feedback',()=>{
 const nodes=new Map();
 class Node{children=[];value='';textContent='';hidden=false;classList={toggle(){}};append(n){this.children.push(n)}replaceChildren(){this.children=[]}setAttribute(){}addEventListener(){}removeEventListener(){}querySelector(selector){return get(selector)} getContext(){return {fillRect(){},getImageData:()=>({data:new Uint8ClampedArray(this.width*this.height*4)}),putImageData(){}}} }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
 globalThis.document={getElementById:get,createElement:()=>new Node()};
 const state={...base,view:'spread',month:0,printColor:{target:'epson'}};
 const panel=createPrintColorPanel(()=>state,()=>{});panel.render();
 assert.equal(get('print-color-target').children.flatMap(n=>n.children).length,46);
 state.printColor.target='indigo7kplus';state.cropMarks=true;panel.render();
 assert.ok(get('printer-spec-source').href.includes('7k-plus'));
 assert.ok(get('print-color-media').textContent.includes('Exceeds the documented image area'));
 assert.ok(get('print-color-output').textContent.includes('Color estimate unavailable'));
 globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height}};
 state.view='printing';state.endSpread='opening';state.endSpreadColor='#ffffff';panel.render();
 assert.equal(panel.summary().artwork,'opening');assert.equal(panel.summary().solidEndSpread,true);
 assert.ok(get('print-color-selection').textContent.startsWith('Opening spread'));
 panel.dispose();delete globalThis.document;delete globalThis.ImageData;
});

test('ICC proof uses output profile data, isolates printer/paper assignments and preserves alpha',async()=>{
 const {loadProfile,profileFor,proofPixels,removeProfile,validateProfile}=await import('../public/calendar/src/scripts/icc-proof.js');
 // Synthetic matrix/TRC output profiles solely for exercising the CMM; not device measurements.
 function fixture(gamma,narrow=false){
  const xyz=values=>{const b=Buffer.alloc(20);b.write('XYZ ');values.forEach((v,i)=>b.writeInt32BE(Math.round(v*65536),8+i*4));return b};
  const curve=Buffer.alloc(14);curve.write('curv');curve.writeUInt32BE(1,8);curve.writeUInt16BE(Math.round(gamma*256),12);
  const tags=[['wtpt',xyz([.9642,1,.8249])],['rXYZ',xyz([.4361,.2225,.0139])],['gXYZ',xyz([.3851,.7169,.0971])],['bXYZ',xyz([.1431,.0606,.7141])],['rTRC',curve],['gTRC',curve],['bTRC',curve]];
  if(narrow)for(const [name,b] of tags){if(['rXYZ','gXYZ','bXYZ'].includes(name))for(let i=0;i<3;i++)b.writeInt32BE(Math.round((b.readInt32BE(8+i*4)/65536*.5+[.9642,1,.8249][i]/6)*65536),8+i*4);}
  let offset=132+tags.length*12;const size=offset+tags.reduce((n,[,b])=>n+Math.ceil(b.length/4)*4,0),bytes=Buffer.alloc(size);
  bytes.writeUInt32BE(size);bytes.writeUInt32BE(0x02100000,8);bytes.write('prtr',12);bytes.write('RGB ',16);bytes.write('XYZ ',20);bytes.write('acsp',36);[.9642,1,.8249].forEach((v,i)=>bytes.writeInt32BE(Math.round(v*65536),68+i*4));bytes.writeUInt32BE(tags.length,128);
  tags.forEach(([name,b],i)=>{bytes.write(name,132+i*12);bytes.writeUInt32BE(offset,136+i*12);bytes.writeUInt32BE(b.length,140+i*12);b.copy(bytes,offset);offset+=Math.ceil(b.length/4)*4});return new Uint8Array(bytes);
 }
 assert.throws(()=>validateProfile(new Uint8Array(200)),/output ICC/);
 const a=await loadProfile('test-a','coated',fixture(2.2),'fixture-a.icc');
 const b=await loadProfile('test-b','coated',fixture(1.2,true),'fixture-b.icc');
 assert.equal(profileFor('test-a','uncoated'),undefined);assert.equal(profileFor('test-a','coated'),a);
 const data=new Uint8ClampedArray([34,120,231,127,255,255,255,255,0,0,0,255]);
 const proof=proofPixels({data:data.slice()},a);assert.notDeepEqual(proof.data,proofPixels({data:data.slice()},b).data);assert.equal(proof.data[3],127);assert.ok(proof.data.every(Number.isFinite));
 // Different valid profiles must create separate transforms; removing one must not affect the other.
 assert.notEqual(a.transform,b.transform);removeProfile('test-a','coated');assert.equal(profileFor('test-b','coated'),b);removeProfile('test-b','coated');
});
