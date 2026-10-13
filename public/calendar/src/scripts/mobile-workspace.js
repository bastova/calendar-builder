import { readPreference, writePreference } from './browser-storage.js';
/** Adapt the existing studio into focused phone screens without duplicating document controls. */
export function createMobileWorkspace(getState, navigate) {
  const media = matchMedia('(max-width: 720px)');
  const nav = document.getElementById('mobile-navigation');
  const dialog = document.getElementById('mobile-settings');
  const content = document.getElementById('mobile-settings-content');
  const toolbar = document.querySelector('.document-toolbar');
  const slots = [toolbar].map(node => {const marker=document.createComment('desktop settings location');node.before(marker);return {node,marker};});
  const strip=document.getElementById('month-strip'),stripMarker=document.createComment('desktop month location');strip.before(stripMarker);
  let screen = getState().view === 'printing' ? 'print' : readPreference('mobile-screen','preview');
  if(!['preview','edit','print','info'].includes(screen))screen='preview';
  let selection='';
  const saddleOption=document.querySelector('#binding-style option[value=saddle]');
  const saddleLabel=saddleOption.textContent;
  const buttons = [...nav.querySelectorAll('[data-mobile-screen]')];
  function sync() {
    if (getState().view === 'printing' && screen !== 'info') screen = 'print';
    else if (screen === 'print') screen = 'preview';
    document.body.dataset.mobileScreen = screen;
    if(media.matches){
      writePreference('mobile-screen',screen);
      const active=strip.querySelector('[aria-pressed=true]');
      const next=active?.getAttribute('aria-label')||active?.textContent;
      if(active&&next!==selection){selection=next;const offset=active.offsetLeft-strip.offsetLeft-strip.clientWidth/2+active.clientWidth/2;strip.scrollTo({left:Math.max(0,offset),behavior:'instant'});}
    }
    for (const button of buttons) {
      const active = button.dataset.mobileScreen === screen;
      button.setAttribute('aria-current', active ? 'page' : 'false');
    }
  }
  function adapt() {
    saddleOption.textContent=media.matches?'Saddle':saddleLabel;
    if (media.matches) {slots.forEach(({node})=>content.append(node));document.querySelector('.spread-workspace').prepend(strip);}
    else {if(dialog.open)dialog.close();slots.forEach(({node,marker})=>marker.after(node));stripMarker.after(strip);}
    sync();
  }
  buttons.forEach(button=>button.addEventListener('click',()=>{
    const next = button.dataset.mobileScreen;
    if(next === screen)return;
    screen = next;
    navigate(next === 'print' ? 'printing' : 'spread');
    sync();
    window.scrollTo({top:0,behavior:'instant'});
    const target=next==='info'?document.getElementById('site-info-title'):next==='edit'?document.querySelector('#artwork-tabs [role=tab][aria-selected=true]'):document.getElementById('preview-title');
    target?.focus({preventScroll:true});
  }));
  document.getElementById('mobile-settings-open').addEventListener('click',()=>dialog.showModal());
  document.getElementById('mobile-settings-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  media.addEventListener('change',adapt);
  adapt();
  return {sync};
}
