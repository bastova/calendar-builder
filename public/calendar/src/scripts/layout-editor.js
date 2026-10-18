import { drawFillerPage } from './filler-pages.js';
import { commitNumericOnBlur } from './numeric-input.js';
import { paintLayoutBackground } from './layout-background.js';
import { readPreference, writePreference } from './browser-storage.js';
import { MONTHS, BACKGROUND_FIELDS, FILLER_KEYS, fillerPrefix, fillerAppearance, MINI_FONT_ROLES, LAYOUT_FONTS, LAYOUT_ROLES, ARTWORK_FONT_ROLES, LAYOUT_LIMITS, FONT_SIZE_LIMITS, normalizeLayout, drawCalendarGrid, readerState, DEFAULT_END_SPREAD_COLOR, normalizeEndSpreadColor, calendarSelection, calendarSelectionLabel } from './layout.js';
import { normalizeHolidays } from './holidays.js';

const PREVIEW_LONG_EDGE = 1400;
const PREVIEW_MAX_PIXELS = 1400 * 1400;
import { FONT_LABELS, FONT_CATALOG } from './fonts.js';
const ROLE_LABELS = {miniMonth:'Miniature month headings',miniWeekday:'Miniature weekdays',miniDate:'Miniature dates',title:'Month title',year:'Year',weekday:'Weekday headings',date:'Date numbers',holiday:'Holiday names',artist:'Artist name',artworkTitle:'Artwork title',description:'Artwork description'};
const STYLE_OPTIONS = [['normal','Regular'],['bold','Bold'],['italic','Italic'],['bolditalic','Bold italic']];
const ALIGN_OPTIONS = [['left','Left'],['center','Center'],['right','Right']];
const GRID_FIELDS = [['cellBackground','Date-cell background','color'],['lineColor','Grid line color','color'],['lineWidth','Grid stroke width · pt','number']];
const SPACING_FIELDS = [['insetX','Extra left/right inset · in'],['insetTop','Extra top inset · in'],['insetBottom','Extra bottom inset · in'],['headingHeight','Heading area height · in'],['headingGap','Heading → weekday gap · in'],['weekdayHeight','Weekday area height · in'],['weekdayGap','Weekday → grid gap · in'],['paddingX','Cell horizontal padding · in'],['paddingY','Cell vertical padding · in'],['holidayGap','Date → holiday gap · in'],['holidayLines','Maximum holiday lines']];
const byId = id => document.getElementById(id);

/** Build accessible non-drag layout controls and a current-month trim-page preview. */
export function createLayoutEditor(getState,onLayoutChange,onTabChange,onHolidayChange,onEndSpreadColorChange) {
  const controls=[],canvas=byId('layout-preview'),context=canvas.getContext('2d');
  const savedZoom=readPreference('layout-zoom',1);
  let zoom=Number.isFinite(savedZoom)?Math.max(1,Math.min(4,savedZoom)):1;
  const viewport=byId('layout-zoom-viewport'),zoomValue=byId('layout-zoom-value');
  function applyZoom() {
    const available=Math.max(1,viewport.clientWidth-20),height=Math.max(1,viewport.clientHeight-20);
    const fit=Math.min(available/canvas.width,height/canvas.height);
    canvas.style.width=`${Math.round(canvas.width*fit*zoom)}px`;
    canvas.style.height=`${Math.round(canvas.height*fit*zoom)}px`;
    zoomValue.textContent=`${Math.round(zoom*100)}%`;
    byId('layout-zoom-out').disabled=zoom<=1;byId('layout-zoom-in').disabled=zoom>=4;
  }
  byId('layout-zoom-in').addEventListener('click',()=>{zoom=Math.min(4,zoom+.5);writePreference('layout-zoom',zoom);applyZoom();});
  byId('layout-zoom-out').addEventListener('click',()=>{zoom=Math.max(1,zoom-.5);writePreference('layout-zoom',zoom);applyZoom();});
  byId('layout-zoom-fit').addEventListener('click',()=>{zoom=1;writePreference('layout-zoom',zoom);applyZoom();viewport.scrollTo(0,0);});
  new ResizeObserver(applyZoom).observe(viewport);
  const tabNames=['images','layout','back-cover'];
  const tabs=[byId('image-picker-tab'),byId('layout-modifier-tab'),byId('back-cover-tab')];
  let fieldNotice='',lastPlan=null;
  function createControl(parent,labelText,path,type='number',options=null) {
    const label=document.createElement('label'),control=document.createElement(options?'select':'input');
    control.id=`layout-${path.join('-')}`;control.dataset.layoutControl='';label.htmlFor=control.id;label.append(document.createTextNode(({ 'Font size · pt':'Size · pt','Grid stroke width · pt':'Stroke · pt','Extra left/right inset · in':'Side inset · in','Extra top inset · in':'Top inset · in','Extra bottom inset · in':'Bottom inset · in','Heading area height · in':'Heading · in','Heading → weekday gap · in':'Heading gap · in','Weekday area height · in':'Weekdays · in','Weekday → grid gap · in':'Grid gap · in','Cell horizontal padding · in':'Cell X · in','Cell vertical padding · in':'Cell Y · in','Date → holiday gap · in':'Holiday gap · in','Maximum holiday lines':'Holiday lines','Date block vertical alignment':'Date position' })[labelText]||labelText));
    if(options) for(const [value,text] of options) {const option=document.createElement('option');option.value=value;option.textContent=text;if(path[2]==='family')option.style.fontFamily=LAYOUT_FONTS[value];control.append(option);}
    else {
      control.type=type;
      if(type==='number') {
        const bounds=path[0]==='fonts'?FONT_SIZE_LIMITS:LAYOUT_LIMITS[path[0]];
        control.min=bounds[0];control.max=bounds[1];control.step=path[0]==='holidayLines'||path[0]==='fonts'?'1':path[0]==='lineWidth'?'0.1':'0.01';
      }
      if(type==='checkbox') label.className='toggle';
    }
    label.dataset.field=path.at(-1);control.title=labelText;
    label.append(control);parent.append(label);controls.push({control,path});
    if(options && ['style','align','dateVertical'].includes(path.at(-1))) {
      label.classList.add('segmented-field');control.hidden=true;
      const buttons=document.createElement('div');buttons.className='layout-segments';buttons.setAttribute('role','group');buttons.setAttribute('aria-label',labelText);
      for(const [value,text] of options) {
        const button=document.createElement('button');button.type='button';button.dataset.value=value;button.title=text;button.setAttribute('aria-label',text);
        if(path.at(-1)==='style') button.className=`font-style-icon font-style-${value}`;
        button.textContent=path.at(-1)==='style'?({normal:'R',bold:'B',italic:'I',bolditalic:'BI'}[value]):path.at(-1)==='align'?({left:'≡←',center:'≡',right:'→≡'}[value]):text;
        button.addEventListener('click',()=>{control.value=value;control.dispatchEvent(new Event('change'));});buttons.append(button);
      }
      label.append(buttons);
    }
    control.addEventListener(type==='checkbox'||options?'change':'input',()=>{
      const current=normalizeLayout(getState().layout);
      let value=type==='checkbox'?control.checked:type==='number'?control.valueAsNumber:control.value;
      if(type==='number') {
        if(!Number.isFinite(value)) {fieldNotice=`${labelText}: enter a number. The last valid value is still applied; export remains available.`;renderNotices();return;}
        const [min,max]=path[0]==='fonts'?FONT_SIZE_LIMITS:LAYOUT_LIMITS[path[0]];
        // Preserve incomplete drafts (for example 3 on the way to 31) while focused.
        if(value<min||value>max) {fieldNotice='';return;}
        if(path[0]==='holidayLines') value=Math.round(value);
        fieldNotice='';
      } else fieldNotice='';
      if(path[0]==='fonts') current.fonts[path[1]][path[2]]=value;
      else current[path[0]]=value;
      onLayoutChange(normalizeLayout(current));
    });
    if(type==='number') commitNumericOnBlur(control,...(path[0]==='fonts'?FONT_SIZE_LIMITS:LAYOUT_LIMITS[path[0]]),()=>{
      const settings=normalizeLayout(getState().layout);
      return path[0]==='fonts'?settings.fonts[path[1]][path[2]]:settings[path[0]];
    });
    if(type==='color'&&path.length===1&&BACKGROUND_FIELDS.includes(path[0]))createControl(parent,`Transparent ${labelText.toLowerCase()}`,[`${path[0]}Transparent`],'checkbox');
  }
  const miniTypography=document.createElement('div');
  for(const role of [...LAYOUT_ROLES,...ARTWORK_FONT_ROLES,...MINI_FONT_ROLES]) {
    const group=document.createElement('fieldset'),legend=document.createElement('legend'),fields=document.createElement('div');
    group.className='layout-font-group';legend.textContent=ROLE_LABELS[role];fields.className='layout-field-grid';group.append(legend,fields);(MINI_FONT_ROLES.includes(role)?miniTypography:byId(`layout-${ARTWORK_FONT_ROLES.includes(role)?'artwork':['title','year'].includes(role)?'heading':role==='weekday'?'weekday':'cell'}-controls`)).append(group);
    createControl(fields,'Font family',['fonts',role,'family'],'select',Object.keys(LAYOUT_FONTS).map(key=>[key,FONT_LABELS[key]]));
    createControl(fields,'Font size · pt',['fonts',role,'size']);
    createControl(fields,'Font style',['fonts',role,'style'],'select',STYLE_OPTIONS);
    createControl(fields,'Text color',['fonts',role,'color'],'color');
    createControl(fields,'Horizontal alignment',['fonts',role,'align'],'select',ALIGN_OPTIONS);
    if(MINI_FONT_ROLES.includes(role)) createControl(fields,'Vertical alignment',[`${role}Vertical`],'select',[['top','Top'],['middle','Middle'],['bottom','Bottom']]);
    if(role==='holiday') {
      createControl(fields,'Vertical placement',['holidayVertical'],'select',[['flow','With date number'],['top','Top of cell'],['bottom','Bottom of cell']]);
      createControl(fields,'Auto-contrast holiday text',['holidayContrast'],'checkbox');
    }
  }
  const gridFields=byId('layout-grid-controls');
  createControl(gridFields,GRID_FIELDS[0][1],[GRID_FIELDS[0][0]],GRID_FIELDS[0][2]);
  const holidayLabel=document.createElement('label'),holidayColor=document.createElement('input');
  holidayColor.id='layout-holiday-highlight-color';holidayColor.type='color';holidayColor.dataset.layoutControl='';
  holidayLabel.htmlFor=holidayColor.id;holidayLabel.append(document.createTextNode('Holiday highlight background'),holidayColor);gridFields.append(holidayLabel);
  createControl(gridFields,'Transparent holiday highlight',['holidayBackgroundTransparent'],'checkbox');
  holidayColor.addEventListener('input',()=>onHolidayChange(normalizeHolidays({...getState().holidays,color:holidayColor.value})));
  for(const [key,label,type] of GRID_FIELDS.slice(1)) createControl(gridFields,label,[key],type);
  for(const [side,title] of [['trailing','Trailing cells · next month'],['leading','Leading cells · previous month']]) {
    const group=document.createElement('fieldset'),legend=document.createElement('legend'),fields=document.createElement('div');
    group.className='layout-adjacent-group';legend.textContent=title;fields.className='layout-field-grid';group.append(legend,fields);byId('layout-adjacent-controls').prepend(group);
    createControl(fields,'Display',[`${side}Mode`],'select',[['hidden','Hide cells'],['blank','Blank cells'],['dates','Adjacent-month dates']]);
    createControl(fields,'Background',[`${side}Background`],'color');
    createControl(fields,'Date color',[`${side}Color`],'color');
  }
  const shapeGroup=document.createElement('fieldset'),shapeLegend=document.createElement('legend'),shapeFields=document.createElement('div');
  shapeGroup.className='layout-adjacent-group';shapeLegend.textContent='Date-number shapes';shapeFields.className='layout-field-grid';shapeGroup.append(shapeLegend,shapeFields);byId('layout-cell-controls').append(shapeGroup);
  createControl(shapeFields,'Shape',['dateShape'],'select',[['none','None'],['circle','Circle'],['diamond','Diamond'],['star','Star'],['oval','Oval'],['square','Square'],['squircle','Squircle']]);
  createControl(shapeFields,'Fill color',['dateShapeColor'],'color');
  createControl(shapeFields,'Size · pt',['dateShapeSize']);
  const miniGroup=document.createElement('fieldset'),miniLegend=document.createElement('legend'),miniFields=document.createElement('div');
  miniGroup.className='layout-adjacent-group';miniLegend.textContent='Placement';miniFields.className='layout-field-grid';miniGroup.append(miniLegend,miniFields);byId('layout-mini-controls').append(miniGroup);
  createControl(miniFields,'Previous & next month',['miniCalendars'],'checkbox');
  createControl(miniFields,'Placement',['miniCalendarPlacement'],'select',[['beginning','Beginning (auto fallback)'],['end','Bottom right']]);
  createControl(miniFields,'Retain extra bottom row',['miniCalendarExtraRow'],'checkbox');
  byId('layout-mini-controls').append(miniTypography);
  for(const [key,label] of SPACING_FIELDS) {
    const section=key.startsWith('inset')?'page':key.startsWith('heading')?'heading':key.startsWith('weekday')?'weekday':'spacing';
    let fields=byId(`layout-${section}-controls`);
    if(section!=='spacing') {
      let spacing=fields.querySelector(':scope > .layout-element-spacing');
      if(!spacing) {spacing=document.createElement('div');spacing.className='layout-field-grid layout-element-spacing';fields.append(spacing);}
      fields=spacing;
    }
    createControl(fields,label,[key]);
  }
  createControl(byId('layout-spacing-controls'),'Date block vertical alignment',['dateVertical'],'select',[['top','Top'],['middle','Middle'],['bottom','Bottom']]);
  function styleFields(section,title,fields) {
    const group=document.createElement('fieldset'),legend=document.createElement('legend'),body=document.createElement('div');
    group.className='layout-adjacent-group';legend.textContent=title;body.className='layout-field-grid';group.append(legend,body);byId(`layout-${section}-controls`).append(group);
    for(const [key,label,type='number',options=null] of fields) createControl(body,label,[key],type,options);
    return body;
  }
  styleFields('heading','Month & year arrangement',[
    ['headerLayout','Layout','select',[['split','Separate containers'],['grouped','Month & year together']]],
    ['headerGroupAlign','Group alignment','select',ALIGN_OPTIONS],['headerGroupGap','Month → year spacing · pt']
  ]);
  styleFields('cell','Grid & cell appearance',[
    ['cellFill','Fill date cells','checkbox'],['gridLineGap','Line-end gap · pt'],['gridOuterBoundary','Show outer grid boundary','checkbox'],
    ['cellGap','Space between cells · pt'],['cellRadius','Individual cell radius · pt'],['gridRadius','Outer corner radius · pt'],['gridRoundWeekdays','Include weekdays in rounding','checkbox']
  ]);
  styleFields('cell','Additional outer border',[
    ['outerBorder','Show second border','checkbox'],['outerBorderWeekdays','Include weekday headings','checkbox'],['outerBorderColor','Border color','color'],['outerBorderWidth','Border width · pt'],['outerBorderGap','Border offset · pt']
  ]);
  styleFields('weekday','Container',[
    ['weekdayFill','Fill weekday cells','checkbox'],['weekdayBackground','Background','color'],['weekdayBorderColor','Border color','color'],['weekdayBorderWidth','Border width · pt']
  ]);
  styleFields('weekday','Corner rounding',[
    ['weekdayRadiusMode','Apply corners to','select',[['each','Every weekday cell'],['outer','Outer ends of row only']]],
    ['weekdayRadiusTL','Top-left radius · pt'],['weekdayRadiusTR','Top-right radius · pt'],
    ['weekdayRadiusBL','Bottom-left radius · pt'],['weekdayRadiusBR','Bottom-right radius · pt']
  ]);
  styleFields('weekday','Borders between weekdays',[
    ['weekdaySeparators','Show internal borders','checkbox'],['weekdaySeparatorColor','Border color','color'],['weekdaySeparatorWidth','Border width · pt']
  ]);
  for(const [prefix,title] of [['monthHeader','Month container'],['yearHeader','Year container']]) styleFields('heading',title,[
    [`${prefix}PaddingX`,'Horizontal padding · pt'],[`${prefix}PaddingY`,'Vertical padding · pt'],
    [`${prefix}Fill`,'Fill container','checkbox'],[`${prefix}Background`,'Background','color'],[`${prefix}BorderColor`,'Border color','color'],[`${prefix}BorderWidth`,'Border width · pt'],[`${prefix}RadiusMode`,'Apply corners to','select',[['each','All container corners'],['outer','Outer ends of header only']]],
    [ `${prefix}RadiusTL`,'Top-left radius · pt'],[`${prefix}RadiusTR`,'Top-right radius · pt'],[`${prefix}RadiusBL`,'Bottom-left radius · pt'],[`${prefix}RadiusBR`,'Bottom-right radius · pt']
  ]);
  styleFields('heading','Borders between month & year',[
    ['headerSeparatorMode','Facing borders','select',[['inherit','Use container borders'],['custom','Custom internal borders'],['none','No internal borders']]],
    ['headerSeparatorColor','Border color','color'],['headerSeparatorWidth','Border width · pt']
  ]);
  styleFields('artwork','Monthly artwork details',[
    ['artworkPlacement','Show details','select',[['none','Back cover only'],['header','Below month & year'],['month','Below month title'],['year','Below year'],['footer','Bottom of calendar page']]],
    ['artworkShowArtist','Artist name','checkbox'],['artworkShowTitle','Artwork title','checkbox'],['artworkShowDescription','Description','checkbox']
  ]);
  styleFields('artwork','Monthly details alignment & container',[
    ['artworkDetailsWidth','Container width · in (0 = automatic)'],['artworkDetailsHeight','Container height · in'],
    ['artworkContainerAlign','Container alignment','select',ALIGN_OPTIONS],
    ['artworkTextAlign','Horizontal alignment','select',[['inherit','Use individual text alignment'],...ALIGN_OPTIONS]],
    ['artworkVertical','Vertical alignment','select',[['top','Top'],['middle','Middle'],['bottom','Bottom']]],
    ['artworkPaddingX','Horizontal padding · pt'],['artworkPaddingY','Vertical padding · pt'],
    ['artworkBackground','Background','color'],['artworkBorderColor','Border color','color'],['artworkBorderWidth','Border width · pt'],
    ['artworkRadiusTL','Top-left radius · pt'],['artworkRadiusTR','Top-right radius · pt'],['artworkRadiusBL','Bottom-left radius · pt'],['artworkRadiusBR','Bottom-right radius · pt']
  ]);
  for(const key of FILLER_KEYS) {
    const prefix=fillerPrefix(key),fields=styleFields('spreads',key.replace('-',' · '),[[`${prefix}Color`,'Background','color'],[`${prefix}Image`,'Use custom image','checkbox']]);
    const button=document.createElement('button');button.type='button';button.className='layout-image-picker';button.textContent='Choose / frame image';
    button.addEventListener('click',()=>{onTabChange('images');const target=byId('photo-target');target.value=key;target.dispatchEvent(new Event('change'));});fields.append(button);
  }
  const backgroundFields=styleFields('background','Full layout background',[
    ['layoutBackground','Background color','color'],['layoutBackgroundImage','Use background image','checkbox']
  ]);
  const chooseBackground=document.createElement('button');chooseBackground.type='button';chooseBackground.className='layout-image-picker';chooseBackground.textContent='Choose / frame background image';
  chooseBackground.addEventListener('click',()=>{onTabChange('images');const target=byId('photo-target');target.value='layout-background';target.dispatchEvent(new Event('change'));});backgroundFields.append(chooseBackground);
  const backgroundHelp=document.createElement('p');backgroundHelp.className='layout-help';backgroundHelp.textContent='Assigning an image enables it automatically. Opaque cell and header fills cover it; turn those fills off where you want the image to show.';backgroundFields.append(backgroundHelp);
  createControl(byId('end-spread-color').parentElement.parentElement,'Transparent fallback / booklet padding',['endSpreadColorTransparent'],'checkbox');
  // Give generated and static fields the same label/control structure.
  for(const label of byId('layout-controls').querySelectorAll('label')) {
    const textNodes=[...label.childNodes].filter(node=>node.nodeType===3&&node.textContent.trim());
    if(!textNodes.length)continue;
    const caption=document.createElement('span');caption.className='layout-control-label';
    caption.textContent=textNodes.map(node=>node.textContent.trim()).join(' ');
    textNodes.forEach(node=>node.remove());label.prepend(caption);
    if(label.dataset.field==='family')caption.textContent='Font';
    if(label.dataset.field==='size')caption.textContent='Size · pt';
    if(label.dataset.field==='style')caption.textContent='Style';
    if(label.dataset.field==='align')caption.textContent='Align';
    if(label.dataset.field==='color')caption.textContent='Color';
  }
  const endSpreadColor=byId('end-spread-color');
  endSpreadColor.addEventListener('input',()=>onEndSpreadColorChange(normalizeEndSpreadColor(endSpreadColor.value)));
  byId('reset-layout').addEventListener('click',()=>{fieldNotice='Layout and end-spread color reset. Photos, crops, holidays and document settings were kept.';onLayoutChange(normalizeLayout(),DEFAULT_END_SPREAD_COLOR);});
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>onTabChange(tabNames[index]));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[target].focus();onTabChange(tabNames[target]);
    });
  });
  function renderNotices() {
    return;
  }
  /** Refresh tab semantics and the selected month without changing the print-view mode. */
  function render() {
    const state=getState(),settings=normalizeLayout(state.layout),selected=Math.max(0,tabNames.indexOf(state.editorTab));
    tabs.forEach((tab,index)=>{tab.setAttribute('aria-selected',String(index===selected));tab.tabIndex=index===selected?0:-1;});
    byId('image-picker-panel').hidden=selected!==0;byId('layout-modifier-panel').hidden=selected!==1;byId('back-cover-panel').hidden=selected!==2;
    for(const {control,path} of controls) {
      if(control===document.activeElement && control.type==='number') continue;
      let value=path[0]==='fonts'?settings.fonts[path[1]][path[2]]:settings[path[0]];
      if(value===null&&control.type==='color')value=normalizeEndSpreadColor(state.endSpreadColor);
      if(control.type==='checkbox') control.checked=value;else control.value=value;
      if(control.type==='color'&&path.length===1&&BACKGROUND_FIELDS.includes(path[0]))control.disabled=settings[`${path[0]}Transparent`];
      if(['headerSeparatorColor','headerSeparatorWidth'].includes(path[0]))control.disabled=settings.headerSeparatorMode!=='custom';
      if(['weekdaySeparatorColor','weekdaySeparatorWidth'].includes(path[0])) control.disabled=!settings.weekdaySeparators;
      if(['headerGroupAlign','headerGroupGap'].includes(path[0])) control.disabled=settings.headerLayout!=='grouped';
      if(['dateShapeColor','dateShapeSize'].includes(path[0])) control.disabled=settings.dateShape==='none'||(path[0]==='dateShapeColor'&&settings.dateShapeColorTransparent);
      if(path[0].startsWith('miniCalendar')&&path[0]!=='miniCalendars') control.disabled=!settings.miniCalendars;
      const side=['leading','trailing'].find(side=>path[0].startsWith(side));
      if(side && path[0]!==`${side}Mode`) control.disabled=(path[0]===`${side}Background`&&settings[`${side}BackgroundTransparent`])||settings[`${side}Mode`]==='hidden'||(path[0]===`${side}Color`&&settings[`${side}Mode`]!=='dates');
      if(path[0]==='fonts'&&path[2]==='style'){
        const family=FONT_CATALOG[settings.fonts[path[1]].family];
        for(const option of control.options)option.disabled=Boolean(family&&!Object.hasOwn(family.files,option.value));
      }
    }
    for(const {control} of controls) if(control.hidden) for(const button of control.parentElement.querySelectorAll('button')) {
      button.setAttribute('aria-pressed',String(button.dataset.value===control.value));
      button.disabled=Boolean([...control.options].find(option=>option.value===button.dataset.value)?.disabled);
    }
    holidayColor.value=normalizeHolidays(state.holidays).color;holidayColor.disabled=settings.holidayBackgroundTransparent;
    endSpreadColor.value=normalizeEndSpreadColor(state.endSpreadColor);endSpreadColor.disabled=settings.endSpreadColorTransparent;
    const endSelected=!state.previewClosed&&['opening','closing'].includes(state.endSpread),title=endSelected?`${calendarSelectionLabel(state)} · filler spread`:`${MONTHS[state.month]} ${state.year}`;
    byId('layout-preview-title').textContent=`${title}${state.previewClosed?' · selected month (cover shown in 3D)':''}`;
    byId('layout-preview-title').nextElementSibling.textContent=endSelected?'FLAT / FULL SPREAD':'FLAT / TRIM PAGE';
    canvas.setAttribute('aria-label',endSelected?`${title}. Top and bottom pages use their own image or background color.`:`${title}, flat calendar. ${state.week===1?'Monday':'Sunday'} first. Global layout applies to all twelve months.`);
    byId('layout-preview-caption').textContent=endSelected?'Top and bottom pages have independent images and colors. Required booklet padding uses the shared fallback color. Colors are RGB, not a print proof.':'Colors are RGB, not a print proof.';
    const previewHeight=state.height*(endSelected?2:1),scale=Math.min(PREVIEW_LONG_EDGE/Math.max(state.width,previewHeight),Math.sqrt(PREVIEW_MAX_PIXELS/(state.width*previewHeight)));
    canvas.width=Math.max(1,Math.round(state.width*scale));canvas.height=Math.max(1,Math.round(previewHeight*scale));
    lastPlan=null;
    if(context) {context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);if(endSelected) {
      for(const [index,side] of ['top','bottom'].entries()){context.save();context.translate(0,index*canvas.height/2);drawFillerPage(context,state,`${state.endSpread}-${side}`,canvas.width,canvas.height/2);context.restore();}
    }
    if(!endSelected)lastPlan=drawCalendarGrid(context,readerState(state),state.month,canvas.width,canvas.height,ctx=>paintLayoutBackground(ctx,readerState(state)));}
    else fieldNotice='Flat preview requires a browser Canvas 2D context. Layout controls and vector PDF export remain available.';
    applyZoom();renderNotices();
  }
  /** Expose effective fitted sizes alongside the persisted requested layout settings. */
  function summary() {
    return {selection:calendarSelection(getState()),endSpreadColor:normalizeEndSpreadColor(getState().endSpreadColor),month:getState().month,year:getState().year,global:true,notices:lastPlan?.notices??[],fitted:lastPlan?.fitted??[],effectiveFontSizesPt:lastPlan?Object.fromEntries(LAYOUT_ROLES.map(role=>{const items=lastPlan.texts.filter(item=>item.role===role);return [role,items.length?Number((Math.min(...items.map(item=>item.size))*72).toFixed(2)):null];})):{}};
  }
  return {render,summary};
}
