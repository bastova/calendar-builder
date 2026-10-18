import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdfExportTarget, prestoPhotoExportState, prestoPhotoSummary, prestoPhotoSrgbProfile, configurePrestoPhotoPdf, prestoPhotoPageBoxes } from '../public/calendar/src/scripts/prestophoto.js';
import { printPages, readerState } from '../public/calendar/src/scripts/layout.js';

for(const bindingStyle of ['wire','saddle'])for(const opening of [false,true])for(const closing of [false,true]) {
  test(`${bindingStyle}: reader geometry and optional spreads ${opening}/${closing}`,()=>{
    const state={width:12,height:12,bleed:.4,cropMarks:true,binding: .3,bindingStyle,includeOpeningSpread:opening,includeClosingSpread:closing};
    const before=structuredClone(state),output=prestoPhotoExportState(state),summary=prestoPhotoSummary(state),pages=printPages(output);
    assert.deepEqual(state,before);assert.equal(output.height,readerState(state).height);assert.equal(output.width,12);
    assert.equal(output.binding,bindingStyle==='saddle'?0:.3);assert.equal(output.bleed,.125);assert.equal(output.cropMarks,false);
    assert.equal(summary.mediaWidth,12.25);assert.equal(summary.mediaHeight,12.25);assert.equal(summary.pages,26+2*Number(opening)+2*Number(closing));
    assert.equal(pages[0].key,'front-cover');assert.equal(pages.at(-1).key,'back-cover');assert.equal(pages.some(page=>page.padding),false);
    for(let month=0;month<12;month++){const i=pages.findIndex(page=>page.key===`month-${month}`);assert.equal(pages[i+1].kind,'grid');assert.equal(pages[i+1].month,month);}
  });
}
test('default assembly, custom sizes explicitly unverified',()=>{
  for(const value of [undefined,null,'','other','assembly'])assert.equal(normalizePdfExportTarget(value),'assembly');
  assert.equal(normalizePdfExportTarget('prestophoto'),'prestophoto');
  const summary=prestoPhotoSummary({width:8,height:10});assert.equal(summary.supportedSize,false);assert.match(summary.notices.join(' '),/Confirm this custom size/);
});
test('ICC profile has valid RGB header, complete tag bounds and sRGB transfer endpoints',()=>{
  const bytes=prestoPhotoSrgbProfile(),view=new DataView(bytes.buffer),text=i=>String.fromCharCode(...bytes.slice(i,i+4));
  assert.equal(view.getUint32(0),bytes.length);assert.equal(text(36),'acsp');assert.equal(text(16),'RGB ');
  for(let i=0;i<view.getUint32(128);i++){const offset=view.getUint32(136+12*i),length=view.getUint32(140+12*i);assert.ok(offset+length<=bytes.length);if(text(132+12*i)==='rTRC'){assert.equal(view.getUint16(offset+12),0);assert.equal(view.getUint16(offset+length-2),65535);}}
});
test('generated mocked PDF serializes ICC and PDF1.5; box fallback adds neither marks nor slug',()=>{
  const events=new Map(),chunks=[];let version,object=10;
  const doc={__private__:{setPdfVersion:value=>version=value},internal:{events:{subscribe:(name,callback)=>events.set(name,callback)},newObject:()=>++object,putStream:({additionalKeyValues,data})=>chunks.push(`<< /N ${additionalKeyValues[0].value} /Length ${data.length} >> stream\n${data}\nendstream`),write:value=>chunks.push(value)}};
  configurePrestoPhotoPdf(doc);assert.equal(version,'1.5');
  assert.equal(prestoPhotoPageBoxes(doc,{width:12,height:12}),false);
  events.get('putResources')();chunks.push('/XObject <<');events.get('putXobjectDict')();chunks.push('>>');
  const pdf=`%PDF-${version}\n${chunks.join('\n')}`;
  assert.match(pdf,/DefaultRGB \[\/ICCBased 11 0 R\]/);assert.match(pdf,/\/N 3/);assert.doesNotMatch(pdf,/CropBox|crop marks|SWOP/);
  const context={trimBox:null,bleedBox:null};doc.internal.getCurrentPageInfo=()=>({pageContext:context});
  assert.equal(prestoPhotoPageBoxes(doc,{width:12,height:12}),true);assert.deepEqual(context.trimBox,{bottomLeftX:9,bottomLeftY:9,topRightX:873,topRightY:873});assert.equal(context.bleedBox.topRightY,882);
});

// jsPDF registers addImage subscribers on the first image, after configuration.
// Reproduce that ordering: all image names must remain inside /XObject.
test('lazy image resources precede the ICC dictionary hook, including repeated output',()=>{
  const events=new Map(),chunks=[];
  const subscribe=(name,callback)=>events.set(name,[...(events.get(name)??[]),callback]);
  const publish=name=>{for(const callback of events.get(name)??[])callback();};
  let object=10;
  const doc={__private__:{setPdfVersion(){}},internal:{events:{subscribe},newObject:()=>++object,putStream(){},write:value=>chunks.push(value)}};
  configurePrestoPhotoPdf(doc);
  subscribe('putXobjectDict',()=>chunks.push('/I0 9 0 R\n/I1 10 0 R'));
  for(let output=0;output<2;output++){
    chunks.length=0;
    publish('putResources');chunks.push('/XObject <<');publish('putXobjectDict');chunks.push('>>');
    const resources=chunks.join('\n');
    assert.match(resources,/\/XObject <<\s*\/I0 9 0 R\s*\/I1 10 0 R\s*>>/);
    assert.match(resources,new RegExp(`DefaultRGB \\[\\/ICCBased ${11+output} 0 R\\]`));
    assert.match(resources,/\/PrestoPhotoResources <<\s*>>/);
    assert.equal(events.get('putXobjectDict').length,2);
  }
});

/** Optional integration uses the exact production CDN build, without adding a dependency. */
test('jsPDF 4.2.1 keeps photos and raster lettering in page XObjects', {skip:!process.env.JSPDF_TEST_LIBRARY},async()=>{
  const {createRequire}=await import('node:module');
  const {jsPDF}=createRequire(import.meta.url)(process.env.JSPDF_TEST_LIBRARY);
  assert.equal(jsPDF.version,'4.2.1');
  const doc=new jsPDF({compress:true});
  configurePrestoPhotoPdf(doc);
  const image={data:new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255]),width:2,height:2};
  doc.addImage({imageData:image,format:'RGBA',x:10,y:10,w:50,h:50});
  doc.addImage({imageData:{...image,data:new Uint8ClampedArray([0,0,0,255,255,255,255,0,255,255,255,0,0,0,0,255])},format:'RGBA',x:10,y:70,w:50,h:50});
  for(let output=0;output<2;output++){
    const pdf=doc.output();
    assert.match(pdf,/^%PDF-1\.5/);
    const resources=pdf.match(/\n2 0 obj\n([\s\S]*?)endobj/)[1];
    const xobjects=resources.match(/\/XObject <<([\s\S]*?)>>/)[1];
    for(const name of ['I0','I1']){
      const id=xobjects.match(new RegExp(`/${name} (\\d+) 0 R`))?.[1];
      assert.ok(id,`${name} is a page XObject, not an extension entry`);
      assert.ok(pdf.includes(`\n${id} 0 obj\n<<\n/Type /XObject\n/Subtype /Image`));
    }
    assert.match(resources,/\/ColorSpace << \/DefaultRGB \[\/ICCBased \d+ 0 R\] >>/);
    assert.match(resources,/\/PrestoPhotoResources <<\s*>>/);
  }
});

test('every month returns a complete raster lettering plan without emitting PDF text',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {calendarLayout}=await import('../public/calendar/src/scripts/layout.js');
  const {pdfOutline,pdfDecoration}=await import('../public/calendar/src/scripts/grid-decoration.js');
  const source=await readFile(new URL('../public/calendar/src/scripts/pdf.js',import.meta.url),'utf8');
  const start=source.indexOf('function vectorGrid('),end=source.indexOf('/** Encode only',start);
  const vectorGrid=new Function('calendarLayout','pdfOutline','pdfDecoration','POINTS_PER_INCH',`${source.slice(start,end)};return vectorGrid;`)(calendarLayout,pdfOutline,pdfDecoration,72);
  let calls=0;
  const doc=new Proxy({},{get:(_,key)=>['setFont','setFontSize','setTextColor','text'].includes(key)?()=>assert.fail(`Unembedded PDF text path: ${key}`):()=>{calls++;}});
  for(const bindingStyle of ['wire','saddle'])for(let month=0;month<12;month++){
    const state=prestoPhotoExportState({year:2027,width:12,height:12,bindingStyle,week:0,layout:{}});
    const expected=calendarLayout(state,month),actual=vectorGrid(doc,state,month,0);
    assert.deepEqual(actual.texts,expected.texts);assert.ok(actual.texts.length>28);assert.ok(actual.texts.every(item=>typeof item.text==='string'&&item.font));
  }
  assert.ok(calls>0);
  assert.ok(source.indexOf('if(prestoPhoto) return await downloadPrestoPhotoPdf')<source.indexOf('let doc=new Constructor(pageFormat(pdfWidth,pdfHeight))'),'PrestoPhoto exits before assembly document allocation');
});


test('PrestoPhoto lettering compresses both RGB and alpha rather than accumulating full-page raw streams',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../public/calendar/src/scripts/pdf.js',import.meta.url),'utf8');
  const start=source.indexOf('async function prestoPhotoGrid('),end=source.indexOf('const pageMonthLabel=',start);
  const originalDocument=globalThis.document;
  const calls=[],placements=[];
  const canvas={width:0,height:0,getContext:()=>({scale:(...args)=>placements.push(['scale',...args]),translate:(...args)=>placements.push(['translate',...args]),fillText:(...args)=>placements.push(['fillText',...args])}),toBlob:callback=>callback(new Blob([new Uint8Array([137,80,78,71])]))};
  globalThis.document={createElement:()=>canvas};
  try {
    const render=new Function('vectorGrid','printRasterSpec','canvasFont','TARGET_PPI','pageMonthLabel',`${source.slice(start,end)};return prestoPhotoGrid;`)(()=>({texts:[{font:{},size:1,text:'January',x:0,y:0}]}),()=>({width:3675,height:3675,ppi:300}),()=> '12px Arial',300,month=>`Month ${month+1}`);
    await render({addImage:(...args)=>calls.push(args)},{width:12,height:12,bleed:.125},0,[]);
    assert.equal(calls.length,1);
    assert.equal(calls[0][1],'PNG');
    assert.equal(calls[0][7],'FAST');
    assert.deepEqual(calls[0].slice(2,6),[0,0,12.25,12.25]);
    assert.deepEqual(placements,[['scale',300,300],['translate',.125,.125],['fillText','January',0,0]]);
    assert.equal(canvas.width,1);
    assert.equal(canvas.height,1);
  } finally {globalThis.document=originalDocument;}
});

test('unsupported PDF runtime fails closed',()=>assert.throws(()=>configurePrestoPhotoPdf({}),/cannot write/));
