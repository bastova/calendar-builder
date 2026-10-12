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
 assert.ok(get('print-color-output').textContent.includes('same color model'));
 globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height}};
 state.view='printing';state.endSpread='opening';state.endSpreadColor='#ffffff';panel.render();
 assert.equal(panel.summary().artwork,'opening');assert.equal(panel.summary().solidEndSpread,true);
 assert.ok(get('print-color-selection').textContent.startsWith('Opening spread'));
 panel.dispose();delete globalThis.document;delete globalThis.ImageData;
});
