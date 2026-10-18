import { bindFontPicker, refreshFontPicker } from './font-picker.js';
import { FONT_LABELS, FONT_CATALOG } from './fonts.js';
import { normalizeLayout } from './layout.js';
import { numericDraft, commitNumericOnBlur } from './numeric-input.js';
import { assets, backCoverUsesImage } from './media.js';
import { BACK_OBJECT_LIMIT, BACK_TEXT_LIMIT, BACK_STYLE_LIMITS, BACK_TEXT_FONT, normalizeBackObjects, normalizeBackFont, normalizeBackRect, resizeBackRect, formatBackRuns, replaceBackText, backImageKey } from './back-cover-model.js';

const HANDLE_NAMES=['nw','n','ne','e','se','s','sw','w'];
const HANDLE_LABELS={nw:'top left',n:'top',ne:'top right',e:'right',se:'bottom right',s:'bottom',sw:'bottom left',w:'left'};
const KEYBOARD_STEP=.01;
const KEYBOARD_LARGE_STEP=.1;
const byId=id=>document.getElementById(id);
const title=value=>value[0].toUpperCase()+value.slice(1);

/** Native, safe form controls and nonrotating transform handles for the generated back cover. */
export function createBackCoverControls({getState,onChange,normalize,planFor,canvas,stage,locked,chooseImage,refresh}) {
  const host=byId('back-object-controls'),styleHost=byId('back-shared-styles'),gridHost=byId('back-grid-controls');
  const fields=[];let selection='grid',objectSignature='',panelIdentity='',range={start:0,end:0},insertionFont=null,drag=null,disposed=false;
  const settings=()=>normalize(getState().backCover),selected=()=>settings().objects.find(object=>object.id===selection);
  const update=change=>{if(locked()||backCoverUsesImage(getState()))return;const next=settings();change(next);onChange(normalize(next));};
  const updateObject=change=>update(next=>{const object=next.objects.find(item=>item.id===selection);if(object)change(object);});
  const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  function button(parent,text,callback) {const element=make('button','',text);element.type='button';element.dataset.backControl='';element.addEventListener('click',()=>{if(!locked())callback();});parent.append(element);return element;}
  function section(parent,label,open=false) {const details=make('details','settings-group');details.open=open;details.append(make('summary','',label));const content=make('div','back-control-section');details.append(content);parent.append(details);return content;}
  function field(parent,labelText,type,get,set,options=null,bounds=null) {
    const label=make('label',type==='checkbox'?'toggle':''),caption=make('span','layout-control-label',labelText),control=make(type==='select'?'select':'input');
    control.dataset.backControl='';control.setAttribute('aria-label',labelText);label.append(caption,control);parent.append(label);
    if(type==='select')for(const entry of options){const [value,text]=Array.isArray(entry)?entry:[entry,title(entry)];const option=make('option','',text);option.value=String(value);control.append(option);}
    else {control.type=type;if(bounds){control.min=String(bounds[0]);control.max=String(bounds[1]);control.step='.01';}}
    const apply=()=>{if(locked())return;const value=type==='checkbox'?control.checked:type==='number'?numericDraft(control,...bounds):control.value;if(value!==null)set(value);};
    control.addEventListener(['checkbox','select'].includes(type)?'change':'input',apply);
    if(bounds)commitNumericOnBlur(control,...bounds,get);
    fields.push({control,get,type,owner:parent});return control;
  }
  const gridFields=make('div','layout-field-grid back-inspector-fields');gridHost.append(gridFields);
  geometry(gridFields,()=>planFor(getState()).grid,value=>update(next=>{next.grid=value;}));
  button(gridHost,'Select monthly grid',()=>select('grid'));
  button(gridHost,'Reset grid position & size',()=>update(next=>{next.grid=null;}));
  const help=make('p','layout-help','Drag the grid or a custom container. Resize with corner or edge handles. Aspect ratio is locked by default; hold Alt to resize freely. Arrow keys move the selected container.');gridHost.append(help);
  for(const [key,label] of [['detailsStyle','Monthly artwork details'],['imageStyle','Monthly image area']]) {
    const content=section(styleHost,label),group=make('div','layout-field-grid back-inspector-fields');content.append(group);
    styleFields(group,()=>settings()[key],(name,value)=>update(next=>{next[key][name]=value;}),key==='detailsStyle');
    if(key==='detailsStyle')for(const [role,label] of [['artworkTitle','Artwork title'],['artist','Artist'],['description','Description']]) {
      const card=make('fieldset','layout-font-group');card.append(make('legend','',label));content.append(card);
      const fontFields=make('div','layout-field-grid back-inspector-fields');card.append(fontFields);
      field(fontFields,'Inherit Layout modifier font','checkbox',()=>settings().detailsFonts[role]===null,value=>update(next=>{next.detailsFonts[role]=value?null:{...normalizeLayout(getState().layout).fonts[role]};}));
      fontControls(fontFields,()=>settings().detailsFonts[role]??normalizeLayout(getState().layout).fonts[role],patch=>update(next=>{next.detailsFonts[role]=normalizeBackFont({...next.detailsFonts[role]??normalizeLayout(getState().layout).fonts[role],...patch});}));
    }
  }
  const objectMenu=make('div','back-object-menu'),objectList=make('select');objectList.setAttribute('aria-label','Selected back-cover container');objectList.dataset.backControl='';
  objectMenu.append(objectList);host.append(objectMenu);
  button(objectMenu,'Add text',()=>addObject('text'));button(objectMenu,'Add image',()=>addObject('image'));
  const objectPanel=make('div','back-object-panel');host.append(objectPanel);
  objectList.addEventListener('change',()=>select(objectList.value));
  const overlay=make('div','back-transform-overlay'),outline=make('div','back-transform-box');outline.tabIndex=0;outline.setAttribute('role','group');overlay.append(outline);stage.append(overlay);
  overlay.hidden=true;
  for(const handle of HANDLE_NAMES){const element=make('button',`back-transform-handle back-handle-${handle}`);element.type='button';element.dataset.handle=handle;element.setAttribute('aria-label',`Resize ${HANDLE_LABELS[handle]} edge`);element.title=`Resize ${HANDLE_LABELS[handle]}`;outline.append(element);}
  outline.addEventListener('pointerdown',event=>{if(event.target.dataset.handle)beginDrag(event,event.target.dataset.handle);else canvasPointerDown(event);});
  canvas.addEventListener('pointerdown',canvasPointerDown);
  window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerCancel);
  outline.addEventListener('keydown',event=>{
    if(locked()||backCoverUsesImage(getState()))return;
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;
    event.preventDefault();const step=event.shiftKey?KEYBOARD_LARGE_STEP:KEYBOARD_STEP,rect=selection==='grid'?planFor(getState()).grid:selected()?.rect;
    if(rect)saveRect(resizeBackRect(rect,event.target.dataset.handle??'move',delta[0]*step,delta[1]*step,event.altKey?false:rect.aspectLocked!==false));
  });
  function geometry(parent,get,set) {
    for(const [key,label,bounds] of [['x','X · in',[-48,48]],['y','Y · in',[-48,48]],['width','Width · in',[.1,48]],['height','Height · in',[.1,48]]])field(parent,label,'number',()=>get()[key],value=>{
      const current=get();let next={...current,[key]:value};
      if(current.aspectLocked!==false&&['width','height'].includes(key)) {
        next=resizeBackRect(current,key==='width'?'e':'s',key==='width'?value-current.width:0,key==='height'?value-current.height:0,true);
        next.x=current.x;next.y=current.y;
      }
      set(normalizeBackRect(next,current));
    },null,bounds);
    field(parent,'Preserve aspect ratio','checkbox',()=>get().aspectLocked!==false,value=>set({...get(),aspectLocked:value}));
  }
  function styleFields(parent,get,set,text=true) {
    field(parent,'Transparent background','checkbox',()=>get().transparent,value=>set('transparent',value));
    field(parent,'Background','color',()=>get().background,value=>set('background',value));
    field(parent,'Border color','color',()=>get().borderColor,value=>set('borderColor',value));
    for(const [key,label] of [['borderWidth','Border width · pt'],['paddingX','Horizontal padding · pt'],['paddingY','Vertical padding · pt'],['radiusTL','Top-left radius · pt'],['radiusTR','Top-right radius · pt'],['radiusBL','Bottom-left radius · pt'],['radiusBR','Bottom-right radius · pt']])field(parent,label,'number',()=>get()[key],value=>set(key,value),null,BACK_STYLE_LIMITS[key]);
    if(text){field(parent,'Text alignment','select',()=>get().align,value=>set('align',value),[['inherit','Use font alignment'],'left','center','right']);field(parent,'Vertical alignment','select',()=>get().vertical,value=>set('vertical',value),['top','middle','bottom']);}
    else if(parent.closest('#back-shared-styles')){field(parent,'Image horizontal alignment','select',()=>get().align,value=>set('align',value),[['inherit','Use frame alignment'],'left','center','right']);field(parent,'Image vertical alignment','select',()=>get().vertical,value=>set('vertical',value),[['inherit','Use frame alignment'],'top','middle','bottom']);}
  }
  function fontControls(parent,get,patch,alignment=true) {
    const familyPicker=field(parent,'Font','select',()=>get().family,value=>patch({family:value}),Object.entries(FONT_LABELS));
    bindFontPicker(familyPicker);
    field(parent,'Size · pt','number',()=>get().size,value=>patch({size:value}),null,[4,144]);
    field(parent,'Text color','color',()=>get().color,value=>patch({color:value}));
    if(alignment)field(parent,'Font alignment','select',()=>get().align,value=>patch({align:value}),['left','center','right']);
    const styles=make('div','layout-segments back-font-styles');styles.setAttribute('role','group');styles.setAttribute('aria-label','Font style');parent.append(styles);
    for(const [style,label] of [['normal','R'],['bold','B'],['italic','I'],['bolditalic','BI']]) {
      const element=button(styles,label,()=>patch({style}));element.className=`font-style-icon font-style-${style}`;element.setAttribute('aria-label',style==='normal'?'Regular':style==='bolditalic'?'Bold italic':title(style));element.title=element.getAttribute('aria-label');element.addEventListener('pointerdown',event=>event.preventDefault());
      fields.push({control:element,type:'style',get:()=>get().style===style,available:()=>!FONT_CATALOG[get().family]||Object.hasOwn(FONT_CATALOG[get().family].files,style),owner:parent});
    }
  }
  function addObject(type) {
    if(settings().objects.length>=BACK_OBJECT_LIMIT)return;
    const id=crypto.randomUUID(),font={...BACK_TEXT_FONT};selection=id;panelIdentity='';insertionFont=null;range={start:0,end:0};
    update(next=>{next.objects.push(normalizeBackObjects([{id,type,name:`${title(type)} ${next.objects.length+1}`,rect:{x:.5,y:.5,width:3,height:type==='text'?1:2},font,runs:[{text:'Your text',font}]}])[0]);});
  }
  function select(id) {selection=id;panelIdentity='';insertionFont=null;range={start:0,end:0};render();refresh();}
  function buildObjectPanel() {
    for(let index=fields.length-1;index>=0;index--)if(objectPanel.contains(fields[index].owner))fields.splice(index,1);
    objectPanel.replaceChildren();const object=selected();if(!object)return;
    const nameFields=make('div','layout-field-grid back-inspector-fields');objectPanel.append(nameFields);
    const name=field(nameFields,'Container name','text',()=>selected()?.name??'',value=>updateObject(item=>{item.name=value;}));name.maxLength=120;
    const geo=section(objectPanel,'Position & size',true),geoFields=make('div','layout-field-grid back-inspector-fields');geo.append(geoFields);geometry(geoFields,()=>selected()?.rect??object.rect,value=>updateObject(item=>{item.rect=value;}));
    const appearance=section(objectPanel,'Container style'),appearanceFields=make('div','layout-field-grid back-inspector-fields');appearance.append(appearanceFields);styleFields(appearanceFields,()=>selected()?.style??object.style,(key,value)=>updateObject(item=>{item.style[key]=value;}),object.type==='text');
    if(object.type==='text') {
      const label=make('label','back-text-label','Text'),textarea=make('textarea','back-rich-text');textarea.maxLength=BACK_TEXT_LIMIT;textarea.rows=5;textarea.setAttribute('aria-label','Custom text; select characters to format');textarea.value=object.runs.map(run=>run.text).join('');label.append(textarea);objectPanel.append(label);
      const selectionStatus=make('p','layout-help');selectionStatus.setAttribute('aria-live','polite');objectPanel.append(selectionStatus);
      const capture=()=>{if(range.start!==textarea.selectionStart||range.end!==textarea.selectionEnd)insertionFont=null;range={start:textarea.selectionStart,end:textarea.selectionEnd};selectionStatus.textContent=range.end>range.start?`${range.end-range.start} selected characters`:'Whole text · select characters to style a range';renderFontFields();};
      for(const event of ['select','keyup','pointerup','focus'])textarea.addEventListener(event,capture);
      textarea.addEventListener('input',()=>{const value=textarea.value;updateObject(item=>{item.runs=replaceBackText(item.runs,value,item.font,insertionFont??fontAt(item,textarea.selectionStart));});capture();});
      const fontFields=make('div','layout-field-grid back-inspector-fields');objectPanel.append(fontFields);
      fontControls(fontFields,()=>insertionFont??fontAt(selected()??object,range.start),patch=>{
        const all=range.start===range.end;updateObject(item=>{const length=item.runs.reduce((sum,run)=>sum+run.text.length,0);item.runs=formatBackRuns(item.runs,all?0:range.start,all?length:range.end,patch,item.font);if(all)item.font=normalizeBackFont({...item.font,...patch});insertionFont=normalizeBackFont({...fontAt(item,range.start),...patch});});
      },false);
      capture();
    } else {
      button(objectPanel,'Choose / replace image…',()=>chooseImage(backImageKey(selection)));
      const imageStatus=make('p','layout-help');imageStatus.dataset.customImageStatus='';imageStatus.setAttribute('role','status');objectPanel.append(imageStatus);
      const cropFields=make('div','layout-field-grid back-inspector-fields');objectPanel.append(cropFields);
      field(cropFields,'Image framing','select',()=>selected()?.crop.mode??'fill',value=>updateObject(item=>{item.crop.mode=value;}),['fill','fit']);
      for(const [key,label,bounds,scale] of [['x','Focal X · %',[0,100],100],['y','Focal Y · %',[0,100],100],['zoom','Image zoom · ×',[.1,16],1]])field(cropFields,label,'number',()=>(selected()?.crop[key]??object.crop[key])*scale,value=>updateObject(item=>{item.crop[key]=value/scale;}),null,bounds);
      button(objectPanel,'Reset image framing',()=>updateObject(item=>{item.crop={mode:'fill',x:.5,y:.5,zoom:1};}));
    }
    const actions=make('div','back-object-actions');objectPanel.append(actions);
    button(actions,'Send backward',()=>reorder(-1));button(actions,'Bring forward',()=>reorder(1));
    button(actions,'Remove container',()=>{const id=selection;update(next=>{next.objects=next.objects.filter(item=>item.id!==id);});if(object.type==='image')assets.remove(backImageKey(id));selection='grid';panelIdentity='';render();refresh();});
  }
  function fontAt(object,offset) {let count=0;for(const run of object.runs??[]){count+=run.text.length;if(count>offset)return run.font;}return object.runs?.at(-1)?.font??object.font;}
  function reorder(delta) {update(next=>{const index=next.objects.findIndex(item=>item.id===selection),target=Math.max(0,Math.min(next.objects.length-1,index+delta));if(index>=0){const [object]=next.objects.splice(index,1);next.objects.splice(target,0,object);}});}
  function renderFontFields() {for(const entry of fields)if(entry.owner.isConnected&&document.activeElement!==entry.control){if(Object.hasOwn(entry.control.dataset,'fontPicker'))refreshFontPicker(entry.control);const value=entry.get();if(entry.type==='style'){entry.control.setAttribute('aria-pressed',String(value));entry.control.disabled=locked()||entry.available?.()===false;}else if(entry.type==='checkbox')entry.control.checked=value;else entry.control.value=String(value??'');}}
  function saveRect(rect) {if(selection==='grid')update(next=>{next.grid=rect;});else updateObject(object=>{object.rect=rect;});}
  function point(event) {const bounds=canvas.getBoundingClientRect(),state=getState();return {x:(event.clientX-bounds.left)/bounds.width*state.width,y:(event.clientY-bounds.top)/bounds.height*state.height};}
  function contains(box,point) {return point.x>=box.x&&point.y>=box.y&&point.x<=box.x+box.width&&point.y<=box.y+box.height;}
  function canvasPointerDown(event) {
    if(locked()||backCoverUsesImage(getState()))return;
    const location=point(event),object=[...settings().objects].reverse().find(item=>contains(item.rect,location)),grid=planFor(getState()).grid;
    if(object)select(object.id);else if(contains(grid,location))select('grid');else return;
    beginDrag(event,'move');
  }
  function beginDrag(event,handle) {if(locked()||backCoverUsesImage(getState())||event.button!==0)return;event.preventDefault();const rect=selection==='grid'?planFor(getState()).grid:selected()?.rect;if(!rect)return;drag={start:point(event),rect:{...rect},handle,pointerId:event.pointerId};canvas.setPointerCapture(event.pointerId);outline.classList.add('is-transforming');outline.focus({preventScroll:true});}
  function pointerMove(event) {if(!drag||event.pointerId!==drag.pointerId)return;if(locked()){pointerCancel();return;}const location=point(event);saveRect(resizeBackRect(drag.rect,drag.handle,location.x-drag.start.x,location.y-drag.start.y,event.altKey?false:drag.rect.aspectLocked!==false));}
  function pointerUp(event) {if(drag&&event.pointerId===drag.pointerId){if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);drag=null;outline.classList.remove('is-transforming');}}
  function pointerCancel() {if(drag&&canvas.hasPointerCapture(drag.pointerId))canvas.releasePointerCapture(drag.pointerId);drag=null;outline.classList.remove('is-transforming');}
  function render() {
    if(disposed)return;const current=settings();if(selection!=='grid'&&!current.objects.some(object=>object.id===selection)){selection='grid';panelIdentity='';}
    const signature=JSON.stringify(current.objects.map(object=>[object.id,object.name]));
    if(signature!==objectSignature||!objectList.options.length){objectSignature=signature;objectList.replaceChildren();for(const [id,name] of [['grid','Monthly grid'],...current.objects.map(object=>[object.id,object.name])]){const option=make('option','',name);option.value=id;objectList.append(option);}}
    objectList.value=selection;
    if(panelIdentity!==selection){panelIdentity=selection;buildObjectPanel();}
    renderFontFields();
    const disabled=locked()||backCoverUsesImage(getState());
    for(const entry of fields)entry.control.disabled=disabled||(entry.type==='style'&&entry.available?.()===false);
    for(const parent of [host,styleHost,gridHost])for(const button of parent.querySelectorAll('button'))if(!button.classList.contains('font-style-icon'))button.disabled=disabled||(button.textContent.startsWith('Add ')&&current.objects.length>=BACK_OBJECT_LIMIT);
    const textarea=objectPanel.querySelector('textarea');if(textarea){textarea.disabled=disabled;if(document.activeElement!==textarea)textarea.value=selected()?.runs.map(run=>run.text).join('')??'';}
    objectList.disabled=disabled;
    const object=selected(),status=objectPanel.querySelector('[data-custom-image-status]');if(status&&object){const record=assets.get(backImageKey(object.id));status.textContent=record?.bitmap?`${record.metadata.grantName} / ${record.metadata.relativePath}`:record?`Image unavailable: ${record.error||'Restore photo access or reselect its folder.'}`:'Choose an image for this container. Image framing is independent of container size.';}
    const rect=selection==='grid'?planFor(getState()).grid:object?.rect;overlay.hidden=backCoverUsesImage(getState())||!rect;
    if(rect){const canvasBounds=canvas.getBoundingClientRect(),stageBounds=stage.getBoundingClientRect(),state=getState();overlay.style.left=`${canvasBounds.left-stageBounds.left}px`;overlay.style.top=`${canvasBounds.top-stageBounds.top}px`;overlay.style.width=`${canvasBounds.width}px`;overlay.style.height=`${canvasBounds.height}px`;outline.style.left=`${rect.x/state.width*100}%`;outline.style.top=`${rect.y/state.height*100}%`;outline.style.width=`${rect.width/state.width*100}%`;outline.style.height=`${rect.height/state.height*100}%`;outline.setAttribute('aria-label',`${object?.name??'Monthly grid'}: move with arrow keys or drag; use handles to resize`);outline.style.pointerEvents=disabled?'none':'';}
  }
  let previewObserver;
  if(typeof ResizeObserver==='function'){previewObserver=new ResizeObserver(()=>render());previewObserver.observe(canvas);}
  return {render,dispose(){disposed=true;previewObserver?.disconnect();pointerCancel();canvas.removeEventListener('pointerdown',canvasPointerDown);window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerCancel);overlay.remove();}};
}
