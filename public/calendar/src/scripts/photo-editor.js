import { ASSET_KEYS, assetLabel, ARTWORK_METADATA_LIMITS } from './layout.js';
import { assets, FILE_LIMIT, isPhotoEntry, safeRelativePath, photoPlacement, cropForPlacement, drawMappedPhoto, normalizeCrop, CENTER_CROP, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE, effectiveDpi, photoHasGaps, clamp, picaAvailable, printRasterSpec, TARGET_PPI } from './media.js';

const LIST_LIMIT = 50;
const WORKSPACE_PADDING = 44;
const HANDLE_SIZE = 44;
const MIN_VISIBLE_INCHES = .25;
const KEYBOARD_STEP = 2;
const KEYBOARD_LARGE_STEP = 20;
const RESIZE_CURSORS = {nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',e:'ew-resize',se:'nwse-resize',s:'ns-resize',sw:'nesw-resize',w:'ew-resize'};
const byId = id => document.getElementById(id);
const sizeLabel = size => Number.isFinite(size) ? `${(size / (1024 * 1024)).toFixed(2)} MiB` : 'unknown size';

/** Wire directory grants and the direct-manipulation photo workspace; no native picker. */
export function createPhotoEditor(getState, selectTarget, onMetadataChange) {
  const files = window.Bezi?.files;
  const available = files && ['requestDirectory','getGrants','list','stat','readBytes','revoke'].every(method => typeof files[method] === 'function') && typeof createImageBitmap === 'function' && picaAvailable();
  let grants = [], activeGrant = null, relativeFolder = '', offset = 0, total = 0, listToken = 0;
  let target = `month-${getState().month}`, busy = false, drag = null, cropFrameId = 0, queuedCrop = null, viewport = null, snapGuides = [], lastGeometry = '';
  const canvas = byId('crop-preview'), context = canvas.getContext('2d'), workspace = byId('crop-workspace'), boundingBox = byId('crop-bounds');
  const handles = [...boundingBox.querySelectorAll('[data-crop-handle]')];
  for (const key of ASSET_KEYS.filter(key=>key!=='back-cover')) { const option = document.createElement('option'); option.value = key; option.textContent = assetLabel(key); byId('photo-target').append(option); }
  const metadataPanel=byId('artwork-metadata'),artistInput=byId('artwork-artist'),titleInput=byId('artwork-title'),descriptionInput=byId('artwork-description');
  let metadataTarget=null;
  artistInput.maxLength=ARTWORK_METADATA_LIMITS.artist;titleInput.maxLength=ARTWORK_METADATA_LIMITS.title;descriptionInput.maxLength=ARTWORK_METADATA_LIMITS.description;
  for(const input of [artistInput,titleInput,descriptionInput]) input.addEventListener('input',()=>{
    // The photo target owns this draft, not the month retained during end-spread navigation.
    if(metadataTarget!==target || !/^month-(?:[0-9]|1[01])$/.test(target)) return;
    onMetadataChange(target,{artist:artistInput.value,title:titleInput.value,description:descriptionInput.value});
  });
  function renderMetadata() {
    const isMonth=/^month-(?:[0-9]|1[01])$/.test(target),changed=metadataTarget!==target;
    metadataPanel.hidden=!isMonth;
    artistInput.disabled=titleInput.disabled=descriptionInput.disabled=busy||assets.pending>0||!isMonth;
    if(isMonth) {
      byId('artwork-metadata-title').textContent=`${assetLabel(target).replace(/ photo$/,'')} artwork details`;
      const metadata=getState().artworkMetadata?.[target]??{};
      for(const [input,field] of [[artistInput,'artist'],[titleInput,'title'],[descriptionInput,'description']]) {
        if(changed || document.activeElement!==input) input.value=metadata[field]??'';
      }
    }
    metadataTarget=target;
  }
  const message = text => { byId('photo-status').textContent = text; };
  function updateGrants() {
    byId('photo-grants').replaceChildren();
    for (const grant of grants) {
      const option = document.createElement('option'); option.value = grant.grantId; option.textContent = `${grant.name}${grant.available ? '' : ' — permission unavailable'}`;
      byId('photo-grants').append(option);
    }
    byId('photo-grants').value = activeGrant?.grantId || '';
    byId('revoke-folder').disabled = busy || !activeGrant;
  }
  async function browse(folder = '', nextOffset = 0) {
    if (folder && !safeRelativePath(folder)) return;
    const token = ++listToken;
    relativeFolder = folder; offset = nextOffset;
    byId('photo-folder-path').textContent = `${activeGrant?.name || 'No folder'} / ${relativeFolder || '.'}`;
    byId('photo-file-list').replaceChildren();
    byId('folder-parent').disabled = busy || !relativeFolder;
    if (!activeGrant?.available) { message('This folder permission is unavailable. Choose photo folder to reselect, or revoke the old grant.'); return; }
    try {
      const result = await files.list(activeGrant.grantId, relativeFolder, {offset,limit:LIST_LIMIT});
      if (token !== listToken) return;
      total = result.total;
      for (const entry of result.entries) {
        if (!safeRelativePath(entry.relativePath) || !(entry.kind === 'directory' || isPhotoEntry(entry))) continue;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'photo-file';
        const oversized = entry.kind === 'file' && (!Number.isFinite(entry.size) || entry.size > FILE_LIMIT || entry.size <= 0);
        button.textContent = entry.kind === 'directory' ? `${entry.name} /` : `${entry.name} · ${sizeLabel(entry.size)}${oversized ? ' — exceeds limit or size unavailable' : ''}`;
        button.dataset.blocked = String(oversized);
        button.disabled = busy || assets.pending>0 || oversized;
        button.addEventListener('click', async () => {
          if (busy || assets.pending) return;
          if (entry.kind === 'directory') { await browse(entry.relativePath); return; }
          finishDrag();flushCrop();
          const chosenTarget = target, chosenGrant = activeGrant, chosenState = {...getState()};
          button.disabled = true; message(`Reading ${entry.name} for ${assetLabel(chosenTarget)}…`);
          try {
            const result=await assets.assign(chosenTarget,chosenGrant,entry,files,chosenState,text=>message(`${assetLabel(chosenTarget)} · ${text}`));
            if (result) {
              const availablePpi=Math.min(result.decodedPpi,result.sourceDpi),spec=result.spec;
              message(`Assigned ${entry.name} to ${assetLabel(chosenTarget)}. Pica prepared ${spec.width} × ${spec.height} px cropped print artwork for the current specification; only the full-source 768 px preview is retained. Original file unchanged; PDF rereads it for the final crop.${availablePpi<Math.min(TARGET_PPI,spec.ppi)?` Warning: source / bounded decode supplies ${Math.floor(availablePpi)} effective PPI; resizing cannot add detail.`:''}${spec.ppi<TARGET_PPI?` Raster cap: ${Math.floor(spec.ppi)} PPI, not 300.`:''}`);
            }
          }
          catch (error) { message(error.message); }
          finally { button.disabled = busy || assets.pending>0 || oversized; }
        });
        byId('photo-file-list').append(button);
      }
      if (!byId('photo-file-list').children.length) byId('photo-file-list').textContent = 'No supported images or subfolders on this page.';
      byId('folder-page').textContent = `${Math.min(offset + 1,total)}–${Math.min(offset + LIST_LIMIT,total)} of ${total} entries`;
      byId('folder-prev').disabled = busy || offset === 0; byId('folder-next').disabled = busy || offset + LIST_LIMIT >= total;
    } catch (error) { if (token === listToken) message(`Cannot browse folder: ${error.message}`); }
  }
  byId('choose-photo-folder').disabled = !available;
  byId('choose-photo-folder').addEventListener('click', async () => {
    if (!available || busy) return;
    try {
      const grant = await files.requestDirectory({persistence:'persistent'});
      if (!grant) return;
      await assets.restore(files,message);
      activeGrant = grant; grants = await files.getGrants(); updateGrants();
      byId('photo-browser').hidden = false;
      message('Choose an image below to assign it to the selected artwork.'); await browse();
    } catch (error) { message(`Folder permission failed: ${error.message}`); }
  });
  byId('restore-photo-access').addEventListener('click',async()=>{
    if(busy||assets.pending)return;
    const savedIds=new Set(Object.values(assets.metadata()).map(item=>item.grantId));
    const missing=grants.find(grant=>savedIds.has(grant.grantId)&&!grant.available);
    try {
      if(missing&&files.restorePermission&&typeof window.showDirectoryPicker==='function') await files.restorePermission(missing.grantId);
      else {const selected=await files.requestDirectory({persistence:'persistent'});if(!selected)return;}
      await restore();
    } catch(error){message(`${error.message} You can also choose the original photo folder again.`);}
  });
  byId('photo-grants').addEventListener('change', () => { activeGrant = grants.find(grant => grant.grantId === byId('photo-grants').value); browse(); });
  byId('revoke-folder').addEventListener('click', async () => {
    if (busy || !activeGrant) return;
    const finishOperation=assets.beginFileOperation();
    try {
      await files.revoke(activeGrant.grantId);
      grants = await files.getGrants(); activeGrant = grants.find(grant => grant.grantId === activeGrant.grantId) || null;
      updateGrants();
      for (const key of ASSET_KEYS) { const record = assets.get(key); if (record && !grants.find(grant => grant.grantId === record.metadata.grantId)?.available) { record.bitmap?.close(); record.bitmap = null; record.error = 'Folder permission revoked or unavailable.'; assets.setCrop(key, record.metadata.crop); } }
      await browse(); message('Folder grant revoked. Saved photo references remain; reselect and reassign to restore.');
    } catch (error) { message(error.message); }
    finally { finishOperation(); }
  });
  byId('folder-parent').addEventListener('click', () => browse(relativeFolder.split('/').slice(0,-1).join('/')));
  byId('folder-prev').addEventListener('click', () => browse(relativeFolder, Math.max(0,offset-LIST_LIMIT)));
  byId('folder-next').addEventListener('click', () => browse(relativeFolder, offset+LIST_LIMIT));
  byId('photo-target').addEventListener('change', () => { const nextTarget = byId('photo-target').value; finishDrag(); flushCrop(); target = nextTarget; selectTarget(target); render(); });
  function flushCrop() {
    cancelAnimationFrame(cropFrameId); cropFrameId = 0;
    if (queuedCrop) { const {key,crop,record} = queuedCrop; queuedCrop = null; if (assets.get(key)===record) assets.setCrop(key,crop); }
  }
  function queueCrop(crop) {
    queuedCrop = {key:target,crop,record:assets.get(target)};
    if (!cropFrameId) cropFrameId = requestAnimationFrame(flushCrop);
  }
  function constrainMovement(rectangle, state) {
    const aw = state.width+state.bleed*2, ah = state.height+state.bleed*2;
    const visibleX = Math.min(MIN_VISIBLE_INCHES,rectangle.width/2,aw/2), visibleY = Math.min(MIN_VISIBLE_INCHES,rectangle.height/2,ah/2);
    return {...rectangle,x:clamp(rectangle.x,-rectangle.width+visibleX,aw-visibleX),y:clamp(rectangle.y,-rectangle.height+visibleY,ah-visibleY)};
  }
  function resizeRectangle(rectangle, crop, state, handle, dx, dy, sourceWidth, sourceHeight) {
    const horizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    let width = rectangle.width, height = rectangle.height;
    if (crop.aspectLocked) {
      // Project corner motion onto the source-aspect diagonal; edges use their active axis.
      const proposed = horizontal && vertical
        ? ((width+horizontal*dx)*width+(height+vertical*dy)*height)/(width*width+height*height)
        : horizontal ? (width+horizontal*dx)/width : (height+vertical*dy)/height;
      const factor = clamp(proposed,Math.max(MIN_PHOTO_SCALE/crop.zoomX,MIN_PHOTO_SCALE/crop.zoomY),Math.min(MAX_PHOTO_SCALE/crop.zoomX,MAX_PHOTO_SCALE/crop.zoomY));
      width *= factor; height *= factor;
    } else {
      const base = photoPlacement(sourceWidth,sourceHeight,crop,state).baseScale;
      if (horizontal) width = clamp(width+horizontal*dx,sourceWidth*base*MIN_PHOTO_SCALE,sourceWidth*base*MAX_PHOTO_SCALE);
      if (vertical) height = clamp(height+vertical*dy,sourceHeight*base*MIN_PHOTO_SCALE,sourceHeight*base*MAX_PHOTO_SCALE);
    }
    const x = horizontal < 0 ? rectangle.x+rectangle.width-width : horizontal > 0 ? rectangle.x : rectangle.x+(rectangle.width-width)/2;
    const y = vertical < 0 ? rectangle.y+rectangle.height-height : vertical > 0 ? rectangle.y : rectangle.y+(rectangle.height-height)/2;
    return constrainMovement({x,y,width,height},state);
  }
  function snapResize(rectangle, original, crop, state, handle, view) {
    const horizontal=handle.includes('e')?1:handle.includes('w')?-1:0,vertical=handle.includes('s')?1:handle.includes('n')?-1:0;
    const left=state.bleed,top=state.bleed,right=left+state.width,bottom=top+state.height;
    const xTargets=[{value:left,label:'left edge'},{value:(left+right)/2,label:'center'},{value:right,label:'right edge'}];
    const yTargets=[{value:top,label:'top edge'},{value:(top+bottom)/2,label:'middle'},{value:bottom,label:'bottom edge'}];
    const minFactor=Math.max(MIN_PHOTO_SCALE/crop.zoomX,MIN_PHOTO_SCALE/crop.zoomY),maxFactor=Math.min(MAX_PHOTO_SCALE/crop.zoomX,MAX_PHOTO_SCALE/crop.zoomY);
    const candidates=[];
    if(horizontal) for(const target of xTargets) {
      const factor=horizontal>0?(target.value-original.x)/original.width:(original.x+original.width-target.value)/original.width;
      const edge=horizontal>0?rectangle.x+rectangle.width:rectangle.x;
      const distance=Math.abs(target.value-edge)*view.scale;
      const nextWidth=horizontal>0?target.value-original.x:original.x+original.width-target.value;
      if(crop.aspectLocked ? factor>=minFactor&&factor<=maxFactor&&distance<=10 : nextWidth>=original.width*MIN_PHOTO_SCALE/crop.zoomX&&nextWidth<=original.width*MAX_PHOTO_SCALE/crop.zoomX&&distance<=10)candidates.push({factor,distance,axis:'x',at:target.value,label:target.label});
    }
    if(vertical) for(const target of yTargets) {
      const factor=vertical>0?(target.value-original.y)/original.height:(original.y+original.height-target.value)/original.height;
      const edge=vertical>0?rectangle.y+rectangle.height:rectangle.y;
      const distance=Math.abs(target.value-edge)*view.scale;
      const nextHeight=vertical>0?target.value-original.y:original.y+original.height-target.value;
      if(crop.aspectLocked ? factor>=minFactor&&factor<=maxFactor&&distance<=10 : nextHeight>=original.height*MIN_PHOTO_SCALE/crop.zoomY&&nextHeight<=original.height*MAX_PHOTO_SCALE/crop.zoomY&&distance<=10)candidates.push({factor,distance,axis:'y',at:target.value,label:target.label});
    }
    if(crop.aspectLocked) {
      const best=candidates.sort((a,b)=>a.distance-b.distance)[0];
      if(!best)return {rectangle,guides:[]};
      const factor=best.factor,width=original.width*factor,height=original.height*factor;
      const x=horizontal<0?original.x+original.width-width:horizontal>0?original.x:original.x+(original.width-width)/2;
      const y=vertical<0?original.y+original.height-height:vertical>0?original.y:original.y+(original.height-height)/2;
      const snapped=constrainMovement({x,y,width,height},state);
      const aligned=best.axis==='x'?(horizontal>0?snapped.x+snapped.width:snapped.x):(vertical>0?snapped.y+snapped.height:snapped.y);
      return {rectangle:snapped,guides:Math.abs(aligned-best.at)*view.scale<.5?[{axis:best.axis,at:best.at,label:best.label}]:[]};
    }
    let {x,y,width,height}=rectangle;const guides=[];
    for(const axis of ['x','y']) {
      const active=axis==='x'?horizontal:vertical;if(!active)continue;
      const best=candidates.filter(candidate=>candidate.axis===axis).sort((a,b)=>a.distance-b.distance)[0];if(!best)continue;
      if(axis==='x') {width=active>0?best.at-original.x:original.x+original.width-best.at;x=active<0?best.at:original.x;}
      else {height=active>0?best.at-original.y:original.y+original.height-best.at;y=active<0?best.at:original.y;}
      if(width>0&&height>0)guides.push({axis,at:best.at,label:best.label});
    }
    const snapped=constrainMovement({x,y,width,height},state);
    return {rectangle:snapped,guides:guides.filter(guide=>Math.abs((guide.axis==='x'?(horizontal>0?snapped.x+snapped.width:snapped.x):(vertical>0?snapped.y+snapped.height:snapped.y))-guide.at)*view.scale<.5)};
  }
  function fitViewport(state, placement, width, height) {
    const artworkWidth=state.width+state.bleed*2,artworkHeight=state.height+state.bleed*2,centerX=artworkWidth/2,centerY=artworkHeight/2;
    const extentX=Math.max(artworkWidth/2,placement?Math.abs(placement.x-centerX):0,placement?Math.abs(placement.x+placement.width-centerX):0);
    const extentY=Math.max(artworkHeight/2,placement?Math.abs(placement.y-centerY):0,placement?Math.abs(placement.y+placement.height-centerY):0);
    const scale=Math.max(Number.EPSILON,Math.min(Math.max(1,width/2-WORKSPACE_PADDING)/extentX,Math.max(1,height/2-WORKSPACE_PADDING)/extentY));
    return {scale,left:width/2-centerX*scale,top:height/2-centerY*scale,width,height};
  }
  function snapMovement(rectangle,state,view) {
    const left=state.bleed,top=state.bleed,right=left+state.width,bottom=top+state.height,threshold=10/view.scale;
    const candidatesX=[{value:left,kind:'left edge',edge:'left'},{value:(left+right)/2,kind:'center',edge:'center'},{value:right,kind:'right edge',edge:'right'}];
    const candidatesY=[{value:top,kind:'top edge',edge:'top'},{value:(top+bottom)/2,kind:'middle',edge:'middle'},{value:bottom,kind:'bottom edge',edge:'bottom'}];
    const near=(values,coordinates)=>values.map(target=>coordinates.map(source=>({delta:target.value-source.value,kind:target.kind,at:target.value})).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0]).filter(candidate=>Math.abs(candidate.delta)<=threshold).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];
    const snapX=near(candidatesX,[{value:rectangle.x},{value:rectangle.x+rectangle.width/2},{value:rectangle.x+rectangle.width}]);
    const snapY=near(candidatesY,[{value:rectangle.y},{value:rectangle.y+rectangle.height/2},{value:rectangle.y+rectangle.height}]);
    return {rectangle:{...rectangle,x:rectangle.x+(snapX?.delta||0),y:rectangle.y+(snapY?.delta||0)},guides:[...(snapX?[{axis:'x',at:snapX.at,label:snapX.kind}]:[]),...(snapY?[{axis:'y',at:snapY.at,label:snapY.kind}]:[])]};
  }
  function pointInArtwork(event, view = viewport) {
    const bounds = canvas.getBoundingClientRect();
    return {x:((event.clientX-bounds.left)*view.width/bounds.width-view.left)/view.scale,
      y:((event.clientY-bounds.top)*view.height/bounds.height-view.top)/view.scale};
  }
  function inside(rectangle, point) {
    return point.x>=rectangle.x && point.y>=rectangle.y && point.x<=rectangle.x+rectangle.width && point.y<=rectangle.y+rectangle.height;
  }
  function hitHandle(event, rectangle) {
    // Resolve the nearest 44px target before DOM overlap can hide a thin image's handles.
    const point = pointInArtwork(event), positions = {nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5]};
    return Object.entries(positions).map(([name,[x,y]])=>({name,distance:Math.max(Math.abs(point.x-rectangle.x-x*rectangle.width),Math.abs(point.y-rectangle.y-y*rectangle.height))*viewport.scale}))
      .filter(hit=>hit.distance<=HANDLE_SIZE/2).sort((a,b)=>a.distance-b.distance)[0]?.name || null;
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const previous = drag; drag = null;
    if (cancel) {
      cancelAnimationFrame(cropFrameId); cropFrameId = 0; queuedCrop = null;
      if (assets.get(previous.key)===previous.record) assets.setCrop(previous.key,previous.crop);
    } else flushCrop();
    if (workspace.hasPointerCapture(previous.pointer)) workspace.releasePointerCapture(previous.pointer);
    canvas.style.cursor = 'grab';
    if (cancel || previous.handle) snapGuides = [];
    render();
  }
  byId('center-crop').addEventListener('click', () => {
    if (busy || !assets.get(target)?.bitmap) return;
    finishDrag(); flushCrop(); snapGuides=[]; assets.setCrop(target,{...CENTER_CROP});
  });
  byId('remove-photo').addEventListener('click', () => {
    if (busy) return;
    finishDrag(); flushCrop(); snapGuides=[]; assets.remove(target);
  });
  byId('crop-aspect-lock').addEventListener('click', () => {
    const record = assets.get(target); if (busy || !record?.bitmap) return;
    finishDrag(); flushCrop();
    const crop = normalizeCrop(record.metadata.crop);
    if (crop.aspectLocked) { assets.setCrop(target,{...crop,aspectLocked:false}); return; }
    // Relocking removes stretch while keeping the image center and area unchanged.
    const state = getState(), rectangle = photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state);
    const uniform = Math.sqrt(crop.zoomX*crop.zoomY), width = rectangle.width*uniform/crop.zoomX, height = rectangle.height*uniform/crop.zoomY;
    const next = cropForPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state,
      {...rectangle,x:rectangle.x+(rectangle.width-width)/2,y:rectangle.y+(rectangle.height-height)/2,width,height});
    assets.setCrop(target,{...next,aspectLocked:true});
  });
  workspace.addEventListener('pointerdown', event => {
    const record = assets.get(target);
    if (busy || drag || !record?.bitmap || !viewport || event.button!==0) return;
    flushCrop();
    snapGuides=[];
    const state = {...getState()}, crop = normalizeCrop(record.metadata.crop);
    const rectangle = photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state);
    const handle = hitHandle(event,rectangle), point = pointInArtwork(event);
    if (!handle && !inside(rectangle,point)) return;
    event.preventDefault();
    const focus = handle ? handles.find(button=>button.dataset.cropHandle===handle) : canvas;
    focus?.focus({preventScroll:true});
    drag = {pointer:event.pointerId,start:point,crop,key:target,record,rectangle,state,handle,view:{...viewport},sourceWidth:record.metadata.sourceWidth,sourceHeight:record.metadata.sourceHeight};
    workspace.setPointerCapture(event.pointerId);
    canvas.style.cursor = handle ? RESIZE_CURSORS[handle] : 'grabbing';
  });
  workspace.addEventListener('pointermove', event => {
    if (busy || !viewport) return;
    if (!drag) {
      const record = assets.get(target); if (!record?.bitmap) {canvas.style.cursor='default';return;}
      const rectangle = photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,record.metadata.crop,getState());
      const handle = hitHandle(event,rectangle);
      canvas.style.cursor = handle ? RESIZE_CURSORS[handle] : inside(rectangle,pointInArtwork(event)) ? 'grab' : 'default';
      return;
    }
    if (event.pointerId!==drag.pointer || drag.key!==target) return;
    event.preventDefault();
    const point = pointInArtwork(event,drag.view), dx = point.x-drag.start.x, dy = point.y-drag.start.y;
    const rectangle = drag.handle
      ? resizeRectangle(drag.rectangle,drag.crop,drag.state,drag.handle,dx,dy,drag.sourceWidth,drag.sourceHeight)
      : constrainMovement({...drag.rectangle,x:drag.rectangle.x+dx,y:drag.rectangle.y+dy},drag.state);
    if (drag.handle) {
      const snapped=snapResize(rectangle,drag.rectangle,drag.crop,drag.state,drag.handle,drag.view);
      snapGuides=snapped.guides;
      queueCrop(cropForPlacement(drag.sourceWidth,drag.sourceHeight,drag.crop,drag.state,snapped.rectangle));
    } else {
      const snapped=snapMovement(rectangle,drag.state,drag.view);
      snapGuides=snapped.guides;
      queueCrop(cropForPlacement(drag.sourceWidth,drag.sourceHeight,drag.crop,drag.state,snapped.rectangle));
    }
  });
  workspace.addEventListener('pointerup', event => {if (event.pointerId===drag?.pointer) finishDrag();});
  workspace.addEventListener('pointercancel', event => {if (event.pointerId===drag?.pointer) finishDrag(true);});
  workspace.addEventListener('lostpointercapture', event => {if (event.pointerId===drag?.pointer) finishDrag();});
  workspace.addEventListener('keydown', event => {
    if (event.key==='Escape' && drag) {event.preventDefault();finishDrag(true);return;}
    const directions = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}, direction = directions[event.key];
    const record = assets.get(target);
    if (!direction || busy || drag || !record?.bitmap || !viewport) return;
    event.preventDefault(); flushCrop();
    const state = getState(), crop = normalizeCrop(record.metadata.crop), step = (event.shiftKey?KEYBOARD_LARGE_STEP:KEYBOARD_STEP)/viewport.scale;
    const rectangle = photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state), handle = event.target.dataset.cropHandle;
    let next;
    if (handle) {
      const resized=resizeRectangle(rectangle,crop,state,handle,direction[0]*step,direction[1]*step,record.metadata.sourceWidth,record.metadata.sourceHeight);
      const snapped=snapResize(resized,rectangle,crop,state,handle,viewport);next=snapped.rectangle;snapGuides=snapped.guides;
    }
    else {
      const moved=constrainMovement({...rectangle,x:rectangle.x+direction[0]*step,y:rectangle.y+direction[1]*step},state);
      const snapped=snapMovement(moved,state,viewport);next=snapped.rectangle;snapGuides=snapped.guides;
    }
    assets.setCrop(target,cropForPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state,next));
  });
  function render() {
    renderMetadata();
    const state = getState(), record = assets.get(target), crop = normalizeCrop(queuedCrop?.key===target && queuedCrop.record===record?queuedCrop.crop:record?.metadata.crop);
    const geometry=`${state.width}:${state.height}:${state.bleed}`;
    if (lastGeometry && geometry!==lastGeometry) snapGuides=[];
    lastGeometry=geometry;
    if (drag && (!record?.bitmap || drag.key!==target || drag.record!==record)) {finishDrag(true);return;}
    byId('photo-target').value = target;
    const endSpreadNote=byId('photo-end-spread-note'),endSelected=!state.previewClosed&&['opening','closing'].includes(state.endSpread);
    endSpreadNote.hidden=!endSelected;
    endSpreadNote.textContent=endSelected?`${state.endSpread==='opening'?'Opening':'Closing'} is a solid-color spread with no photo slot. The photo editor keeps its explicitly selected artwork: ${assetLabel(target)}. Assignments and crop edits affect only that named slot; set end-spread color in Layout modifier.`:'';
    const placement = record?.bitmap ? photoPlacement(record.metadata.sourceWidth,record.metadata.sourceHeight,crop,state) : null;
    const cssWidth = workspace.clientWidth, cssHeight = workspace.clientHeight;
    if (cssWidth>0 && cssHeight>0) {
      viewport = drag ? drag.view : fitViewport(state,placement,cssWidth,cssHeight);
      const ratio = Math.min(window.devicePixelRatio || 1,2);
      canvas.width = Math.max(1,Math.round(cssWidth*ratio)); canvas.height = Math.max(1,Math.round(cssHeight*ratio));
      context.setTransform(canvas.width/cssWidth,0,0,canvas.height/cssHeight,0,0);
      context.fillStyle = '#eee'; context.fillRect(0,0,cssWidth,cssHeight);
      context.save(); context.translate(viewport.left,viewport.top); context.scale(viewport.scale,viewport.scale);
      context.fillStyle = '#fff'; context.fillRect(0,0,state.width+2*state.bleed,state.height+2*state.bleed);
      if (placement) drawMappedPhoto(context,record.bitmap,placement);
      context.restore();
      const left = viewport.left+state.bleed*viewport.scale, top = viewport.top+state.bleed*viewport.scale;
      const width = state.width*viewport.scale, height = state.height*viewport.scale;
      context.fillStyle = 'rgba(238,238,238,.72)';
      context.fillRect(0,0,cssWidth,top);context.fillRect(0,top+height,cssWidth,cssHeight-top-height);
      context.fillRect(0,top,left,height);context.fillRect(left+width,top,cssWidth-left-width,height);
      context.strokeStyle = '#111'; context.lineWidth = 1;
      context.setLineDash([4,4]);context.strokeRect(viewport.left,viewport.top,(state.width+2*state.bleed)*viewport.scale,(state.height+2*state.bleed)*viewport.scale);
      context.setLineDash([]);context.strokeRect(left,top,width,height);
       if (snapGuides.length && placement) {
         context.save();context.setLineDash([5,4]);
         for (const guide of snapGuides) {
           context.beginPath();
           if (guide.axis==='x') {const x=viewport.left+guide.at*viewport.scale;context.moveTo(x,top);context.lineTo(x,top+height);}
           else {const y=viewport.top+guide.at*viewport.scale;context.moveTo(left,y);context.lineTo(left+width,y);}
           context.strokeStyle='#fff';context.lineWidth=3;context.stroke();
           context.strokeStyle='#111';context.lineWidth=1;context.stroke();
         }
         context.restore();
       }
      if (!placement) {
        context.fillStyle='#555';context.textAlign='center';context.font='12px Arial';
        context.fillText(record?'Photo unavailable — reselect its folder':'Choose a photograph',left+width/2,top+height/2);
      } else {
        boundingBox.style.left = `${viewport.left+placement.x*viewport.scale}px`; boundingBox.style.top = `${viewport.top+placement.y*viewport.scale}px`;
        boundingBox.style.width = `${placement.width*viewport.scale}px`; boundingBox.style.height = `${placement.height*viewport.scale}px`;
      }
    }
    const locked=busy || assets.pending>0;
    boundingBox.hidden = !placement;
    workspace.setAttribute('aria-busy',String(locked));canvas.setAttribute('aria-disabled',String(locked || !placement));canvas.tabIndex=locked?-1:0;
    byId('choose-photo-folder').disabled=!available || locked;
    byId('restore-photo-access').disabled=!available || locked;
    byId('photo-target').disabled=locked;
    byId('photo-grants').disabled=locked;
    byId('revoke-folder').disabled=locked || !activeGrant;
    byId('folder-parent').disabled=locked || !relativeFolder;
    byId('folder-prev').disabled=locked || offset===0;
    byId('folder-next').disabled=locked || offset+LIST_LIMIT>=total;
    byId('photo-file-list').querySelectorAll('button').forEach(button=>{button.disabled=locked || button.dataset.blocked==='true';});
    byId('photo-name').textContent = record ? `${record.metadata.grantName} / ${record.metadata.relativePath}` : 'No photograph assigned';
    const dpi = record?.bitmap ? effectiveDpi({...record.metadata,crop},state) : 0;
    const spec=printRasterSpec(state);
    byId('photo-resolution').textContent = record?.bitmap ? `${record.metadata.sourceWidth} × ${record.metadata.sourceHeight} original px · ${Math.floor(dpi)} effective DPI (minimum axis)${dpi<TARGET_PPI?' — below the 300 PPI target; resizing adds no detail':''} · current print target ${spec.width} × ${spec.height} px` : record?.error || '';
    const gaps = placement && photoHasGaps({...record.metadata,crop},state);
    const snapLabel=snapGuides.length?` Snapped: ${snapGuides.map(guide=>guide.label).join(' · ')}.`:'';
    byId('crop-transform-status').textContent = placement
      ? `${crop.aspectLocked?'Locked · proportional resize':'Unlocked · independent width and height'} · image ${placement.width.toFixed(2)} × ${placement.height.toFixed(2)} in.${snapLabel}${gaps?' Warning: image does not cover the full page and bleed; uncovered areas print white.':' Full page and bleed covered.'}` : '';
    byId('crop-aspect-lock').setAttribute('aria-pressed',String(crop.aspectLocked));
    byId('crop-aspect-label').textContent = crop.aspectLocked?'Aspect ratio: locked':'Aspect ratio: unlocked';
    byId('crop-aspect-lock').disabled = locked || !placement;
    for (const handle of handles) handle.disabled=locked || !placement;
    byId('center-crop').disabled=locked || !record?.bitmap; byId('remove-photo').disabled=locked || !record;
  }
  const workspaceObserver = new ResizeObserver(() => {if (drag) finishDrag(); else render();});
  workspaceObserver.observe(workspace);
  if (!picaAvailable()) message('Pica 10.0.3 failed to load. Photo assignment and PDF export are disabled; reopen with access to the approved Pica script. Saved originals and crops are preserved.');
  else if (!available) message('Local photo access is unavailable. Use a browser with folder selection, image decoding, and IndexedDB support, and check that the photo resizer loaded. No file-picker fallback is used.');
  async function restore() {
    if (!available) {render(); return;}
    try {
      await assets.restore(files,message);
      grants = await files.getGrants();
      activeGrant = grants.find(grant => grant.available) || grants[0] || null;
      updateGrants();
      byId('restore-photo-access').hidden=!ASSET_KEYS.some(key=>assets.get(key)&&!assets.get(key).bitmap);
      if (activeGrant?.available) {byId('photo-browser').hidden=false;await browse();}
      const unavailable = ASSET_KEYS.filter(key=>assets.get(key) && !assets.get(key).bitmap);
      if (unavailable.length) message(`Cannot restore: ${unavailable.map(assetLabel).join(', ')}. Use Restore photo access or choose the original folder again. Saved assignments and crops are kept.`);
      else message(ASSET_KEYS.some(key=>assets.get(key)?.bitmap)?'Photo references and crops restored. Originals stay in your photo folder.':'Choose a photo folder and assign an image.');
      render();
    } catch(error) {message(`Could not restore directory permissions: ${error.message}`);}
  }
  render();
  return { files:available?files:null, restore, render,
    setTarget(key) { if(!ASSET_KEYS.includes(key)||key==='back-cover')return; if (target!==key) {finishDrag();flushCrop();snapGuides=[];target=key;} render(); },
    setBusy(value) {if(value){finishDrag();flushCrop();}busy=value;render();},
    dispose() {finishDrag();flushCrop();workspaceObserver.disconnect();cancelAnimationFrame(cropFrameId);} };
}
