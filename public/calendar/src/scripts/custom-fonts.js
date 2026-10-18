import { FONT_CATALOG, registerCustomFont } from './fonts.js';

const MAX_FONT_BYTES = 10 * 1024 * 1024;
const DATABASE_NAME = 'calendar-custom-fonts';
const STORE_NAME = 'fonts';
const DATABASE_VERSION = 1;
const SFNT_HEADER_BYTES = 12;
const TABLE_RECORD_BYTES = 16;
const REQUIRED_TABLES = ['head','hhea','hmtx','maxp','cmap','loca','glyf','name','post'];
const pending = new Map();

function validateFont(data) {
  if(!(data instanceof ArrayBuffer) || !data.byteLength)throw new Error('Choose a non-empty static TrueType (.ttf) font.');
  if(data.byteLength>MAX_FONT_BYTES)throw new Error('Font files must be 10 MiB or smaller.');
  const view=new DataView(data);
  if(data.byteLength<SFNT_HEADER_BYTES || view.getUint32(0)!==0x00010000)throw new Error('Only static glyf TrueType (.ttf) fonts are supported. OTF/CFF, WOFF and font collections are not supported.');
  const count=view.getUint16(4),directoryEnd=SFNT_HEADER_BYTES+count*TABLE_RECORD_BYTES;
  if(!count || directoryEnd>data.byteLength)throw new Error('The TrueType font table directory is damaged.');
  const tables=new Set();
  for(let index=0;index<count;index++) {
    const offset=SFNT_HEADER_BYTES+index*TABLE_RECORD_BYTES;
    const tag=String.fromCharCode(...new Uint8Array(data,offset,4));
    const start=view.getUint32(offset+8),length=view.getUint32(offset+12);
    if(tables.has(tag) || start<directoryEnd || start+length>data.byteLength)throw new Error('The TrueType font contains invalid or truncated tables.');
    tables.add(tag);
  }
  if(['fvar','gvar','CFF ','CFF2'].some(tag=>tables.has(tag)))throw new Error('Variable and CFF fonts are not supported. Choose a static glyf TrueType (.ttf) font.');
  if(REQUIRED_TABLES.some(tag=>!tables.has(tag)))throw new Error('The font is missing required static TrueType tables.');
}

async function fontIdentity(data) {
  const digest=await globalThis.crypto.subtle.digest('SHA-256',data);
  return `custom_${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
function openDatabase() {
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('Browser font storage is unavailable.'));return;}
    const request=indexedDB.open(DATABASE_NAME,DATABASE_VERSION);
    let failed=false;
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'family'});};
    request.onerror=()=>reject(request.error || new Error('Unable to open browser font storage.'));
    request.onblocked=()=>{failed=true;reject(new Error('Browser font storage is blocked by another tab.'));};
    request.onsuccess=()=>{if(failed)request.result.close();else resolve(request.result);};
  });
}
async function accessStorage(mode,operation) {
  const db=await openDatabase();
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,mode);
      const request=operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onerror=transaction.onabort=()=>reject(transaction.error || request.error || new Error('Browser font storage failed.'));
    });
  } finally {db.close();}
}
async function register(data,label) {
  validateFont(data);
  const family=await fontIdentity(data);
  if(!pending.has(family)) {
    const task=registerCustomFont({family,label,data});
    pending.set(family,task);
    task.finally(()=>pending.delete(family)).catch(()=>{});
  }
  await pending.get(family);
  return {family,label:FONT_CATALOG[family].label};
}

/** Import one static .ttf face, verified for live use; storage failure leaves it usable this session. */
export async function importCustomFont(file) {
  if(!file || !/\.ttf$/i.test(file.name || ''))throw new Error('Choose a static TrueType file with the .ttf extension.');
  if(file.size>MAX_FONT_BYTES)throw new Error('Font files must be 10 MiB or smaller.');
  const data=await file.arrayBuffer();
  const label=file.name.replace(/\.ttf$/i,'').trim() || 'Custom font';
  const identity=await register(data,label);
  let persisted=true;
  try {await accessStorage('readwrite',store=>store.put({...identity,data}));}catch {persisted=false;}
  return {...identity,persisted};
}

/** Restore stored fonts before settings normalization; return nonfatal storage/face errors. */
export async function restoreCustomFonts() {
  const errors=[];
  let records;
  try {records=await accessStorage('readonly',store=>store.getAll());}
  catch(error){return [`Custom fonts could not be restored: ${error.message}`];}
  for(const record of records) {
    try {
      if(typeof record.label!=='string' || !record.label.trim())throw new Error('Invalid saved font label.');
      // Recompute the key: stored metadata never controls CSS or PDF identifiers.
      await register(record.data,record.label);
    } catch(error){errors.push(`Could not restore ${record?.label || 'a custom font'}: ${error.message}`);}
  }
  return errors;
}
