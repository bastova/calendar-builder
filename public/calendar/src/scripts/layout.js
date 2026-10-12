import { FONT_CATALOG } from './fonts.js';
import { holidayList, holidaysForDate, holidayTextColor, wrapHolidayText } from './holidays.js';
const POINTS_PER_INCH = 72;
const TEXT_HEIGHT = 1.3;
const TEXT_ASCENT = 0.98;
const GLYPH_GUARD = 0.2;
const HOLIDAY_LINE_HEIGHT = 1.35;
const ALIGNMENTS = ['left','center','right'];
const FONT_STYLES = ['normal','bold','italic','bolditalic'];
export const LAYOUT_FONTS = Object.freeze({times:'"Times New Roman", Times, serif',helvetica:'Arial, Helvetica, sans-serif',courier:'"Courier New", Courier, monospace',...Object.fromEntries(Object.entries(FONT_CATALOG).map(([key,font])=>[key,`"${font.label}"`]))});
export const LAYOUT_ROLES = Object.freeze(['title','year','weekday','date','holiday']);
// Artwork typography is used only by generated back-cover artwork, not monthly captions.
export const ARTWORK_FONT_ROLES = Object.freeze(['artist','artworkTitle','description']);
const FONT_SETTING_ROLES = [...LAYOUT_ROLES,...ARTWORK_FONT_ROLES];
export const ARTWORK_METADATA_LIMITS = Object.freeze({artist:120,title:160,description:1000});
/** Validate twelve independent month records, separate from photo references and crops. */
export function normalizeArtworkMetadata(value) {
  return Object.fromEntries(Array.from({length:12},(_,month)=>{
    const key=`month-${month}`,source=value?.[key];
    return [key,Object.fromEntries(Object.entries(ARTWORK_METADATA_LIMITS).map(([field,limit])=>[field,typeof source?.[field]==='string'?source[field].slice(0,limit):'']))];
  }));
}
export const LAYOUT_LIMITS = Object.freeze({insetX:[0,2],insetTop:[0,2],insetBottom:[0,2],headingHeight:[0.1,4],headingGap:[0,1],weekdayHeight:[0.1,2],weekdayGap:[0,1],paddingX:[0,0.75],paddingY:[0,0.75],holidayGap:[0,0.5],lineWidth:[0,6],holidayLines:[1,4]});
export const FONT_SIZE_LIMITS = Object.freeze([4,144]);
const FONT_DEFAULTS = {title:{family:'times',size:58,style:'normal',align:'left',color:'#111111'},year:{family:'helvetica',size:30,style:'normal',align:'right',color:'#111111'},weekday:{family:'helvetica',size:16,style:'bold',align:'center',color:'#111111'},date:{family:'helvetica',size:22,style:'normal',align:'left',color:'#111111'},holiday:{family:'helvetica',size:10,style:'normal',align:'left',color:'#111111'},artist:{family:'helvetica',size:12,style:'italic',align:'left',color:'#111111'},artworkTitle:{family:'times',size:14,style:'bold',align:'left',color:'#111111'},description:{family:'helvetica',size:10,style:'normal',align:'left',color:'#111111'}};
export const LAYOUT_DEFAULTS = Object.freeze({version:1,insetX:0,insetTop:0,insetBottom:0,headingHeight:1.6,headingGap:0.12,weekdayHeight:0.45,weekdayGap:0.08,paddingX:0.08,paddingY:0.08,holidayGap:0.04,lineWidth:0.5,holidayLines:4,dateVertical:'top',lineColor:'#aaaaaa',cellBackground:'#ffffff',sundayColor:'#a23e3e',saturdayColor:'#435b82',weekendColors:false,holidayContrast:true,fonts:Object.freeze(Object.fromEntries(FONT_SETTING_ROLES.map(role=>[role,Object.freeze(FONT_DEFAULTS[role])])))});
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const color = (value,fallback) => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
/** Normalize old or untrusted saved layout data into independent global settings. */
export function normalizeLayout(value) {
  const result={...LAYOUT_DEFAULTS,fonts:{}};
  for(const [key,[min,max]] of Object.entries(LAYOUT_LIMITS)) result[key]=typeof value?.[key]==='number' && Number.isFinite(value[key]) ? clamp(value[key],min,max) : LAYOUT_DEFAULTS[key];
  result.holidayLines=Math.round(result.holidayLines);
  result.dateVertical=['top','middle','bottom'].includes(value?.dateVertical)?value.dateVertical:LAYOUT_DEFAULTS.dateVertical;
  result.weekendColors=value?.weekendColors===true;
  result.holidayContrast=value?.holidayContrast!==false;
  for(const key of ['lineColor','cellBackground','sundayColor','saturdayColor']) result[key]=color(value?.[key],LAYOUT_DEFAULTS[key]);
  for(const role of FONT_SETTING_ROLES) {
    const source=value?.fonts?.[role],fallback=FONT_DEFAULTS[role];
    result.fonts[role]={family:Object.hasOwn(LAYOUT_FONTS,source?.family)?source.family:fallback.family,size:typeof source?.size==='number'&&Number.isFinite(source.size)?clamp(source.size,...FONT_SIZE_LIMITS):fallback.size,style:FONT_CATALOG[source?.family] ? (Object.hasOwn(FONT_CATALOG[source.family].files,source?.style)?source.style:'normal') : FONT_STYLES.includes(source?.style)?source.style:fallback.style,align:ALIGNMENTS.includes(source?.align)?source.align:fallback.align,color:color(source?.color,fallback.color)};
  }
  if(value?.artworkStyleVersion!==1) {
    result.fonts.artworkTitle.style='bold';
    result.fonts.artist.style='italic';
  }
  result.artworkStyleVersion=1;
  if(value?.artworkSizeVersion!==1 && value?.fonts?.artist && value?.fonts?.artworkTitle) {
    const artistSize=result.fonts.artist.size;
    result.fonts.artist.size=result.fonts.artworkTitle.size;
    result.fonts.artworkTitle.size=artistSize;
  }
  result.artworkSizeVersion=1;
  return result;
}
/** Map one PDF core font to its browser counterpart, without loading fonts. */
export function canvasFont(font,size) {
  return `${font.style.includes('italic')?'italic ':''}${font.style.includes('bold')?'bold ':''}${size}px ${LAYOUT_FONTS[font.family]}`;
}
let metricCanvas = null;
let metricPdf = null;
const metricCache = new Map();
/** Use both screen glyph metrics and core-PDF advances for a shared conservative text box. */
function textMetrics(text,font) {
  if(!metricCanvas && typeof document!=='undefined') metricCanvas=document.createElement('canvas').getContext('2d');
  const Constructor=globalThis.window?.jspdf?.jsPDF;
  if(!metricPdf && typeof Constructor==='function') {metricPdf=new Constructor({unit:'in'});metricCache.clear();}
  const key=`${font.family}/${font.style}/${text}`;
  if(metricCache.has(key)) return metricCache.get(key);
  let advance=String(text).length*0.75,left=GLYPH_GUARD,right=GLYPH_GUARD,ascent=TEXT_ASCENT,descent=TEXT_HEIGHT-TEXT_ASCENT;
  if(metricCanvas) {
    metricCanvas.font=canvasFont(font,POINTS_PER_INCH);metricCanvas.textAlign='left';metricCanvas.textBaseline='alphabetic';
    const measured=metricCanvas.measureText(String(text));
    advance=measured.width/POINTS_PER_INCH;
    left=Math.max(left,(measured.actualBoundingBoxLeft||0)/POINTS_PER_INCH);
    right=Math.max(right,((measured.actualBoundingBoxRight||measured.width)-measured.width)/POINTS_PER_INCH);
    ascent=Math.max(ascent,(measured.actualBoundingBoxAscent||0)/POINTS_PER_INCH);
    descent=Math.max(descent,(measured.actualBoundingBoxDescent||0)/POINTS_PER_INCH);
  }
  if(metricPdf) {metricPdf.setFont(font.family,font.style);metricPdf.setFontSize(POINTS_PER_INCH);advance=Math.max(advance,metricPdf.getTextWidth(String(text)));}
  const result={advance,left,right,ascent,height:ascent+descent};
  if(metricCache.size>4096) metricCache.clear();
  metricCache.set(key,result);return result;
}
/** Keep labels inside the built-in PDF character set instead of silently exporting missing glyphs. */
function printableLabel(text) {
  return String(text).normalize('NFC').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...').replace(/[^\u0020-\u007e\u00a0-\u00ff]/g,'?');
}
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const WEEKDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
export const DEFAULT_END_SPREAD_COLOR = '#000000';
export const END_SPREADS = Object.freeze(['opening','closing']);
export const CALENDAR_SELECTIONS = Object.freeze(['cover','opening',...MONTHS.map((_,month)=>month),'closing']);
/** Normalize shared end-face ink; older saved calendars default to black. */
export const normalizeEndSpreadColor = value => color(value,DEFAULT_END_SPREAD_COLOR);
/** Keep the explicit selected month valid while navigating the cover and end spreads. */
export const calendarSelection = state => state.previewClosed ? 'cover' : END_SPREADS.includes(state.endSpread) ? state.endSpread : state.month;
/** Return the physical reader navigation position, independent of binding style. */
export const calendarSelections = (state = {}) => CALENDAR_SELECTIONS.filter(selection => selection !== 'opening' && selection !== 'closing' || state[selection === 'opening' ? 'includeOpeningSpread' : 'includeClosingSpread'] !== false);
export const calendarSelectionIndex = state => calendarSelections(state).indexOf(calendarSelection(state));
/** Describe a reader selection without treating end spreads as month indexes. */
export const calendarSelectionLabel = state => {const selection=calendarSelection(state);return selection==='cover'?'Cover':selection==='opening'?'Opening':selection==='closing'?'Closing':MONTHS[selection];};
export const ASSET_KEYS = [...MONTHS.map((_, index) => `month-${index}`), 'front-cover', 'back-cover'];
export const assetLabel = key => key.startsWith('month-') ? `${MONTHS[Number(key.slice(6))]} photo` : key === 'front-cover' ? 'Front cover outside' : 'Back cover outside';

/** Build one reader order for navigation, 3D, assembly and PDF export. */
export function calendarPagePlan(state = {}) {
  const pages = printPages(state);
  const saddle = state.bindingStyle === 'saddle';
  const paddingPages = saddle ? (4 - pages.length % 4) % 4 : 0;
  // Keep all month photo/grid pairs facing. Any required booklet padding stays
  // after December, before the optional closing spread and back exterior.
  const paddingIndex = pages.length - (state.includeClosingSpread !== false ? 3 : 1);
  pages.splice(paddingIndex, 0, ...Array.from({length:paddingPages}, () => ({kind:'solid',padding:true,label:'Required booklet padding · end-spread color'})));
  const logicalPages = pages.length;
  const physicalSheets = saddle ? logicalPages / 4 : logicalPages / 2;
  const imposition = saddle ? Array.from({length:physicalSheets}, (_, index) => ({
    front:[logicalPages-index*2,1+index*2],
    reverse:[2+index*2,logicalPages-1-index*2],rotations:[180,0]
  })) : [];
  return {pages,logicalPages,physicalSheets,coverSheets:saddle?1:2,
    interiorSheets:physicalSheets-(saddle?1:2),pdfPages:saddle?physicalSheets*2:logicalPages,
    leafCount:logicalPages/2,paddingPages,imposition};
}
// Default exports retained for consumers of the original all-spreads plan.
export const SADDLE_PAGE_COUNT = 32;
export const SADDLE_SHEET_COUNT = 8;
export const SADDLE_IMPOSITION = calendarPagePlan({bindingStyle:'saddle'}).imposition;

export function saddlePage(pageNumber, year, state = {}) {
  const page = calendarPagePlan({...state,bindingStyle:'saddle'}).pages[pageNumber-1];
  if (!Number.isInteger(pageNumber) || !page) throw new RangeError('Invalid saddle booklet page number.');
  return {...page,label:typeof page.month==='number' ? `${MONTHS[page.month]} ${year} · ${page.kind}` : page.label};
}

/** Saddle grids use the identical full reader-page geometry without a punched binding reserve. */
export const readerState = state => state.bindingStyle==='saddle' ? {...state,binding:0} : state;

/** Refuse an incomplete imposition or a photo/grid pair that does not face across the fold. */
export function validateSaddleImposition(year, state = {}) {
  const plan=calendarPagePlan({...state,bindingStyle:'saddle'});
  const numbers=plan.imposition.flatMap(sheet=>[...sheet.front,...sheet.reverse]);
  if(numbers.length!==plan.logicalPages || new Set(numbers).size!==plan.logicalPages || numbers.some(page=>!Number.isInteger(page)||page<1||page>plan.logicalPages)) throw new Error('Every reader page must occur exactly once in saddle imposition.');
  MONTHS.forEach((_,month)=>{
    const index=plan.pages.findIndex(page=>page.kind==='photo'&&page.month===month);
    const grid=plan.pages[index+1];
    if(index%2!==1 || grid?.kind!=='grid' || grid.month!==month) throw new Error('Each month requires an even photo above the following odd grid.');
  });
  if(plan.pages.filter(page=>page.kind==='photo').length!==14 || plan.pages.filter(page=>page.kind==='grid').length!==12) throw new Error('All cover artwork and twelve photo/grid pairs are required.');
  return true;
}


/** Return real calendar dates without the Date constructor's small-year shorthand. */
export function monthDates(year, month, week) {
  const firstDate = new Date(0); firstDate.setUTCFullYear(year, month, 1);
  const lastDate = new Date(0); lastDate.setUTCFullYear(year, month + 1, 0);
  return { first: (firstDate.getUTCDay() - week + 7) % 7, count: lastDate.getUTCDate() };
}

/** Shared printer-inch geometry; extra insets never replace safe or binding reserves. */
export function gridLayout(state) {
  const settings=normalizeLayout(state.layout),notices=[];
  const safeTop=Math.max(state.margin,readerState(state).binding),safeWidth=state.width-2*state.margin,safeHeight=state.height-safeTop-state.margin;
  const lineWidth=Math.min(settings.lineWidth/POINTS_PER_INCH,safeWidth/7*0.08,safeHeight/6*0.05);
  const extraX=Math.min(settings.insetX,safeWidth*0.3),extraTop=Math.min(settings.insetTop,safeHeight*0.2),extraBottom=Math.min(settings.insetBottom,safeHeight*0.2);
  const left=state.margin+extraX+lineWidth/2,top=safeTop+extraTop+lineWidth/2;
  const usable=safeWidth-2*extraX-lineWidth,available=safeHeight-extraTop-extraBottom-lineWidth;
  const requested=settings.headingHeight+settings.headingGap+settings.weekdayHeight+settings.weekdayGap;
  const scale=Math.min(1,available*0.55/requested);
  const heading=settings.headingHeight*scale,headingGap=settings.headingGap*scale,weekdayHeight=settings.weekdayHeight*scale,weekdayGap=settings.weekdayGap*scale;
  const start=top+heading+headingGap,gridTop=start+weekdayHeight+weekdayGap;
  const cellWidth=usable/7,rowHeight=(available-heading-headingGap-weekdayHeight-weekdayGap)/6;
  const edgeX=lineWidth/2+Math.min(1/POINTS_PER_INCH,cellWidth*0.025),edgeY=lineWidth/2+Math.min(1/POINTS_PER_INCH,rowHeight*0.025);
  const paddingX=Math.min(settings.paddingX,Math.max(0,cellWidth-2*edgeX)*0.22),paddingY=Math.min(settings.paddingY,Math.max(0,rowHeight-2*edgeY)*0.22);
  if(scale<0.999 || extraX<settings.insetX || extraTop<settings.insetTop || extraBottom<settings.insetBottom) notices.push('Heading, spacing or extra insets were fitted to preserve six date rows inside the print-safe area.');
  if(paddingX<settings.paddingX || paddingY<settings.paddingY) notices.push('Cell padding was reduced to leave room for text; a minimum clearance from grid lines is always retained.');
  if(lineWidth*POINTS_PER_INCH<settings.lineWidth-0.001) notices.push('Grid stroke width was reduced to fit this page.');
  return {settings,notices,left,top,usable,available,heading,start,weekdayHeight,gridTop,cellWidth,rowHeight,lineWidth,paddingX:paddingX+edgeX,paddingY:paddingY+edgeY};
}
/** Build renderer-neutral rectangles, grid lines and alphabetic-baseline text in printer inches. */
export function calendarLayout(state,month) {
  const g=gridLayout(state),s=g.settings,rects=[],lines=[],texts=[],notices=new Set(g.notices),fitted=new Set();
  const fitSize=(label,font,width,height)=>{
    const m=textMetrics(label,font),requested=font.size/POINTS_PER_INCH;
    const size=Math.max(0,Math.min(requested,width/(m.advance+m.left+m.right),height/m.height));
    if(size<requested*0.999) fitted.add(font.role);
    return size;
  };
  const addText=(label,font,box,size,vertical='top')=>{
    const m=textMetrics(label,font),boxWidth=(m.advance+m.left+m.right)*size,boxHeight=m.height*size;
    const x=box.x+(font.align==='right'?box.width-boxWidth:font.align==='center'?(box.width-boxWidth)/2:0)+m.left*size;
    const top=box.y+(vertical==='bottom'?box.height-boxHeight:vertical==='middle'?(box.height-boxHeight)/2:0);
    texts.push({text:String(label),x,y:top+m.ascent*size,size,font,color:font.color,role:font.role});
  };
  const fonts=Object.fromEntries(LAYOUT_ROLES.map(role=>[role,{...s.fonts[role],role}]));
  const titleBox={x:g.left,y:g.top,width:g.usable*0.68,height:g.heading},yearBox={x:g.left+g.usable*0.72,y:g.top,width:g.usable*0.28,height:g.heading};
  // Fit all month names, so flipping months does not change the title size.
  const titleSize=Math.min(...MONTHS.map(name=>fitSize(name,fonts.title,titleBox.width,titleBox.height)));
  addText(MONTHS[month],fonts.title,titleBox,titleSize,'middle');
  addText(state.year,fonts.year,yearBox,fitSize(String(state.year),fonts.year,yearBox.width,yearBox.height),'middle');
  const weekdayBoxWidth=g.cellWidth-2*g.paddingX;
  const weekdaySize=Math.min(...WEEKDAYS.map(name=>fitSize(name,fonts.weekday,weekdayBoxWidth,g.weekdayHeight)));
  const weekendFont=(font,weekday)=>({...font,color:s.weekendColors&&weekday===0?s.sundayColor:s.weekendColors&&weekday===6?s.saturdayColor:font.color});
  for(let column=0;column<7;column++) {
    const weekday=(column+state.week)%7;
    addText(WEEKDAYS[weekday],weekendFont(fonts.weekday,weekday),{x:g.left+column*g.cellWidth+g.paddingX,y:g.start,width:weekdayBoxWidth,height:g.weekdayHeight},weekdaySize,'middle');
  }
  rects.push({x:g.left,y:g.gridTop,width:g.usable,height:6*g.rowHeight,color:s.cellBackground});
  for(let row=0;row<=6;row++) lines.push({x1:g.left,y1:g.gridTop+row*g.rowHeight,x2:g.left+g.usable,y2:g.gridTop+row*g.rowHeight});
  for(let column=0;column<=7;column++) lines.push({x1:g.left+column*g.cellWidth,y1:g.gridTop,x2:g.left+column*g.cellWidth,y2:g.gridTop+6*g.rowHeight});
  const dates=monthDates(state.year,month,state.week),innerWidth=g.cellWidth-2*g.paddingX,innerHeight=g.rowHeight-2*g.paddingY;
  // Typography is shared by the whole calendar. Reserve holiday space in every
  // month when any enabled holiday exists, so short pages do not change date
  // sizes as the reader moves between months with and without holidays.
  const hasHolidays=state.holidays?.enabled && holidayList(state).length>0;
  const dayZone=hasHolidays?innerHeight*0.35:innerHeight;
  const daySize=Math.min(...Array.from({length:31},(_,index)=>fitSize(String(index+1),fonts.date,innerWidth,dayZone)));
  for(let day=1;day<=dates.count;day++) {
    const cell=dates.first+day-1,column=cell%7,x=g.left+column*g.cellWidth,y=g.gridTop+Math.floor(cell/7)*g.rowHeight;
    const holidays=holidaysForDate(state,month,day),weekday=(column+state.week)%7;
    const inner={x:x+g.paddingX,y:y+g.paddingY,width:innerWidth,height:innerHeight};
    if(holidays.length) rects.push({x:x+g.lineWidth/2,y:y+g.lineWidth/2,width:g.cellWidth-g.lineWidth,height:g.rowHeight-g.lineWidth,color:color(state.holidays?.color,'#f3dba5')});
    const dayHeight=textMetrics(String(day),fonts.date).height*daySize;
    if(!holidays.length) {addText(day,weekendFont(fonts.date,weekday),inner,daySize,s.dateVertical);continue;}
    const gap=Math.min(s.holidayGap,innerHeight*0.1),labelHeight=innerHeight-dayHeight-gap;
    if(gap<s.holidayGap) notices.add('Holiday spacing was reduced to keep date numbers and labels separate.');
    const source=holidays.map(item=>item.name).join(' · '),label=printableLabel(source);
    if(label!==source) notices.add('Some holiday punctuation or characters were substituted for the built-in PDF fonts. Stored holiday names are unchanged.');
    const foreground=s.holidayContrast?holidayTextColor(color(state.holidays?.color,'#f3dba5')):null;
    const holidayFont={...fonts.holiday,color:foreground??fonts.holiday.color};
    const holidayLineHeight=Math.max(HOLIDAY_LINE_HEIGHT,...Array.from(label,character=>textMetrics(character,holidayFont).height));
    let size=Math.min(holidayFont.size/POINTS_PER_INCH,labelHeight/(s.holidayLines*holidayLineHeight));
    const widestCharacter=Math.max(...Array.from(label,character=>{const m=textMetrics(character,holidayFont);return m.advance+m.left+m.right;}),1);
    size=Math.min(size,innerWidth/widestCharacter);
    const measure=value=>{const m=textMetrics(printableLabel(value),holidayFont);return (m.advance+m.left+m.right)*size;};
    const rawWrapped=wrapHolidayText(label,measure,innerWidth,s.holidayLines),wrapped=rawWrapped.map(printableLabel);
    // Three-dot ellipses may be wider than the wrapper's single glyph. Refit every final line.
    size=Math.min(size,...wrapped.map(line=>fitSize(line,{...holidayFont,size:size*POINTS_PER_INCH},innerWidth,labelHeight/s.holidayLines)));
    if(size<holidayFont.size/POINTS_PER_INCH*0.999) fitted.add('holiday');
    if(rawWrapped.some(line=>line.endsWith('…'))) notices.add('Long holiday labels are wrapped and shortened to the selected line limit; full names remain in the holiday list.');
    const labelBlockHeight=wrapped.length*size*holidayLineHeight,totalHeight=dayHeight+gap+labelBlockHeight;
    const blockTop=inner.y+(s.dateVertical==='bottom'?innerHeight-totalHeight:s.dateVertical==='middle'?(innerHeight-totalHeight)/2:0);
    const dayTop=s.dateVertical==='bottom'?blockTop+labelBlockHeight+gap:blockTop;
    const labelTop=s.dateVertical==='bottom'?blockTop:blockTop+dayHeight+gap;
    addText(day,{...weekendFont(fonts.date,weekday),color:foreground??weekendFont(fonts.date,weekday).color},{...inner,y:dayTop,height:dayHeight},daySize);
    wrapped.forEach((line,index)=>addText(line,holidayFont,{...inner,y:labelTop+index*size*holidayLineHeight,height:size*holidayLineHeight},size));
  }
  if(fitted.size) notices.add(`Automatically fitted font sizes: ${[...fitted].join(', ')}. Requested sizes are kept; enlarge the page or reduce spacing to make text larger.`);
  if(texts.some(item=>item.size*POINTS_PER_INCH<6)) notices.add('Some fitted text is below 6 pt and may be hard to read in print. Enlarge the page or reduce margins, padding or spacing.');
  return {geometry:g,settings:s,rects,lines,texts,notices:[...notices],fitted:[...fitted]};
}
/** Draw the identical shared layout used by the vector PDF and flat preview. */
export function drawCalendarGrid(context,state,month,width,height) {
  const plan=calendarLayout(state,month);
  context.save();context.scale(width/state.width,height/state.height);
  for(const rect of plan.rects) {context.fillStyle=rect.color;context.fillRect(rect.x,rect.y,rect.width,rect.height);}
  if(plan.geometry.lineWidth>0) {
    context.strokeStyle=plan.settings.lineColor;context.lineWidth=plan.geometry.lineWidth;context.beginPath();
    for(const line of plan.lines) {context.moveTo(line.x1,line.y1);context.lineTo(line.x2,line.y2);}context.stroke();
  }
  context.textBaseline='alphabetic';context.textAlign='left';
  for(const item of plan.texts) {context.font=canvasFont(item.font,item.size);context.fillStyle=item.color;context.fillText(item.text,item.x,item.y);}
  context.restore();return plan;
}

/** Physical assembly order, including both faces of each cover leaf. */
export function printPages(state = {}) {
  const pages = [{kind:'photo',key:'front-cover',label:'Front cover outside'}];
  if(state.includeOpeningSpread !== false) pages.push(
    {kind:'solid',endSpread:'opening',label:'Opening · front cover inside · end-spread color'},
    {kind:'solid',endSpread:'opening',label:'Opening · interior end face · end-spread color'});
  MONTHS.forEach((name, month) => pages.push({kind:'photo',key:`month-${month}`,month,label:`${name} photo`}, {kind:'grid',month,label:`${name} grid`}));
  if(state.includeClosingSpread !== false) pages.push(
    {kind:'solid',endSpread:'closing',label:'Closing · interior end face · end-spread color'},
    {kind:'solid',endSpread:'closing',label:'Closing · back cover inside · end-spread color'});
  pages.push({kind:'photo',key:'back-cover',label:'Back cover outside'});
  return pages;
}
