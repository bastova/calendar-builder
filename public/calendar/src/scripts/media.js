import { reportStorageFailure } from './browser-storage.js';
import { ASSET_KEYS, assetLabel } from './layout.js';

export const FILE_LIMIT = 256 * 1024 * 1024;
const STORAGE_KEY = 'calendar-layout-2027-39be18a4-712d-45cd-a061-f492bec78230:photo-assets-v1';
const LEGACY_STORAGE_KEY = 'calendar-layout-photo-assets-v1';
const PREVIEW_EDGE = 768;
const MAX_SOURCE_PIXELS = 150000000;
const MAX_SOURCE_EDGE = 32768;
const MAX_DECODE_PIXELS = 20 * 1024 * 1024;
const MAX_DECODE_EDGE = 8192;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i;
export const TARGET_PPI = 300;
const MAX_RASTER_PIXELS = 20 * 1024 * 1024;
const MAX_RASTER_EDGE = 6000;
const RESIZE_OVERSAMPLE = 2;
const PICA_FILTER = 'mks2013';
let resizer;

/** Fail closed when the approved Pica browser script is unavailable. */
export function picaAvailable() { return typeof window.pica === 'function'; }

/** A single JS-only instance avoids workers, WASM and runtime dependency requests. */
function requireResizer() {
  if (!picaAvailable()) throw new Error('Pica resizing is unavailable. Reopen the Proof with access to its approved Pica 10.0.3 script; photo assignment and PDF export are disabled.');
  if (!resizer) resizer = window.pica({features:['js'],tile:1024,concurrency:1});
  return resizer;
}

/** Return dimensions inside both allocation caps, without changing the intended aspect. */
function boundedDimensions(width, height, edge, pixels) {
  const scale = Math.min(1,edge/Math.max(width,height),Math.sqrt(pixels/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

/** Exact full-photo raster dimensions; never include imposition panels or crop-mark slug. */
export function printRasterSpec(state) {
  const artworkWidth = state.width+2*state.bleed, artworkHeight = state.height+2*state.bleed;
  const preferredWidth = Math.ceil(artworkWidth*TARGET_PPI), preferredHeight = Math.ceil(artworkHeight*TARGET_PPI);
  const size = boundedDimensions(preferredWidth,preferredHeight,MAX_RASTER_EDGE,MAX_RASTER_PIXELS);
  return {...size,preferredWidth,preferredHeight,ppi:Math.min(size.width/artworkWidth,size.height/artworkHeight)};
}

/** Pica 10 supports ImageBitmap directly; the caller owns the source and returned canvas. */
export async function resizeImageBitmapToCanvas(bitmap, targetWidth, targetHeight) {
  const instance = requireResizer();
  if (![targetWidth,targetHeight].every(value=>Number.isInteger(value)&&value>0) || Math.max(targetWidth,targetHeight)>MAX_DECODE_EDGE || targetWidth*targetHeight>MAX_RASTER_PIXELS) throw new Error('Resize dimensions exceed the bounded raster budget.');
  const canvas = document.createElement('canvas'); canvas.width=targetWidth;canvas.height=targetHeight;
  try { await instance.resize(bitmap,canvas,{filter:PICA_FILTER});return canvas; }
  catch (error) {canvas.width=canvas.height=1;throw new Error(`Pica resize failed: ${error.message}`);}
}

/** Report actual decoded detail using original dimensions and the unchanged crop mapping. */
export function decodedPhotoDpi(bitmap, metadata, state) {
  const frame=cropFrame(metadata.sourceWidth,metadata.sourceHeight,metadata.crop,state);
  return Math.min(frame.width*bitmap.width/metadata.sourceWidth/frame.artworkWidth,frame.height*bitmap.height/metadata.sourceHeight/frame.artworkHeight);
}

/** Crop in original-source coordinates first, then Pica-resample bounded artwork to print size. */
export async function printPhotoCanvas(bitmap, metadata, state, onProgress = ()=>{}) {
  const spec=printRasterSpec(state),decodedPpi=decodedPhotoDpi(bitmap,metadata,state);
  // Never allocate a zoomed or independently stretched full-source canvas: clip to artwork first.
  const factor=Math.max(1,Math.min(RESIZE_OVERSAMPLE,decodedPpi/spec.ppi));
  const workSize=boundedDimensions(Math.ceil(spec.width*factor),Math.ceil(spec.height*factor),MAX_RASTER_EDGE,MAX_RASTER_PIXELS);
  const work=document.createElement('canvas');work.width=workSize.width;work.height=workSize.height;
  try {
    onProgress(`Framing ${work.width} × ${work.height} px against the saved crop…`);
    drawPhoto(work.getContext('2d'),bitmap,metadata.crop,state,work.width,work.height,false,metadata);
    onProgress(`Pica resizing cropped artwork to ${spec.width} × ${spec.height} px · target ${TARGET_PPI} PPI…`);
    const canvas=await resizeImageBitmapToCanvas(work,spec.width,spec.height);
    return {canvas,spec,decodedPpi};
  } finally {work.width=work.height=1;}
}

/** Decode an aspect-preserving source sample for this crop, capped before Pica sees any pixels. */
async function decodeForPrint(blob, info, crop, state, targetWidth, targetHeight, placement = null) {
  // Generated thumbnails may use original-source fill/fit or a transformed monthly trim.
  // Sampling uses their exact source placement, never a stale monthly crop.
  const frame=placement?{width:info.width*placement.artworkWidth/placement.width,height:info.height*placement.artworkHeight/placement.height}:cropFrame(info.width,info.height,crop,state);
  // Both source axes must supply the crop, including unlocked stretch; caps may reduce detail.
  const scale=Math.min(1,RESIZE_OVERSAMPLE*Math.max(targetWidth/frame.width,targetHeight/frame.height));
  return decodeImage(blob,info,Math.min(MAX_DECODE_EDGE,Math.ceil(Math.max(info.width,info.height)*scale)),MAX_DECODE_PIXELS);
}

/** Retain only a full-source 768px Pica preview so future edits do not lose off-page artwork. */
async function previewBitmap(bitmap) {
  const size=boundedDimensions(bitmap.width,bitmap.height,PREVIEW_EDGE,PREVIEW_EDGE*PREVIEW_EDGE);
  const canvas=await resizeImageBitmapToCanvas(bitmap,size.width,size.height);
  try {return await createImageBitmap(canvas);}
  finally {canvas.width=canvas.height=1;}
}
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const safeRelativePath = path => typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && !/^[a-z]:/i.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
export const isPhotoEntry = entry => entry.kind === 'file' && safeRelativePath(entry.relativePath) && IMAGE_EXTENSION.test(entry.name);
const cropValue = (value, fallback) => Number.isFinite(Number(value)) && value !== null && value !== undefined ? Number(value) : fallback;
export const MIN_PHOTO_SCALE = .05;
export const MAX_PHOTO_SCALE = 16;
const MAX_PHOTO_OFFSET = 1e7;
export const CENTER_CROP = Object.freeze({ x:.5, y:.5, zoom:1, zoomX:1, zoomY:1, offsetX:0, offsetY:0, aspectLocked:true });

/** Migrate legacy fill-relative crops without changing their placement or source aspect. */
export function normalizeCrop(crop) {
  const zoom = clamp(cropValue(crop?.zoom,1),1,4);
  let zoomX = clamp(cropValue(crop?.zoomX,zoom),MIN_PHOTO_SCALE,MAX_PHOTO_SCALE);
  let zoomY = clamp(cropValue(crop?.zoomY,zoom),MIN_PHOTO_SCALE,MAX_PHOTO_SCALE);
  const aspectLocked = typeof crop?.aspectLocked==='boolean' ? crop.aspectLocked : zoomX===zoomY;
  if (aspectLocked && zoomX!==zoomY) zoomX = zoomY = Math.sqrt(zoomX*zoomY);
  return {
    x:clamp(cropValue(crop?.x,.5),0,1), y:clamp(cropValue(crop?.y,.5),0,1), zoom, zoomX, zoomY,
    offsetX:clamp(cropValue(crop?.offsetX,0),-MAX_PHOTO_OFFSET,MAX_PHOTO_OFFSET),
    offsetY:clamp(cropValue(crop?.offsetY,0),-MAX_PHOTO_OFFSET,MAX_PHOTO_OFFSET),
    aspectLocked
  };
}

function exifOrientation(view, offset, end) {
  try {
    if (view.getUint32(offset, false) === 0x45786966) offset += 6;
    const little = view.getUint16(offset, false) === 0x4949;
    if (view.getUint16(offset + 2, little) !== 42) return 1;
    const directory = offset + view.getUint32(offset + 4, little);
    if (directory + 2 > end) return 1;
    const entries = Math.min(view.getUint16(directory, little), 256);
    for (let index = 0; index < entries; index++) {
      const position = directory + 2 + index * 12;
      if (position + 12 > end) break;
      if (view.getUint16(position, little) === 0x0112) return view.getUint16(position + 8, little);
    }
  } catch {}
  return 1;
}

/** Inspect supported image headers before decoding; reject decompression-sized surprises. */
function imageInfo(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, orientation = 1, mime = '';
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    width = view.getUint32(16); height = view.getUint32(20); mime = 'image/png';
    for (let position = 8; position + 12 <= bytes.length;) {
      const length = view.getUint32(position), type = view.getUint32(position + 4);
      if (position + length + 12 > bytes.length) break;
      if (type === 0x65584966) orientation = exifOrientation(view, position + 8, position + 8 + length);
      position += length + 12;
    }
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg';
    for (let position = 2; position + 4 < bytes.length;) {
      if (bytes[position++] !== 0xff) continue;
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) break;
      if (marker === 0xe1) orientation = exifOrientation(view, position + 2, position + length);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker) && length >= 7) {
        height = view.getUint16(position + 3); width = view.getUint16(position + 5);
      }
      position += length;
    }
  } else if (bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    mime = 'image/webp';
    for (let position = 12; position + 8 <= bytes.length;) {
      const type = view.getUint32(position), length = view.getUint32(position + 4, true), start = position + 8;
      if (start + length > bytes.length) break;
      if (type === 0x56503858 && length >= 10) {
        width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
        height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
      } else if (!width && type === 0x56503820 && length >= 10) {
        width = view.getUint16(start + 6, true) & 0x3fff; height = view.getUint16(start + 8, true) & 0x3fff;
      } else if (!width && type === 0x5650384c && length >= 5) {
        const bits = view.getUint32(start + 1, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      } else if (type === 0x45584946) orientation = exifOrientation(view, start, start + length);
      position = start + length + (length % 2);
    }
  }
  if (!width || !height || width * height > MAX_SOURCE_PIXELS || Math.max(width, height) > MAX_SOURCE_EDGE) throw new Error('Unsupported or oversized image. Use JPEG, PNG or WebP up to 150 megapixels / 32,768 px per edge. Large images may still exceed the browser decoder memory budget.');
  if (orientation >= 5 && orientation <= 8) [width, height] = [height, width];
  return { width, height, mime };
}

async function readImage(files, grantId, relativePath) {
  if (!safeRelativePath(relativePath)) throw new Error('Invalid relative photo path.');
  const entry = await files.stat(grantId, relativePath);
  if (!isPhotoEntry(entry)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (!Number.isFinite(entry.size) || entry.size > FILE_LIMIT || entry.size <= 0) throw new Error('Choose a nonempty image up to 256 MiB.');
  const blob = files.readFile ? await files.readFile(grantId,relativePath) : new Blob([await files.readBytes(grantId,relativePath)]);
  if (blob.size > FILE_LIMIT) throw new Error('Image exceeds the 256 MiB processing limit.');
  const after = await files.stat(grantId, relativePath);
  if (entry.size !== after.size || entry.modifiedAt !== after.modifiedAt || blob.size !== entry.size) throw new Error('Photo changed while being read. Reselect it before exporting.');
  // Read image headers, not a second full-size copy of the compressed original.
  const info = imageInfo(new Uint8Array(await blob.slice(0,2*1024*1024).arrayBuffer()));
  return { blob, info, entry };
}

async function decodeImage(blob, info, edge, pixelLimit) {
  if (typeof createImageBitmap !== 'function') throw new Error('Bounded image decoding is unavailable in this browser.');
  const {width,height}=boundedDimensions(info.width,info.height,edge,pixelLimit);
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  if (bitmap.width * bitmap.height > pixelLimit || Math.max(bitmap.width, bitmap.height) > edge) { bitmap.close(); throw new Error('Browser did not honor the bounded decode size.'); }
  return bitmap;
}

/** One source-pixel → artwork-inch mapping shared by editor, covers, scene and PDF. */
export function photoPlacement(width, height, crop, state) {
  const normalized = normalizeCrop(crop);
  const artworkWidth = state.width + state.bleed * 2, artworkHeight = state.height + state.bleed * 2;
  const baseScale = Math.max(artworkWidth / width, artworkHeight / height);
  const scaleX = baseScale * normalized.zoomX, scaleY = baseScale * normalized.zoomY;
  const imageWidth = width * scaleX, imageHeight = height * scaleY;
  return {
    x:(artworkWidth-imageWidth)*normalized.x+normalized.offsetX*artworkWidth,
    y:(artworkHeight-imageHeight)*normalized.y+normalized.offsetY*artworkHeight,
    width:imageWidth, height:imageHeight, scaleX, scaleY, baseScale, artworkWidth, artworkHeight
  };
}

/** Encode an editor rectangle in artwork inches, retaining legacy alignment values. */
export function cropForPlacement(width, height, crop, state, rectangle) {
  const normalized = normalizeCrop(crop), placement = photoPlacement(width,height,normalized,state);
  const zoomX = clamp(rectangle.width/(width*placement.baseScale),MIN_PHOTO_SCALE,MAX_PHOTO_SCALE);
  const zoomY = clamp(rectangle.height/(height*placement.baseScale),MIN_PHOTO_SCALE,MAX_PHOTO_SCALE);
  const imageWidth = width*placement.baseScale*zoomX, imageHeight = height*placement.baseScale*zoomY;
  return normalizeCrop({...normalized,zoomX,zoomY,
    offsetX:(rectangle.x-(placement.artworkWidth-imageWidth)*normalized.x)/placement.artworkWidth,
    offsetY:(rectangle.y-(placement.artworkHeight-imageHeight)*normalized.y)/placement.artworkHeight});
}

/** Inverse of the shared mapping, including white gaps outside the source rectangle. */
export function cropFrame(width, height, crop, state) {
  const placement = photoPlacement(width,height,crop,state);
  return {x:-placement.x/placement.scaleX,y:-placement.y/placement.scaleY,
    width:placement.artworkWidth/placement.scaleX,height:placement.artworkHeight/placement.scaleY,
    artworkWidth:placement.artworkWidth,artworkHeight:placement.artworkHeight};
}

/** Paint the complete decoded image using the original source's physical placement. */
export function drawMappedPhoto(context, bitmap, placement) {
  context.drawImage(bitmap,placement.x,placement.y,placement.width,placement.height);
}

/** A trim preview is the identical bleed artwork, clipped and composited on white. */
export function drawPhoto(context, bitmap, crop, state, width, height, trim = true, metadata = null) {
  const placement = photoPlacement(metadata?.sourceWidth || bitmap.width,metadata?.sourceHeight || bitmap.height,crop,state);
  context.save();
  context.fillStyle = '#fff'; context.fillRect(0,0,width,height);
  context.beginPath(); context.rect(0,0,width,height); context.clip();
  context.scale(width/(trim?state.width:placement.artworkWidth),height/(trim?state.height:placement.artworkHeight));
  if (trim) context.translate(-state.bleed,-state.bleed);
  drawMappedPhoto(context,bitmap,placement);
  context.restore();
}

/** Minimum source pixels per inch across both axes, including independently stretched art. */
export function effectiveDpi(metadata, state) {
  const placement = photoPlacement(metadata.sourceWidth,metadata.sourceHeight,metadata.crop,state);
  return Math.min(1/placement.scaleX,1/placement.scaleY);
}

/** Boundary gaps print white; transparent pixels within the image also composite on white. */
export function photoHasGaps(metadata, state) {
  const placement = photoPlacement(metadata.sourceWidth,metadata.sourceHeight,metadata.crop,state), tolerance = 1e-7;
  return placement.x>tolerance || placement.y>tolerance || placement.x+placement.width<placement.artworkWidth-tolerance || placement.y+placement.height<placement.artworkHeight-tolerance;
}

/** Persist references and crops only; keep bounded Pica preview bitmaps in memory. */
export function createAssetStore() {
  const records = new Map(), listeners = new Set(), requests = new Map();
  let revision = 0;
  let pending = 0;
  let disposed = false;
  let exportLocked = false;
  const notifyPending = () => listeners.forEach(listener => listener(null));
  const assertEditable = () => { if (exportLocked) throw new Error('Photo editing is locked during PDF export.'); };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)) || {}; } catch {}
  for (const key of ASSET_KEYS) {
    const item = saved[key];
    if (item && typeof item.grantId === 'string' && safeRelativePath(item.relativePath)) records.set(key, { metadata: { grantId:item.grantId, grantName:String(item.grantName || 'Photo folder'), relativePath:item.relativePath, crop:normalizeCrop(item.crop), sourceWidth:Number(item.sourceWidth) || 0, sourceHeight:Number(item.sourceHeight) || 0, sourceModifiedAt:typeof item.sourceModifiedAt==='string'?item.sourceModifiedAt:null, sourceBytes:Number(item.sourceBytes)||null }, bitmap:null, revision:0, error:'Photo folder not restored yet.' });
  }
  function metadata() { return Object.fromEntries([...records].map(([key, record]) => [key, { ...record.metadata, crop:{...record.metadata.crop} }])); }
  function changed(key) {
    revision++;
    if (records.has(key)) records.get(key).revision = revision;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata())); } catch { reportStorageFailure(); }
    listeners.forEach(listener => listener(key));
  }
  function close(key) { records.get(key)?.bitmap?.close(); }
  async function load(key, item, files, state = null, onProgress = ()=>{}) {
    if (disposed) return;
    requireResizer();
    const token = (requests.get(key) || 0) + 1; requests.set(key, token);
    pending++; notifyPending();
    let decoded, bitmap, preparation;
    try {
      onProgress('Reading the original image…');
      const {blob, info, entry} = await readImage(files, item.grantId, item.relativePath);
      const metadata={...item,sourceWidth:info.width,sourceHeight:info.height,sourceModifiedAt:entry.modifiedAt,sourceBytes:entry.size,crop:normalizeCrop(item.crop)};
      if (state) {
        const spec=printRasterSpec(state);
        onProgress(`Bounded decoding for ${spec.width} × ${spec.height} px print artwork…`);
        decoded=await decodeForPrint(blob,info,metadata.crop,state,spec.width,spec.height);
        if (disposed || requests.get(key)!==token) return;
        const result=await printPhotoCanvas(decoded,metadata,state,onProgress);
        // Assignment validates a real print-sized derivative, but never caches fourteen large rasters.
        result.canvas.width=result.canvas.height=1;
        preparation={spec:result.spec,decodedPpi:result.decodedPpi,sourceDpi:effectiveDpi(metadata,state)};
      } else {
        onProgress('Restoring a bounded full-source preview…');
        decoded=await decodeImage(blob,info,PREVIEW_EDGE*RESIZE_OVERSAMPLE,PREVIEW_EDGE*PREVIEW_EDGE*RESIZE_OVERSAMPLE*RESIZE_OVERSAMPLE);
      }
      onProgress('Pica resizing the retained preview to at most 768 px…');
      bitmap=await previewBitmap(decoded);
      if (disposed || requests.get(key)!==token) return;
      close(key);
      records.set(key,{metadata,bitmap,revision:0,error:''});bitmap=null;
      changed(key);
      return preparation;
    } finally {decoded?.close();bitmap?.close();pending--;notifyPending();}
  }
  return {
    get revision() { return revision; },
    get pending() { return pending; },
    beginFileOperation() { assertEditable(); pending++; notifyPending(); let ended=false; return () => {if(!ended){ended=true;pending--;notifyPending();}}; },
    beginExport() { requireResizer(); if (pending || exportLocked) throw new Error('Wait for photo restoration / assignment / resizing to finish.'); exportLocked = true; },
    endExport() { exportLocked = false; },
    get: key => records.get(key), metadata,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async assign(key, grant, entry, files, state, onProgress = ()=>{}) {
      assertEditable();
      if (pending) throw new Error('Wait for photo restoration / assignment / resizing to finish.');
      if (!ASSET_KEYS.includes(key)) throw new Error('Unknown artwork slot.');
      if (!state) throw new Error('Print specification is required before assigning a photo.');
      return load(key,{grantId:grant.grantId,grantName:grant.name,relativePath:entry.relativePath,crop:{...CENTER_CROP}},files,Object.freeze({...state}),onProgress);
    },
    setCrop(key, crop) { assertEditable(); const item = records.get(key); if (item) { item.metadata.crop = normalizeCrop(crop); changed(key); } },
    remove(key) { assertEditable(); requests.set(key, (requests.get(key) || 0) + 1); close(key); records.delete(key); changed(key); },
    async restore(files, onProgress = ()=>{}) {
      assertEditable();
      const candidates = [...records].map(([key,record]) => ({key,record,generation:requests.get(key)||0}));
      pending++; notifyPending();
      try {
        for (const {key,record,generation} of candidates) {
          if (record.bitmap || disposed || records.get(key)!==record || (requests.get(key)||0)!==generation) continue;
          try { await load(key,record.metadata,files,null,text=>onProgress(`${assetLabel(key)} · ${text}`)); }
          catch (error) { if (records.get(key) === record && requests.get(key)===generation+1) { record.error = error.message; changed(key); } }
        }
      } finally { pending--; notifyPending(); }
    },
    /** Reread and verify the original file; optional thumbnail placement controls decode density only. */
    async exportBitmap(key, files, state, targetWidth, targetHeight, placement = null) {
      const record = records.get(key);
      if (!record?.bitmap) throw new Error(`${assetLabel(key)} is missing or unavailable.`);
      const {blob, info, entry} = await readImage(files, record.metadata.grantId, record.metadata.relativePath);
      if (info.width !== record.metadata.sourceWidth || info.height !== record.metadata.sourceHeight || entry.size !== record.metadata.sourceBytes || entry.modifiedAt !== record.metadata.sourceModifiedAt) throw new Error(`${assetLabel(key)} changed on disk. Reselect and reassign it before exporting.`);
      requireResizer();
      return decodeForPrint(blob,info,record.metadata.crop,state,targetWidth,targetHeight,placement);
    },
    dispose() { disposed=true; records.forEach(record => record.bitmap?.close()); records.clear(); listeners.clear(); }
  };
}

export const assets = createAssetStore();
