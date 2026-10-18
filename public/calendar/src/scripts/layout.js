import { roundedOutline, roundedSides, canvasOutline, canvasDecoration } from './grid-decoration.js';
import { FONT_CATALOG, CSS_FONT_FAMILIES } from './fonts.js';
import { holidaysForDate, holidayTextColor, wrapHolidayText } from './holidays.js';
const POINTS_PER_INCH = 72;
const TEXT_HEIGHT = 1.3;
const TEXT_ASCENT = 0.98;
const GLYPH_GUARD = 0.2;
const HOLIDAY_LINE_HEIGHT = 1.35;
const ALIGNMENTS = ['left','center','right'];
const FONT_STYLES = ['normal','bold','italic','bolditalic'];
export const LAYOUT_FONTS = CSS_FONT_FAMILIES;
export const LAYOUT_ROLES = Object.freeze(['title','year','weekday','date','holiday']);
// Artwork typography is shared by monthly captions and generated back-cover credits.
export const ARTWORK_FONT_ROLES = Object.freeze(['artist','artworkTitle','description']);
export const MINI_FONT_ROLES = Object.freeze(['miniMonth','miniWeekday','miniDate']);
const FONT_SETTING_ROLES = [...LAYOUT_ROLES,...ARTWORK_FONT_ROLES,...MINI_FONT_ROLES];
export const ARTWORK_METADATA_LIMITS = Object.freeze({artist:120,title:160,description:1000});
/** Validate independent monthly and front-cover credits, separate from photo references and crops. */
export function normalizeArtworkMetadata(value) {
  return Object.fromEntries(Array.from({length:13},(_,month)=>{
    const key=month===12?'front-cover':`month-${month}`,source=value?.[key];
    return [key,Object.fromEntries(Object.entries(ARTWORK_METADATA_LIMITS).map(([field,limit])=>[field,typeof source?.[field]==='string'?source[field].slice(0,limit):'']))];
  }));
}
export const FILLER_KEYS = Object.freeze(['opening-top','opening-bottom','closing-top','closing-bottom']);
export const fillerPrefix=key=>key.replace(/-(top|bottom)$/,(_,side)=>side[0].toUpperCase()+side.slice(1));
export const BACKGROUND_FIELDS=Object.freeze(['cellBackground','leadingBackground','trailingBackground','weekendBackground','leadingWeekendBackground','trailingWeekendBackground','weekdayBackground','monthHeaderBackground','yearHeaderBackground','layoutBackground','dateShapeColor','holidayBackground','endSpreadColor','artworkBackground',...FILLER_KEYS.map(key=>`${fillerPrefix(key)}Color`)]);
export const layoutFill=(settings,key)=>settings[`${key}Transparent`]?null:settings[key];
export function fillerAppearance(state,key) {
  const settings=normalizeLayout(state.layout),prefix=fillerPrefix(key);
  return {color:settings[`${prefix}Color`]??normalizeEndSpreadColor(state.endSpreadColor),transparent:settings[`${prefix}ColorTransparent`]||(settings[`${prefix}Color`]===null&&settings.endSpreadColorTransparent),image:settings[`${prefix}Image`]===true};
}
export const LAYOUT_LIMITS = Object.freeze({insetX:[0,2],insetTop:[0,2],insetBottom:[0,2],headingHeight:[0.1,4],headingGap:[0,1],weekdayHeight:[0.1,2],weekdayGap:[0,1],paddingX:[0,0.75],paddingY:[0,0.75],holidayGap:[0,0.5],lineWidth:[0,6],holidayLines:[1,4],miniCalendarSize:[4,18],dateShapeSize:[8,100],gridLineGap:[0,24],cellGap:[0,24],cellRadius:[0,36],gridRadius:[0,72],outerBorderWidth:[0,6],outerBorderGap:[0,24],weekdayBorderWidth:[0,6],weekdayRadius:[0,36],monthHeaderBorderWidth:[0,6],yearHeaderBorderWidth:[0,6],monthHeaderRadius:[0,72],yearHeaderRadius:[0,72],artworkPaddingX:[0,72],artworkPaddingY:[0,72],artworkBorderWidth:[0,6],artworkRadiusTL:[0,72],artworkRadiusTR:[0,72],artworkRadiusBL:[0,72],artworkRadiusBR:[0,72],artworkDetailsWidth:[0,48],artworkDetailsHeight:[0.25,3],headerGroupGap:[0,144],monthHeaderPaddingX:[0,144],monthHeaderPaddingY:[0,144],yearHeaderPaddingX:[0,144],yearHeaderPaddingY:[0,144],weekdayRadiusTL:[0,72],weekdayRadiusTR:[0,72],weekdayRadiusBL:[0,72],weekdayRadiusBR:[0,72],weekdaySeparatorWidth:[0,6],headerSeparatorWidth:[0,6],monthHeaderRadiusTL:[0,72],monthHeaderRadiusTR:[0,72],monthHeaderRadiusBL:[0,72],monthHeaderRadiusBR:[0,72],yearHeaderRadiusTL:[0,72],yearHeaderRadiusTR:[0,72],yearHeaderRadiusBL:[0,72],yearHeaderRadiusBR:[0,72]});
export const FONT_SIZE_LIMITS = Object.freeze([4,144]);
const FONT_DEFAULTS = {miniMonth:{family:'helvetica',size:6,style:'normal',align:'center',color:'#111111'},miniWeekday:{family:'helvetica',size:6,style:'normal',align:'center',color:'#111111'},miniDate:{family:'helvetica',size:6,style:'normal',align:'center',color:'#111111'},title:{family:'times',size:58,style:'normal',align:'left',color:'#111111'},year:{family:'helvetica',size:30,style:'normal',align:'right',color:'#111111'},weekday:{family:'helvetica',size:16,style:'bold',align:'center',color:'#111111'},date:{family:'helvetica',size:22,style:'normal',align:'left',color:'#111111'},holiday:{family:'helvetica',size:10,style:'normal',align:'left',color:'#111111'},artist:{family:'helvetica',size:12,style:'italic',align:'left',color:'#111111'},artworkTitle:{family:'times',size:14,style:'bold',align:'left',color:'#111111'},description:{family:'helvetica',size:10,style:'normal',align:'left',color:'#111111'}};
export const LAYOUT_DEFAULTS = Object.freeze({...Object.fromEntries(BACKGROUND_FIELDS.map(key=>[`${key}Transparent`,false])),version:1,artworkTextAlign:'inherit',artworkVertical:'top',artworkPaddingX:0,artworkPaddingY:0,artworkBackground:'#ffffff',artworkBackgroundTransparent:true,artworkBorderColor:'#aaaaaa',artworkBorderWidth:0,artworkRadiusTL:0,artworkRadiusTR:0,artworkRadiusBL:0,artworkRadiusBR:0,artworkPlacement:'none',artworkDetailsWidth:0,artworkContainerAlign:'left',artworkDetailsHeight:.75,artworkShowArtist:true,artworkShowTitle:true,artworkShowDescription:true,openingTopColor:null,openingTopImage:false,openingBottomColor:null,openingBottomImage:false,closingTopColor:null,closingTopImage:false,closingBottomColor:null,closingBottomImage:false,monthHeaderPaddingX:0,monthHeaderPaddingY:0,yearHeaderPaddingX:0,yearHeaderPaddingY:0,headerSeparatorMode:'inherit',headerSeparatorWidth:1,headerSeparatorColor:'#aaaaaa',monthHeaderRadiusMode:'each',monthHeaderRadiusTL:0,monthHeaderRadiusTR:0,monthHeaderRadiusBL:0,monthHeaderRadiusBR:0,yearHeaderRadiusMode:'each',yearHeaderRadiusTL:0,yearHeaderRadiusTR:0,yearHeaderRadiusBL:0,yearHeaderRadiusBR:0,weekdayRadiusMode:'each',weekdayRadiusTL:0,weekdayRadiusTR:0,weekdayRadiusBL:0,weekdayRadiusBR:0,weekdaySeparators:true,weekdaySeparatorWidth:0,weekdaySeparatorColor:'#aaaaaa',headerLayout:'split',headerGroupAlign:'left',headerGroupGap:12,holidayVertical:'flow',gridLineGap:0,gridOuterBoundary:true,cellFill:true,cellGap:0,cellRadius:0,gridRadius:0,gridRoundWeekdays:false,outerBorder:false,outerBorderWeekdays:false,outerBorderWidth:1,outerBorderGap:4,outerBorderColor:'#aaaaaa',weekdayFill:false,weekdayBackground:'#eeeeee',weekdayBorderWidth:0,weekdayBorderColor:'#aaaaaa',weekdayRadius:0,monthHeaderFill:false,monthHeaderBackground:'#eeeeee',monthHeaderBorderWidth:0,monthHeaderBorderColor:'#aaaaaa',monthHeaderRadius:0,yearHeaderFill:false,yearHeaderBackground:'#eeeeee',yearHeaderBorderWidth:0,yearHeaderBorderColor:'#aaaaaa',yearHeaderRadius:0,layoutBackground:'#ffffff',layoutBackgroundImage:false,dateShape:'none',dateShapeColor:'#eeeeee',dateShapeSize:36,miniCalendars:false,miniCalendarPlacement:'end',miniCalendarExtraRow:false,miniCalendarSize:6,miniMonthVertical:'middle',miniWeekdayVertical:'middle',miniDateVertical:'middle',insetX:0,insetTop:0,insetBottom:0,headingHeight:1.6,headingGap:0.12,weekdayHeight:0.45,weekdayGap:0.08,paddingX:0.08,paddingY:0.08,holidayGap:0.04,lineWidth:0.5,holidayLines:4,dateVertical:'top',lineColor:'#aaaaaa',cellBackground:'#ffffff',leadingMode:'blank',leadingBackground:'#ffffff',leadingColor:'#999999',trailingMode:'blank',trailingBackground:'#ffffff',trailingColor:'#999999',sundayColor:'#a23e3e',saturdayColor:'#435b82',weekendColors:false,weekendStyle:false,weekendBackground:'#eeeeee',weekendColor:FONT_DEFAULTS.date.color,leadingWeekendStyle:false,leadingWeekendBackground:'#ffffff',leadingWeekendColor:'#999999',trailingWeekendStyle:false,trailingWeekendBackground:'#ffffff',trailingWeekendColor:'#999999',holidayContrast:true,fonts:Object.freeze(Object.fromEntries(FONT_SETTING_ROLES.map(role=>[role,Object.freeze(FONT_DEFAULTS[role])])))});
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const color = (value,fallback) => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
/** Normalize old or untrusted saved layout data into independent global settings. */
export function normalizeLayout(value) {
  const result={...LAYOUT_DEFAULTS,fonts:{}};
  for(const [key,[min,max]] of Object.entries(LAYOUT_LIMITS)) result[key]=typeof value?.[key]==='number' && Number.isFinite(value[key]) ? clamp(value[key],min,max) : LAYOUT_DEFAULTS[key];
  for(const key of ['gridOuterBoundary','cellFill']) result[key]=value?.[key]!==false;
  for(const key of ['gridRoundWeekdays','outerBorder','outerBorderWeekdays','weekdayFill','monthHeaderFill','yearHeaderFill','layoutBackgroundImage']) result[key]=value?.[key]===true;
  for(const key of ['outerBorderColor','weekdayBackground','weekdayBorderColor','monthHeaderBackground','monthHeaderBorderColor','yearHeaderBackground','yearHeaderBorderColor','layoutBackground']) result[key]=color(value?.[key],LAYOUT_DEFAULTS[key]);
  for(const key of BACKGROUND_FIELDS)result[`${key}Transparent`]=typeof value?.[`${key}Transparent`]==='boolean'?value[`${key}Transparent`]:LAYOUT_DEFAULTS[`${key}Transparent`];
  result.artworkTextAlign=['inherit',...ALIGNMENTS].includes(value?.artworkTextAlign)?value.artworkTextAlign:'inherit';
  result.artworkVertical=['top','middle','bottom'].includes(value?.artworkVertical)?value.artworkVertical:'top';
  result.artworkContainerAlign=ALIGNMENTS.includes(value?.artworkContainerAlign)?value.artworkContainerAlign:LAYOUT_DEFAULTS.artworkContainerAlign;
  result.artworkBackground=color(value?.artworkBackground,LAYOUT_DEFAULTS.artworkBackground);
  result.artworkBorderColor=color(value?.artworkBorderColor,LAYOUT_DEFAULTS.artworkBorderColor);
  result.artworkPlacement=['none','header','month','year','footer'].includes(value?.artworkPlacement)?value.artworkPlacement:'none';
  for(const key of ['artworkShowArtist','artworkShowTitle','artworkShowDescription']) result[key]=value?.[key]!==false;
  for(const key of FILLER_KEYS) {
    const prefix=fillerPrefix(key);
    result[`${prefix}Color`]=color(value?.[`${prefix}Color`],null);
    result[`${prefix}Image`]=value?.[`${prefix}Image`]===true;
  }
  result.headerSeparatorMode=['inherit','custom','none'].includes(value?.headerSeparatorMode)?value.headerSeparatorMode:'inherit';
  result.headerSeparatorColor=color(value?.headerSeparatorColor,LAYOUT_DEFAULTS.headerSeparatorColor);
  for(const prefix of ['monthHeader','yearHeader']) {
    result[`${prefix}RadiusMode`]=value?.[`${prefix}RadiusMode`]==='outer'?'outer':'each';
    for(const corner of ['TL','TR','BL','BR']) {
      const key=`${prefix}Radius${corner}`;
      if(!Number.isFinite(value?.[key]))result[key]=result[`${prefix}Radius`];
    }
  }
  result.weekdayRadiusMode=value?.weekdayRadiusMode==='outer'?'outer':'each';
  result.weekdaySeparators=value?.weekdaySeparators!==false;
  for(const corner of ['TL','TR','BL','BR']) {
    const key=`weekdayRadius${corner}`;
    if(!Number.isFinite(value?.[key])) result[key]=result.weekdayRadius;
  }
  if(!Number.isFinite(value?.weekdaySeparatorWidth)) result.weekdaySeparatorWidth=result.weekdayBorderWidth;
  result.weekdaySeparatorColor=color(value?.weekdaySeparatorColor,result.weekdayBorderColor);
  result.dateShape=['none','circle','diamond','star','oval','square','squircle'].includes(value?.dateShape)?value.dateShape:'none';
  result.dateShapeColor=color(value?.dateShapeColor,LAYOUT_DEFAULTS.dateShapeColor);
  result.miniCalendars=value?.miniCalendars===true;
  result.miniCalendarExtraRow=value?.miniCalendarExtraRow===true;
  result.miniCalendarPlacement=value?.miniCalendarPlacement==='beginning'?'beginning':'end';
  result.holidayLines=Math.round(result.holidayLines);
  result.headerLayout=value?.headerLayout==='grouped'?'grouped':'split';
  result.headerGroupAlign=ALIGNMENTS.includes(value?.headerGroupAlign)?value.headerGroupAlign:'left';
  result.holidayVertical=['flow','top','bottom'].includes(value?.holidayVertical)?value.holidayVertical:'flow';
  result.dateVertical=['top','middle','bottom'].includes(value?.dateVertical)?value.dateVertical:LAYOUT_DEFAULTS.dateVertical;
  result.weekendColors=value?.weekendColors===true;
  result.holidayContrast=value?.holidayContrast!==false;
  for(const key of ['lineColor','cellBackground','sundayColor','saturdayColor']) result[key]=color(value?.[key],LAYOUT_DEFAULTS[key]);
  for(const side of ['leading','trailing']) {
    result[`${side}Mode`]=['hidden','blank','dates'].includes(value?.[`${side}Mode`])?value[`${side}Mode`]:'blank';
    result[`${side}Background`]=color(value?.[`${side}Background`],result.cellBackground);
    result[`${side}Color`]=color(value?.[`${side}Color`],LAYOUT_DEFAULTS[`${side}Color`]);
  }
  for(const role of FONT_SETTING_ROLES) {
    const mini=MINI_FONT_ROLES.includes(role);
    if(mini) result[`${role}Vertical`]=['top','middle','bottom'].includes(value?.[`${role}Vertical`])?value[`${role}Vertical`]:'middle';
    const source=value?.fonts?.[role]??(mini?{...value?.fonts?.date,size:result.miniCalendarSize,align:'center'}:undefined),fallback=FONT_DEFAULTS[role];
    result.fonts[role]={family:Object.hasOwn(LAYOUT_FONTS,source?.family)?source.family:fallback.family,size:typeof source?.size==='number'&&Number.isFinite(source.size)?clamp(source.size,...FONT_SIZE_LIMITS):fallback.size,style:FONT_CATALOG[source?.family] ? (Object.hasOwn(FONT_CATALOG[source.family].files,source?.style)?source.style:'normal') : FONT_STYLES.includes(source?.style)?source.style:fallback.style,align:ALIGNMENTS.includes(source?.align)?source.align:fallback.align,color:color(source?.color,fallback.color)};
  }
  for(const prefix of ['weekend','leadingWeekend','trailingWeekend']) {
    const side=prefix==='weekend'?null:prefix.replace('Weekend','');
    result[`${prefix}Style`]=value?.[`${prefix}Style`]===true;
    result[`${prefix}Background`]=color(value?.[`${prefix}Background`],side?result[`${side}Background`]:LAYOUT_DEFAULTS.weekendBackground);
    result[`${prefix}Color`]=color(value?.[`${prefix}Color`],side?result[`${side}Color`]:result.fonts.date.color);
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
export const ASSET_KEYS = [...MONTHS.map((_, index) => `month-${index}`), 'front-cover', 'back-cover', 'layout-background','back-cover-background',...FILLER_KEYS];
export const assetLabel = key => /^back-object-[a-zA-Z0-9_-]{1,64}$/.test(key)?`Back-cover custom image (${key.slice('back-object-'.length)})`:FILLER_KEYS.includes(key)?key.replace('-',' · '):key==='back-cover-background'?'Back-cover background':key==='layout-background'?'Calendar layout background':key.startsWith('month-') ? `${MONTHS[Number(key.slice(6))]} photo` : key === 'front-cover' ? 'Front cover outside' : 'Back cover outside';

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
  if(plan.pages.filter(page=>page.kind==='photo'&&!page.fillerKey).length!==14 || plan.pages.filter(page=>page.kind==='grid').length!==12) throw new Error('All cover artwork and twelve photo/grid pairs are required.');
  return true;
}


/** Return real calendar dates without the Date constructor's small-year shorthand. */
export function monthDates(year, month, week) {
  const firstDate = new Date(0); firstDate.setUTCFullYear(year, month, 1);
  const lastDate = new Date(0); lastDate.setUTCFullYear(year, month + 1, 0);
  return { first: (firstDate.getUTCDay() - week + 7) % 7, count: lastDate.getUTCDate() };
}

/** Reserve two empty cells without covering current-month dates. */
export function miniCalendarPlacement(state,month=state.month??0) {
  const settings=normalizeLayout(state.layout),dates=monthDates(state.year,month,state.week);
  if(!settings.miniCalendars) return {rows:6,cells:[]};
  const dateRows=Math.ceil((dates.first+dates.count)/7);
  const atBeginning=settings.miniCalendarPlacement==='beginning'&&dates.first>=2;
  const rows=Math.max(dateRows+(settings.miniCalendarExtraRow?1:0),atBeginning?dateRows:Math.ceil((dates.first+dates.count+2)/7));
  return {rows,cells:atBeginning?[0,1]:[rows*7-2,rows*7-1]};
}

/** Shared printer-inch geometry; extra insets never replace safe or binding reserves. */
export function gridLayout(state,month=state.month??0) {
  const {rows}=miniCalendarPlacement(state,month);
  const settings=normalizeLayout(state.layout),notices=[];
  const artworkFooter=settings.artworkPlacement==='footer'?Math.min(settings.artworkDetailsHeight,(state.height-state.margin-Math.max(state.margin,readerState(state).binding))*.3):0;
  if(settings.artworkPlacement==='footer'&&artworkFooter<settings.artworkDetailsHeight)notices.push('Artwork footer height was limited to retain space for the calendar grid.');
  const artworkHeader=['header','month','year'].includes(settings.artworkPlacement)?settings.artworkDetailsHeight:0;
  const safeTop=Math.max(state.margin,readerState(state).binding),safeWidth=state.width-2*state.margin,safeHeight=state.height-safeTop-state.margin-artworkFooter;
  const lineWidth=Math.min(settings.lineWidth/POINTS_PER_INCH,safeWidth/7*0.08,safeHeight/6*0.05);
  const extraX=Math.min(settings.insetX,safeWidth*0.3),extraTop=Math.min(settings.insetTop,safeHeight*0.2),extraBottom=Math.min(settings.insetBottom,safeHeight*0.2);
  const left=state.margin+extraX+lineWidth/2,top=safeTop+extraTop+lineWidth/2;
  const usable=safeWidth-2*extraX-lineWidth,available=safeHeight-extraTop-extraBottom-lineWidth;
  const paddedHeading=Math.max(settings.headingHeight,...[['monthHeader','title',MONTHS[month]],['yearHeader','year',String(state.year)]].map(([prefix,role,label])=>settings[`${prefix}PaddingY`]>0?textMetrics(label,settings.fonts[role]).height*settings.fonts[role].size/POINTS_PER_INCH+2*settings[`${prefix}PaddingY`]/POINTS_PER_INCH:0));
  const requested=paddedHeading+artworkHeader+settings.headingGap+settings.weekdayHeight+settings.weekdayGap;
  const scale=Math.min(1,available*0.55/requested);
  const heading=(paddedHeading+artworkHeader)*scale,headingGap=settings.headingGap*scale,weekdayHeight=settings.weekdayHeight*scale,weekdayGap=settings.weekdayGap*scale;
  const start=top+heading+headingGap,gridTop=start+weekdayHeight+weekdayGap;
  const cellWidth=usable/7,rowHeight=(available-heading-headingGap-weekdayHeight-weekdayGap)/rows;
  const edgeX=lineWidth/2+Math.min(1/POINTS_PER_INCH,cellWidth*0.025),edgeY=lineWidth/2+Math.min(1/POINTS_PER_INCH,rowHeight*0.025);
  const paddingX=Math.min(settings.paddingX,Math.max(0,cellWidth-2*edgeX)*0.22),paddingY=Math.min(settings.paddingY,Math.max(0,rowHeight-2*edgeY)*0.22);
  if(scale<0.999 || extraX<settings.insetX || extraTop<settings.insetTop || extraBottom<settings.insetBottom) notices.push('Heading, spacing or extra insets were fitted to preserve date rows inside the print-safe area.');
  if(paddingX<settings.paddingX || paddingY<settings.paddingY) notices.push('Cell padding was reduced to leave room for text; a minimum clearance from grid lines is always retained.');
  if(lineWidth*POINTS_PER_INCH<settings.lineWidth-0.001) notices.push('Grid stroke width was reduced to fit this page.');
  const effectiveCellGap=Math.min(settings.cellGap/POINTS_PER_INCH,Math.min(cellWidth,rowHeight)*.5);
  return {settings,notices,artworkHeader:artworkHeader*scale,artworkFooter,rows,left,top,usable,available,heading,start,weekdayHeight,gridTop,cellWidth,rowHeight,lineWidth,paddingX:Math.max(paddingX+edgeX,effectiveCellGap/2+edgeX),paddingY:Math.max(paddingY+edgeY,effectiveCellGap/2+edgeY)};
}
/** Closed shape outlines shared by Canvas and vector PDF, in printer inches. */
export function dateShapePoints(shape,cx,cy,size) {
  const radius=size/2;
  if(shape==='square') return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[cx+x*radius,cy+y*radius]);
  if(shape==='diamond') return [[0,-1],[1,0],[0,1],[-1,0]].map(([x,y])=>[cx+x*radius,cy+y*radius]);
  const count=shape==='star'?10:64;
  return Array.from({length:count},(_,i)=>{
    const angle=-Math.PI/2+i*2*Math.PI/count,r=shape==='star'&&i%2?radius*.48:radius;
    let x=Math.cos(angle),y=Math.sin(angle);
    if(shape==='squircle') {x=Math.sign(x)*Math.sqrt(Math.abs(x));y=Math.sign(y)*Math.sqrt(Math.abs(y));}
    return [cx+x*r*(shape==='oval'?1.4:1),cy+y*r];
  });
}

/** Build renderer-neutral rectangles, grid lines and alphabetic-baseline text in printer inches. */
export function calendarLayout(state,month) {
  const g=gridLayout(state,month),s=g.settings,rects=[],lines=[],texts=[],shapes=[],decorations=[],notices=new Set(g.notices);
  const addText=(label,font,box,size,vertical='top')=>{
    const m=textMetrics(label,font),textWidth=(m.advance+m.left+m.right)*size,textHeight=m.height*size;
    const badge=font.role==='date'&&s.dateShape!=='none'&&!s.dateShapeColorTransparent?s.dateShapeSize/POINTS_PER_INCH:0;
    const boxWidth=Math.max(textWidth,badge*(s.dateShape==='oval'?1.4:1)),boxHeight=Math.max(textHeight,badge);
    if(boxWidth>box.width+0.001 || boxHeight>box.height+0.001) notices.add('Configured text exceeds its available space. Increase page size or adjust typography and spacing.');
    const x=box.x+(font.align==='right'?box.width-boxWidth:font.align==='center'?(box.width-boxWidth)/2:0)+m.left*size+(boxWidth-textWidth)/2;
    const top=box.y+(vertical==='bottom'?box.height-boxHeight:vertical==='middle'?(box.height-boxHeight)/2:0)+(boxHeight-textHeight)/2;
    texts.push({text:String(label),x,y:top+m.ascent*size,size,font,color:font.color,role:font.role});
    if(font.role==='date' && s.dateShape!=='none'&&!s.dateShapeColorTransparent) {
      const diameter=s.dateShapeSize/POINTS_PER_INCH,cx=x-m.left*size+textWidth/2,cy=top+textHeight/2;
      shapes.push({color:s.dateShapeColor,points:dateShapePoints(s.dateShape,cx,cy,diameter)});
      if(diameter<textHeight || diameter*(s.dateShape==='oval'?1.4:1)<textWidth) notices.add('Date-number shape is smaller than its text. Increase shape size or reduce date typography.');
    }
  };
  const gridBottom=g.gridTop+g.rows*g.rowHeight;
  const clipTop=s.gridRoundWeekdays?g.start:g.gridTop;
  const gridClip=s.gridRadius>0?roundedOutline(g.left,clipTop,g.usable,gridBottom-clipTop,s.gridRadius/POINTS_PER_INCH):null;
  const separated=s.cellGap>0||s.cellRadius>0;
  const cellGap=Math.min(s.cellGap/POINTS_PER_INCH,Math.min(g.cellWidth,g.rowHeight)*.5);
  const cellBox=(x,y)=>({x:x+cellGap/2,y:y+cellGap/2,width:g.cellWidth-cellGap,height:g.rowHeight-cellGap});
  const decorate=(box,fill,stroke,width,radius,clip=false)=>decorations.push({points:roundedOutline(box.x,box.y,box.width,box.height,radius),fill,stroke,width,clip});
  const fonts=Object.fromEntries([...LAYOUT_ROLES,...MINI_FONT_ROLES].map(role=>[role,{...s.fonts[role],role}]));
  let titleBox={x:g.left,y:g.top,width:g.usable*0.68,height:g.heading-g.artworkHeader},yearBox={x:g.left+g.usable*0.72,y:g.top,width:g.usable*0.28,height:g.heading-g.artworkHeader};
  if(s.headerLayout==='grouped') {
    const width=(label,font)=>{const m=textMetrics(String(label),font);return (m.advance+m.left+m.right)*font.size/POINTS_PER_INCH;};
    const monthWidth=width(MONTHS[month],fonts.title)+2*s.monthHeaderPaddingX/POINTS_PER_INCH,yearWidth=width(state.year,fonts.year)+2*s.yearHeaderPaddingX/POINTS_PER_INCH,gap=s.headerGroupGap/POINTS_PER_INCH;
    const groupWidth=monthWidth+gap+yearWidth;
    const x=g.left+(s.headerGroupAlign==='right'?g.usable-groupWidth:s.headerGroupAlign==='center'?(g.usable-groupWidth)/2:0);
    titleBox={x,y:g.top,width:monthWidth,height:g.heading-g.artworkHeader};
    yearBox={x:x+monthWidth+gap,y:g.top,width:yearWidth,height:g.heading-g.artworkHeader};
    if(groupWidth>g.usable) notices.add('Month and year group exceeds its available width. Reduce spacing or typography.');
  }
  const headerStrokes=[];
  for(const [prefix,box] of [['monthHeader',titleBox],['yearHeader',yearBox]]) {
    const radius=Object.fromEntries(['tl','tr','bl','br'].map(corner=>[corner,(s[`${prefix}RadiusMode`]==='each'||(prefix==='monthHeader'?corner.endsWith('l'):corner.endsWith('r')))?s[`${prefix}Radius${corner.toUpperCase()}`]/POINTS_PER_INCH:0]));
    if(s[`${prefix}Fill`])decorate(box,layoutFill(s,`${prefix}Background`),null,0,radius);
    const sides=roundedSides(box.x,box.y,box.width,box.height,radius);
    for(const [side,points] of Object.entries(sides)) {
      const facing=prefix==='monthHeader'?side==='right':side==='left';
      const custom=facing&&s.headerSeparatorMode==='custom';
      const width=facing&&s.headerSeparatorMode==='none'?0:custom?s.headerSeparatorWidth:s[`${prefix}BorderWidth`];
      if(width>0)headerStrokes.push({points,closed:false,fill:null,stroke:custom?s.headerSeparatorColor:s[`${prefix}BorderColor`],width:width/POINTS_PER_INCH});
    }
  }
  decorations.push(...headerStrokes);
  const paddedBox=(box,prefix)=>{
    const px=s[`${prefix}PaddingX`]/POINTS_PER_INCH,py=s[`${prefix}PaddingY`]/POINTS_PER_INCH;
    return {x:box.x+px,y:box.y+py,width:Math.max(0,box.width-2*px),height:Math.max(0,box.height-2*py)};
  };
  addText(MONTHS[month],fonts.title,paddedBox(titleBox,'monthHeader'),fonts.title.size/POINTS_PER_INCH,'middle');
  addText(state.year,fonts.year,paddedBox(yearBox,'yearHeader'),fonts.year.size/POINTS_PER_INCH,'middle');
  const metadata=normalizeArtworkMetadata(state.artworkMetadata)[`month-${month}`];
  if(s.artworkPlacement!=='none') {
    const selected=s.artworkPlacement==='month'?titleBox:s.artworkPlacement==='year'?yearBox:null;
    const box=s.artworkPlacement==='footer'?{x:g.left,y:gridBottom+.05,width:g.usable,height:Math.max(0,g.artworkFooter-.05)}:{x:selected?.x??g.left,y:g.top+g.heading-g.artworkHeader,width:selected?.width??g.usable,height:g.artworkHeader};
    const availableWidth=box.width;
    if(s.artworkDetailsWidth>0) {
      box.width=Math.min(s.artworkDetailsWidth,availableWidth);
      if(s.artworkDetailsWidth>availableWidth)notices.add('Artwork container width was limited to fit its placement.');
    }
    const containerOffset={left:0,center:.5,right:1}[s.artworkContainerAlign];
    box.x+=(availableWidth-box.width)*containerOffset;
    const radius=Object.fromEntries(['tl','tr','bl','br'].map(corner=>[corner,s[`artworkRadius${corner.toUpperCase()}`]/POINTS_PER_INCH]));
    decorate(box,layoutFill(s,'artworkBackground'),s.artworkBorderColor,s.artworkBorderWidth/POINTS_PER_INCH,radius);
    const px=s.artworkPaddingX/POINTS_PER_INCH+s.artworkBorderWidth/POINTS_PER_INCH/2,py=s.artworkPaddingY/POINTS_PER_INCH+s.artworkBorderWidth/POINTS_PER_INCH/2;
    const inner={x:box.x+px,y:box.y+py,width:Math.max(0,box.width-2*px),height:Math.max(0,box.height-2*py)};
    const rows=[];let used=0;
    for(const [field,role,enabled] of [['title','artworkTitle',s.artworkShowTitle],['artist','artist',s.artworkShowArtist],['description','description',s.artworkShowDescription]]) {
      if(!enabled||!metadata[field])continue;
      const font={...s.fonts[role],role,...(s.artworkTextAlign==='inherit'?{}:{align:s.artworkTextAlign})},size=font.size/POINTS_PER_INCH,lineHeight=size*1.35;
      const maxLines=Math.floor((inner.height-used+.000001)/lineHeight);
      if(maxLines<1||inner.width<=0){notices.add('Artwork details exceed their available area. Increase the details height or reduce padding.');break;}
      const measure=text=>{const m=textMetrics(text,font);return (m.advance+m.left+m.right)*size;};
      const lines=wrapHolidayText(printableLabel(metadata[field]),measure,inner.width,maxLines);
      if(lines.some(line=>line.endsWith('…')))notices.add('Artwork details were shortened to fit their container. Increase the details height or reduce padding.');
      for(const line of lines){rows.push({line,font,size,lineHeight});used+=lineHeight;}
    }
    let y=inner.y+Math.max(0,inner.height-used)*(s.artworkVertical==='bottom'?1:s.artworkVertical==='middle'?.5:0);
    for(const row of rows){addText(row.line,row.font,{x:inner.x,y,width:inner.width,height:row.lineHeight},row.size);y+=row.lineHeight;}

  }
  const weekdayBoxWidth=g.cellWidth-2*g.paddingX;
  const weekdaySize=fonts.weekday.size/POINTS_PER_INCH;
  const weekendFont=(font,weekday)=>({...font,color:s.weekendColors&&weekday===0?s.sundayColor:s.weekendColors&&weekday===6?s.saturdayColor:font.color});
  const weekendPrefix=(weekday,side=null)=>((weekday===0||weekday===6)&&s[`${side?`${side}Weekend`:'weekend'}Style`])?(side?`${side}Weekend`:'weekend'):null;
  const cellBackground=(weekday,side=null)=>layoutFill(s,weekendPrefix(weekday,side)?`${weekendPrefix(weekday,side)}Background`:side?`${side}Background`:'cellBackground');
  const dateCellFont=(weekday)=>({...weekendFont(fonts.date,weekday),...(weekendPrefix(weekday)?{color:s.weekendColor}:{})});
  const weekdayStrokes=[];
  for(let column=0;column<7;column++) {
    const weekday=(column+state.week)%7;
    const radius=Object.fromEntries(['tl','tr','bl','br'].map(corner=>[corner,(s.weekdayRadiusMode==='each'||(corner.endsWith('l')?column===0:column===6))?s[`weekdayRadius${corner.toUpperCase()}`]/POINTS_PER_INCH:0]));
    const box={x:g.left+column*g.cellWidth,y:g.start,width:g.cellWidth,height:g.weekdayHeight};
    if(s.weekdayFill) decorate(box,layoutFill(s,'weekdayBackground'),null,0,radius,s.gridRoundWeekdays);
    const sides=roundedSides(box.x,box.y,box.width,box.height,radius);
    for(const [side,points] of Object.entries(sides)) {
      const internal=(side==='left'&&column>0)||(side==='right'&&column<6);
      const width=internal?(s.weekdaySeparators?s.weekdaySeparatorWidth:0):s.weekdayBorderWidth;
      if(width>0) weekdayStrokes.push({points,closed:false,fill:null,stroke:internal?s.weekdaySeparatorColor:s.weekdayBorderColor,width:width/POINTS_PER_INCH,clip:s.gridRoundWeekdays});
    }
    addText(WEEKDAYS[weekday],weekendFont(fonts.weekday,weekday),{x:g.left+column*g.cellWidth+g.paddingX,y:g.start,width:weekdayBoxWidth,height:g.weekdayHeight},weekdaySize,'middle');
  }
  decorations.push(...weekdayStrokes);
  const dates=monthDates(state.year,month,state.week),innerWidth=g.cellWidth-2*g.paddingX,innerHeight=g.rowHeight-2*g.paddingY;
  const miniCells=miniCalendarPlacement(state,month).cells;
  const edges=new Map();
  for(let cell=0;cell<g.rows*7;cell++) {
    const side=cell<dates.first?'leading':cell>=dates.first+dates.count?'trailing':null;
    if(miniCells.includes(cell) || (side && s[`${side}Mode`]==='hidden')) continue;
    const column=cell%7,row=Math.floor(cell/7),x=g.left+column*g.cellWidth,y=g.gridTop+row*g.rowHeight;
    const background=s.cellFill?cellBackground((column+state.week)%7,side):null;
    if(separated) decorate(cellBox(x,y),background,s.lineColor,g.lineWidth,s.cellRadius/POINTS_PER_INCH,true);
    else if(background) rects.push({x,y,width:g.cellWidth,height:g.rowHeight,color:background,clip:true});
    for(const [c1,r1,c2,r2] of [[column,row,column+1,row],[column,row+1,column+1,row+1],[column,row,column,row+1],[column+1,row,column+1,row+1]]) {
      const key=`${c1},${r1},${c2},${r2}`,existing=edges.get(key);
      edges.set(key,{count:(existing?.count??0)+1,x1:g.left+c1*g.cellWidth,y1:g.gridTop+r1*g.rowHeight,x2:g.left+c2*g.cellWidth,y2:g.gridTop+r2*g.rowHeight});
    }
    if(side && s[`${side}Mode`]==='dates') {
      const adjacent=new Date(state.year,month,cell-dates.first+1);
      addText(adjacent.getDate(),{...fonts.date,color:s[`${weekendPrefix((column+state.week)%7,side)??side}Color`]}, {x:x+g.paddingX,y:y+g.paddingY,width:innerWidth,height:innerHeight},fonts.date.size/POINTS_PER_INCH,s.dateVertical);
    }
  }
  miniCells.forEach((cell,index)=>{
    const adjacent=new Date(0);adjacent.setUTCFullYear(state.year,month+(index===0?-1:1),1);
    const year=adjacent.getUTCFullYear(),miniMonth=adjacent.getUTCMonth(),miniDates=monthDates(year,miniMonth,state.week);
    const x=g.left+(cell%7)*g.cellWidth+g.paddingX,y=g.gridTop+Math.floor(cell/7)*g.rowHeight+g.paddingY;
    const monthFont=fonts.miniMonth,weekdayFont=fonts.miniWeekday,dateFont=fonts.miniDate;
    const slotWidth=innerWidth/7,slotHeight=innerHeight/8;
    addText(`${MONTHS[miniMonth]} ${year}`,monthFont,{x,y,width:innerWidth,height:slotHeight},monthFont.size/POINTS_PER_INCH,s.miniMonthVertical);
    for(let col=0;col<7;col++) addText(WEEKDAYS[(col+state.week)%7].slice(0,1),weekdayFont,{x:x+col*slotWidth,y:y+slotHeight,width:slotWidth,height:slotHeight},weekdayFont.size/POINTS_PER_INCH,s.miniWeekdayVertical);
    for(let day=1;day<=miniDates.count;day++) {
      const slot=miniDates.first+day-1;
      addText(day,dateFont,{x:x+(slot%7)*slotWidth,y:y+(2+Math.floor(slot/7))*slotHeight,width:slotWidth,height:slotHeight},dateFont.size/POINTS_PER_INCH,s.miniDateVertical);
    }
  });
  if(!separated) for(const edge of edges.values()) {
    if(!s.gridOuterBoundary&&edge.count===1) continue;
    const length=Math.hypot(edge.x2-edge.x1,edge.y2-edge.y1),gap=Math.min(s.gridLineGap/POINTS_PER_INCH,length*.45);
    const dx=(edge.x2-edge.x1)/length*gap,dy=(edge.y2-edge.y1)/length*gap;
    lines.push({...edge,x1:edge.x1+dx,y1:edge.y1+dy,x2:edge.x2-dx,y2:edge.y2-dy});
  }
  if(gridClip&&!separated&&s.gridOuterBoundary&&s.gridLineGap===0) decorations.push({points:gridClip,fill:null,stroke:s.lineColor,width:g.lineWidth,clip:false});
  if(s.outerBorder) {
    const top=s.outerBorderWeekdays?g.start:g.gridTop;
    const requested=s.outerBorderGap/POINTS_PER_INCH+s.outerBorderWidth/POINTS_PER_INCH/2;
    const gap=Math.max(0,Math.min(requested,g.left,g.top,state.width-g.left-g.usable,state.height-gridBottom)-s.outerBorderWidth/POINTS_PER_INCH/2);
    decorate({x:g.left-gap,y:top-gap,width:g.usable+2*gap,height:gridBottom-top+2*gap},null,s.outerBorderColor,s.outerBorderWidth/POINTS_PER_INCH,s.gridRadius/POINTS_PER_INCH+gap);
  }
  const daySize=fonts.date.size/POINTS_PER_INCH;
  for(let day=1;day<=dates.count;day++) {
    const cell=dates.first+day-1,column=cell%7,x=g.left+column*g.cellWidth,y=g.gridTop+Math.floor(cell/7)*g.rowHeight;
    const holidays=holidaysForDate(state,month,day),weekday=(column+state.week)%7;
    const inner={x:x+g.paddingX,y:y+g.paddingY,width:innerWidth,height:innerHeight};
    if(holidays.length&&!s.holidayBackgroundTransparent) {
      if(separated) decorate(cellBox(x,y),color(state.holidays?.color,'#f3dba5'),s.lineColor,g.lineWidth,s.cellRadius/POINTS_PER_INCH,true);
      else rects.push({x:x+g.lineWidth/2,y:y+g.lineWidth/2,width:g.cellWidth-g.lineWidth,height:g.rowHeight-g.lineWidth,color:color(state.holidays?.color,'#f3dba5'),clip:true});
    }
    const dayHeight=Math.max(textMetrics(String(day),fonts.date).height*daySize,s.dateShape==='none'||s.dateShapeColorTransparent?0:s.dateShapeSize/POINTS_PER_INCH);
    if(!holidays.length) {addText(day,dateCellFont(weekday),inner,daySize,s.dateVertical);continue;}
    const gap=Math.min(s.holidayGap,innerHeight*0.1);
    if(gap<s.holidayGap) notices.add('Holiday spacing was reduced to keep date numbers and labels separate.');
    const source=holidays.map(item=>item.name).join(' · '),label=printableLabel(source);
    if(label!==source) notices.add('Some holiday punctuation or characters were substituted for the built-in PDF fonts. Stored holiday names are unchanged.');
    const contrastBackground=!s.holidayBackgroundTransparent?color(state.holidays?.color,'#f3dba5'):s.cellFill&&cellBackground(weekday)?cellBackground(weekday):!s.layoutBackgroundImage?layoutFill(s,'layoutBackground'):null;
    const foreground=s.holidayContrast&&contrastBackground?holidayTextColor(contrastBackground):null;
    const holidayFont={...fonts.holiday,color:foreground??fonts.holiday.color};
    const holidayLineHeight=Math.max(HOLIDAY_LINE_HEIGHT,...Array.from(label,character=>textMetrics(character,holidayFont).height));
    const size=holidayFont.size/POINTS_PER_INCH;
    const measure=value=>{const m=textMetrics(printableLabel(value),holidayFont);return (m.advance+m.left+m.right)*size;};
    const rawWrapped=wrapHolidayText(label,measure,innerWidth,s.holidayLines),wrapped=rawWrapped.map(printableLabel);
    if(rawWrapped.some(line=>line.endsWith('…'))) notices.add('Long holiday labels are wrapped and shortened to the selected line limit; full names remain in the holiday list.');
    const labelBlockHeight=wrapped.length*size*holidayLineHeight,totalHeight=dayHeight+gap+labelBlockHeight;
    if(totalHeight>innerHeight+0.001) notices.add('Configured text exceeds its available space. Increase page size or adjust typography and spacing.');
    let labelTop;
    const dateFont={...dateCellFont(weekday),color:s.holidayContrast&&s.dateShape!=='none'&&!s.dateShapeColorTransparent?holidayTextColor(s.dateShapeColor):foreground??dateCellFont(weekday).color};
    if(s.holidayVertical==='flow') {
      const blockTop=inner.y+(s.dateVertical==='bottom'?innerHeight-totalHeight:s.dateVertical==='middle'?(innerHeight-totalHeight)/2:0);
      const dayTop=s.dateVertical==='bottom'?blockTop+labelBlockHeight+gap:blockTop;
      labelTop=s.dateVertical==='bottom'?blockTop:blockTop+dayHeight+gap;
      addText(day,dateFont,{...inner,y:dayTop,height:dayHeight},daySize);
    } else {
      labelTop=s.holidayVertical==='bottom'?inner.y+innerHeight-labelBlockHeight:inner.y;
      const dateTop=s.holidayVertical==='top'?inner.y+labelBlockHeight+gap:inner.y;
      addText(day,dateFont,{...inner,y:dateTop,height:Math.max(0,innerHeight-labelBlockHeight-gap)},daySize,s.dateVertical);
    }
    wrapped.forEach((line,index)=>addText(line,holidayFont,{...inner,y:labelTop+index*size*holidayLineHeight,height:size*holidayLineHeight},size));
  }
  return {geometry:g,settings:s,rects,lines,texts,shapes,decorations,gridClip,notices:[...notices],fitted:[]};
}
/** Draw the identical shared layout used by the vector PDF and flat preview. */
export function drawCalendarGrid(context,state,month,width,height,paintBackground=null) {
  const plan=calendarLayout(state,month);
  context.save();context.scale(width/state.width,height/state.height);
  if(!plan.settings.layoutBackgroundTransparent){context.fillStyle=plan.settings.layoutBackground;context.fillRect(0,0,state.width,state.height);}
  if(plan.settings.layoutBackgroundImage&&paintBackground) paintBackground(context);
  for(const rect of plan.rects) {context.save();if(rect.clip&&plan.gridClip){canvasOutline(context,plan.gridClip);context.clip();}context.fillStyle=rect.color;context.fillRect(rect.x,rect.y,rect.width,rect.height);context.restore();}
  if(plan.geometry.lineWidth>0) {
    context.save();if(plan.gridClip){canvasOutline(context,plan.gridClip);context.clip();}
    context.strokeStyle=plan.settings.lineColor;context.lineWidth=plan.geometry.lineWidth;context.beginPath();
    for(const line of plan.lines) {context.moveTo(line.x1,line.y1);context.lineTo(line.x2,line.y2);}context.stroke();context.restore();
  }
  for(const item of plan.decorations) canvasDecoration(context,item,plan.gridClip);
  for(const shape of plan.shapes) {
    context.fillStyle=shape.color;context.beginPath();
    shape.points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));
    context.closePath();context.fill();
  }
  context.textBaseline='alphabetic';context.textAlign='left';
  for(const item of plan.texts) {context.font=canvasFont(item.font,item.size);context.fillStyle=item.color;context.fillText(item.text,item.x,item.y);}
  context.restore();return plan;
}

export function fillerPage(state,key) {
  const appearance=fillerAppearance(state,key);
  return {kind:appearance.image?'photo':'solid',...(appearance.image?{key}:{}),fillerKey:key,endSpread:key.split('-')[0],color:appearance.color,transparent:appearance.transparent,label:assetLabel(key)};
}
/** Physical assembly order, including both faces of each cover leaf. */
export function printPages(state = {}) {
  const pages = [{kind:'photo',key:'front-cover',label:'Front cover outside'}];
  if(state.includeOpeningSpread !== false) pages.push(
    fillerPage(state,'opening-top'),fillerPage(state,'opening-bottom'));
  MONTHS.forEach((name, month) => pages.push({kind:'photo',key:`month-${month}`,month,label:`${name} photo`}, {kind:'grid',month,label:`${name} grid`}));
  if(state.includeClosingSpread !== false) pages.push(
    fillerPage(state,'closing-top'),fillerPage(state,'closing-bottom'));
  pages.push({kind:'photo',key:'back-cover',label:'Back cover outside'});
  return pages;
}
