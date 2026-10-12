const DEFAULT_COLOR = '#f3dba5';
const MAX_CUSTOM = 100;
const MAX_NAME = 80;
const MAX_LINES = 4;
const dateKey = date => date.toISOString().slice(0, 10);
const utcDate = (year, month, day) => { const date = new Date(0); date.setUTCFullYear(year, month, day); return date; };
const nthWeekday = (year, month, weekday, occurrence) => 1 + (weekday - utcDate(year, month, 1).getUTCDay() + 7) % 7 + (occurrence - 1) * 7;
const lastMonday = (year, month) => { const last = utcDate(year, month + 1, 0); return last.getUTCDate() - (last.getUTCDay() + 6) % 7; };

/** Normalize persisted holiday preferences without trusting stored input. */
export function normalizeHolidays(value) {
  return {enabled:value?.enabled === true, color:/^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : DEFAULT_COLOR,
    removed:Array.isArray(value?.removed) ? value.removed.filter(id => typeof id === 'string').slice(0, MAX_CUSTOM) : [],
    custom:Array.isArray(value?.custom) ? value.custom.filter(item => typeof item?.id === 'string' && typeof item.name === 'string' && item.name.trim() && validHolidayDate(item.date)).slice(0, MAX_CUSTOM).map(item => ({id:item.id,name:item.name.trim().slice(0,MAX_NAME),date:item.date})) : []};
}
/** Validate an exact ISO calendar date. */
export function validHolidayDate(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value;
}
/** Resolve federal holiday dates and weekend observances for the selected calendar year. */
export function federalHolidays(year) {
  const result = [];
  const add = (id,name,sourceYear,month,day,fixed=false) => {
    const date = utcDate(sourceYear,month,day);
    if(date.getUTCFullYear()===year) result.push({id,name,date:dateKey(date)});
    if(fixed && [0,6].includes(date.getUTCDay())) {
      date.setUTCDate(date.getUTCDate() + (date.getUTCDay()===6 ? -1 : 1));
      if(date.getUTCFullYear()===year) result.push({id:`${id}-observed`,name:`${name} (observed)`,date:dateKey(date)});
    }
  };
  add('new-year',"New Year's Day",year,0,1,true);
  add('mlk','Birthday of Martin Luther King, Jr.',year,0,nthWeekday(year,0,1,3));
  add('washington',"Washington's Birthday",year,1,nthWeekday(year,1,1,3));
  add('memorial','Memorial Day',year,4,lastMonday(year,4));
  add('juneteenth','Juneteenth National Independence Day',year,5,19,true);
  add('independence','Independence Day',year,6,4,true);
  add('labor','Labor Day',year,8,nthWeekday(year,8,1,1));
  add('columbus','Columbus Day',year,9,nthWeekday(year,9,1,2));
  add('veterans','Veterans Day',year,10,11,true);
  add('thanksgiving','Thanksgiving Day',year,10,nthWeekday(year,10,4,4));
  add('christmas','Christmas Day',year,11,25,true);
  if(year<9999) add('next-new-year',"New Year's Day",year+1,0,1,true);
  return result.sort((a,b)=>a.date.localeCompare(b.date));
}
/** Return the editable list independent of highlight visibility. */
export function holidayList(state) {
  const settings = normalizeHolidays(state.holidays);
  return [...federalHolidays(state.year).filter(item=>!settings.removed.includes(item.id)),...settings.custom.filter(item=>Number(item.date.slice(0,4))===state.year)].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
/** Return enabled holidays for one date shared by the preview and PDF. */
export function holidaysForDate(state,month,day) {
  if(!state.holidays?.enabled) return [];
  const key = `${state.year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return holidayList(state).filter(item=>item.date===key);
}
/** Select readable foreground text for the configured background. */
export function holidayTextColor(color) {
  const channels = color.slice(1).match(/../g).map(value=>{const c=parseInt(value,16)/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722>0.179 ? '#111111' : '#ffffff';
}
/** Wrap and ellipsize holiday labels within their date cell. */
export function wrapHolidayText(text,measure,maxWidth,maxLines=MAX_LINES) {
  const lines=[]; let line='';
  for(const character of text) {
    if(line && measure(line+character)>maxWidth) {lines.push(line.trim());line='';}
    line+=character;
  }
  if(line) lines.push(line.trim());
  if(lines.length>maxLines) {lines.length=maxLines;let last=lines[maxLines-1];while(last && measure(last+'…')>maxWidth) last=last.slice(0,-1);lines[maxLines-1]=last+'…';}
  return lines;
}
/** Initialize accessible configuration controls and apply edits through the existing save cycle. */
export function createHolidayPanel(getState,onChange) {
  const byId=id=>document.getElementById(id);
  const update = settings => {getState().holidays=normalizeHolidays(settings);onChange();};
  byId('holidays-enabled').addEventListener('change',()=>update({...getState().holidays,enabled:byId('holidays-enabled').checked}));
  byId('holiday-add').addEventListener('click',()=>{
    const state=getState(),name=byId('holiday-name').value.trim(),date=byId('holiday-date').value;
    if(!name || !validHolidayDate(date) || Number(date.slice(0,4))!==state.year) {byId('holiday-status').textContent=`Enter a name and a valid date in ${state.year}.`;return;}
    if(state.holidays.custom.length>=MAX_CUSTOM) {byId('holiday-status').textContent=`You can save up to ${MAX_CUSTOM} custom holidays.`;return;}
    update({...state.holidays,custom:[...state.holidays.custom,{id:`custom-${crypto.randomUUID()}`,name:name.slice(0,MAX_NAME),date}]});
    byId('holiday-name').value='';byId('holiday-status').textContent='Holiday added.';
  });
  byId('holiday-restore').addEventListener('click',()=>update({...getState().holidays,removed:[]}));
  return {render() {
    const state=getState(),settings=normalizeHolidays(state.holidays);
    byId('holidays-enabled').checked=settings.enabled;byId('holiday-options').hidden=!settings.enabled;
    byId('holiday-count').textContent=`${holidayList(state).length} dates · ${state.year}`;
    byId('holiday-date').min=`${state.year}-01-01`;byId('holiday-date').max=`${state.year}-12-31`;
    byId('holiday-restore').disabled=!settings.removed.length;
    byId('holiday-list').replaceChildren(...holidayList(state).map(item=>{
      const row=document.createElement('li'),details=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('time'),button=document.createElement('button');
      name.textContent=item.name;date.dateTime=item.date;date.textContent=new Date(`${item.date}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
      button.type='button';button.textContent='×';button.setAttribute('aria-label',`Remove ${item.name}, ${item.date}`);
      button.addEventListener('click',()=>{const current=getState().holidays;update(item.id.startsWith('custom-')?{...current,custom:current.custom.filter(entry=>entry.id!==item.id)}:{...current,removed:[...current.removed,item.id]});});
      details.append(name,date);row.append(details,button);return row;
    }));
  }};
}
