import { readPreference, writePreference } from './browser-storage.js';
import { MONTHS, LAYOUT_FONTS, LAYOUT_ROLES, ARTWORK_FONT_ROLES, LAYOUT_LIMITS, FONT_SIZE_LIMITS, normalizeLayout, drawCalendarGrid, readerState, DEFAULT_END_SPREAD_COLOR, normalizeEndSpreadColor, calendarSelection, calendarSelectionLabel } from './layout.js';
import { normalizeHolidays } from './holidays.js';

const PREVIEW_LONG_EDGE = 1400;
const PREVIEW_MAX_PIXELS = 1400 * 1400;
import { FONT_LABELS, FONT_CATALOG } from './fonts.js';
const ROLE_LABELS = {title:'Month title',year:'Year',weekday:'Weekday headings',date:'Date numbers',holiday:'Holiday names',artist:'Artist name',artworkTitle:'Artwork title',description:'Artwork description'};
const STYLE_OPTIONS = [['normal','Regular'],['bold','Bold'],['italic','Italic'],['bolditalic','Bold italic']];
const ALIGN_OPTIONS = [['left','Left'],['center','Center'],['right','Right']];
const GRID_FIELDS = [['cellBackground','Date-cell background','color'],['lineColor','Grid line color','color'],['lineWidth','Grid stroke width · pt','number'],['holidayContrast','Auto-contrast holiday text','checkbox']];
const SPACING_FIELDS = [['insetX','Extra left/right inset · in'],['insetTop','Extra top inset · in'],['insetBottom','Extra bottom inset · in'],['headingHeight','Heading area height · in'],['headingGap','Heading → weekday gap · in'],['weekdayHeight','Weekday area height · in'],['weekdayGap','Weekday → grid gap · in'],['paddingX','Cell horizontal padding · in'],['paddingY','Cell vertical padding · in'],['holidayGap','Date → holiday gap · in'],['holidayLines','Maximum holiday lines']];
const byId = id => document.getElementById(id);

/** Build accessible non-drag layout controls and a current-month trim-page preview. */
export function createLayoutEditor(getState,onLayoutChange,onTabChange,onHolidayChange,onEndSpreadColorChange) {
  const controls=[],canvas=byId('layout-preview'),context=canvas.getContext('2d');
  const savedZoom=readPreference('layout-zoom',1);
  let zoom=Number.isFinite(savedZoom)?Math.max(1,Math.min(4,savedZoom)):1;
  const viewport=byId('layout-zoom-viewport'),zoomValue=byId('layout-zoom-value');
  function applyZoom() {
    const available=Math.max(1,viewport.clientWidth-20),height=280;
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
        const original=value;value=Math.max(min,Math.min(max,value));if(path[0]==='holidayLines') value=Math.round(value);
        fieldNotice=value!==original?`${labelText} was limited to ${value} (${min}–${max}).`:'';
        if(value!==original) control.value=String(value);
      } else fieldNotice='';
      if(path[0]==='fonts') current.fonts[path[1]][path[2]]=value;
      else current[path[0]]=value;
      onLayoutChange(normalizeLayout(current));
    });
    // Empty numeric drafts never make the document invalid or disable photo export.
    control.addEventListener('blur',()=>{
      if(control.type!=='number') return;
      const wasEmpty=!Number.isFinite(control.valueAsNumber),settings=normalizeLayout(getState().layout);
      control.value=path[0]==='fonts'?settings.fonts[path[1]][path[2]]:settings[path[0]];
      if(wasEmpty) {fieldNotice=`${labelText}: restored the last valid value.`;renderNotices();}
    });
  }
  for(const role of [...LAYOUT_ROLES,...ARTWORK_FONT_ROLES]) {
    const group=document.createElement('fieldset'),legend=document.createElement('legend'),fields=document.createElement('div');
    group.className='layout-font-group';legend.textContent=ROLE_LABELS[role];fields.className='layout-field-grid';group.append(legend,fields);byId(ARTWORK_FONT_ROLES.includes(role)?'layout-artwork-font-controls':'layout-font-controls').append(group);
    createControl(fields,'Font family',['fonts',role,'family'],'select',Object.keys(LAYOUT_FONTS).map(key=>[key,FONT_LABELS[key]]));
    createControl(fields,'Font size · pt',['fonts',role,'size']);
    createControl(fields,'Font style',['fonts',role,'style'],'select',STYLE_OPTIONS);
    createControl(fields,'Text color',['fonts',role,'color'],'color');
    createControl(fields,'Horizontal alignment',['fonts',role,'align'],'select',ALIGN_OPTIONS);
  }
  const gridFields=byId('layout-grid-controls');
  createControl(gridFields,GRID_FIELDS[0][1],[GRID_FIELDS[0][0]],GRID_FIELDS[0][2]);
  const holidayLabel=document.createElement('label'),holidayColor=document.createElement('input');
  holidayColor.id='layout-holiday-highlight-color';holidayColor.type='color';holidayColor.dataset.layoutControl='';
  holidayLabel.htmlFor=holidayColor.id;holidayLabel.append(document.createTextNode('Holiday highlight background'),holidayColor);gridFields.append(holidayLabel);
  holidayColor.addEventListener('input',()=>onHolidayChange(normalizeHolidays({...getState().holidays,color:holidayColor.value})));
  for(const [key,label,type] of GRID_FIELDS.slice(1)) createControl(gridFields,label,[key],type);
  for(const [key,label] of SPACING_FIELDS) createControl(byId('layout-spacing-controls'),label,[key]);
  createControl(byId('layout-spacing-controls'),'Date block vertical alignment',['dateVertical'],'select',[['top','Top'],['middle','Middle'],['bottom','Bottom']]);
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
      const value=path[0]==='fonts'?settings.fonts[path[1]][path[2]]:settings[path[0]];
      if(control.type==='checkbox') control.checked=value;else control.value=value;
      if(path[0]==='fonts'&&path[2]==='style'){
        const family=FONT_CATALOG[settings.fonts[path[1]].family];
        for(const option of control.options)option.disabled=Boolean(family&&!Object.hasOwn(family.files,option.value));
      }
    }
    for(const {control} of controls) if(control.hidden) for(const button of control.parentElement.querySelectorAll('button')) {
      button.setAttribute('aria-pressed',String(button.dataset.value===control.value));
      button.disabled=Boolean([...control.options].find(option=>option.value===button.dataset.value)?.disabled);
    }
    holidayColor.value=normalizeHolidays(state.holidays).color;
    endSpreadColor.value=normalizeEndSpreadColor(state.endSpreadColor);
    const endSelected=!state.previewClosed&&['opening','closing'].includes(state.endSpread),title=endSelected?`${calendarSelectionLabel(state)} · solid end spread`:`${MONTHS[state.month]} ${state.year}`;
    byId('layout-preview-title').textContent=`${title}${state.previewClosed?' · selected month (cover shown in 3D)':''}`;
    byId('layout-preview-title').nextElementSibling.textContent=endSelected?'FLAT / FULL SPREAD':'FLAT / TRIM PAGE';
    canvas.setAttribute('aria-label',endSelected?`${title}. Both full-page halves use ${endSpreadColor.value}, with no photo or date grid.`:`${title}, flat six-row calendar. ${state.week===1?'Monday':'Sunday'} first. Global layout applies to all twelve months.`);
    byId('layout-preview-caption').textContent=endSelected?'Both halves of the opening and closing spreads use the shared End spreads color. Inside covers match; exterior cover photos are unchanged. Solid artwork extends through applicable PDF bleed. Colors are RGB, not a print proof.':'Colors are RGB, not a print proof.';
    const previewHeight=state.height*(endSelected?2:1),scale=Math.min(PREVIEW_LONG_EDGE/Math.max(state.width,previewHeight),Math.sqrt(PREVIEW_MAX_PIXELS/(state.width*previewHeight)));
    canvas.width=Math.max(1,Math.round(state.width*scale));canvas.height=Math.max(1,Math.round(previewHeight*scale));
    lastPlan=null;
    if(context) {context.fillStyle=endSelected?endSpreadColor.value:'#ffffff';context.fillRect(0,0,canvas.width,canvas.height);if(!endSelected)lastPlan=drawCalendarGrid(context,readerState(state),state.month,canvas.width,canvas.height);}
    else fieldNotice='Flat preview requires a browser Canvas 2D context. Layout controls and vector PDF export remain available.';
    applyZoom();renderNotices();
  }
  /** Expose effective fitted sizes alongside the persisted requested layout settings. */
  function summary() {
    return {selection:calendarSelection(getState()),endSpreadColor:normalizeEndSpreadColor(getState().endSpreadColor),month:getState().month,year:getState().year,global:true,notices:lastPlan?.notices??[],fitted:lastPlan?.fitted??[],effectiveFontSizesPt:lastPlan?Object.fromEntries(LAYOUT_ROLES.map(role=>{const items=lastPlan.texts.filter(item=>item.role===role);return [role,items.length?Number((Math.min(...items.map(item=>item.size))*72).toFixed(2)):null];})):{}};
  }
  return {render,summary};
}
