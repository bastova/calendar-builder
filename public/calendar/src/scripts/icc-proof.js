// Printer profiles belong to an exact device / ink / media / driver condition.
// No manufacturer profile is redistributed or inferred from the model name.
const profiles = new Map();
let enginePromise, revision = 0;
const keyFor = (target, paper) => `${target}:${paper}`;
export const profileRevision = () => revision;
export const profileFor = (target, paper) => profiles.get(keyFor(target, paper));
async function engine() {
  return enginePromise ||= import('../../vendor/lcms/lcms.js').then(async api => ({ api, cms: await api.instantiate({ locateFile: () => new URL('../../vendor/lcms/lcms.wasm', import.meta.url).href }) }));
}
export function validateProfile(bytes) {
  if (bytes.length < 132 || bytes.length > 16 * 1024 * 1024) throw new Error('Choose an ICC output profile smaller than 16 MB.');
  const text = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (text(36) !== 'acsp' || text(12) !== 'prtr' || !['RGB ', 'CMYK', 'GRAY'].includes(text(16))) throw new Error('This must be a printer output ICC profile (RGB, CMYK or gray), not a monitor or camera profile.');
  if (view.getUint32(0) !== bytes.length || view.getUint32(128) > (bytes.length - 132) / 12) throw new Error('The ICC file is incomplete or malformed.');
  for (let i = 0; i < view.getUint32(128); i++) {
    const offset = view.getUint32(136 + i * 12), size = view.getUint32(140 + i * 12);
    if (offset > bytes.length || size > bytes.length - offset) throw new Error('The ICC tag table is malformed.');
  }
}
export async function loadProfile(target, paper, bytes, filename) {
  validateProfile(bytes);
  const { api, cms } = await engine();
  // The upstream array wrapper allocates on the WASM stack, too small for many printer profiles.
  const memory=cms._malloc(bytes.length);
  if(!memory)throw new Error('Not enough memory to load this ICC profile.');
  cms.HEAPU8.set(bytes,memory);
  const output = cms._cmsOpenProfileFromMem(memory, bytes.length);
  if (!output) {cms._free(memory);throw new Error('LittleCMS could not open this ICC profile.');}
  const srgb = cms.cmsCreate_sRGBProfile();
  let transform;
  try {
    transform = cms.cmsCreateProofingTransform(srgb, api.TYPE_RGB_8, srgb, api.TYPE_RGB_8, output,
      api.INTENT_RELATIVE_COLORIMETRIC, api.INTENT_ABSOLUTE_COLORIMETRIC, api.cmsFLAGS_SOFTPROOFING);
    if (!transform) throw new Error('This profile does not support the required forward and reverse proofing transforms.');
    const name = cms.cmsGetProfileInfoASCII(output, api.cmsInfoDescription, 'en', 'US') || filename;
    const entry = { name, filename, transform, cms, bytes };
    const old = profileFor(target, paper);
    profiles.set(keyFor(target, paper), entry);
    if (old) old.cms.cmsDeleteTransform(old.transform);
    revision++;
    return entry;
  } finally {
    cms.cmsCloseProfile(srgb); cms.cmsCloseProfile(output); cms._free(memory);
  }
}
export function proofPixels(imageData, profile) {
  const count = imageData.data.length / 4, rgb = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) rgb.set(imageData.data.subarray(i * 4, i * 4 + 3), i * 3);
  const result = profile.cms.cmsDoTransform(profile.transform, rgb, count);
  for (let i = 0; i < count; i++) imageData.data.set(result.subarray(i * 3, i * 3 + 3), i * 4);
  return imageData;
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('calendar-builder-icc', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('profiles');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function saveProfile(target, paper, entry) {
  const db = await database();
  try { await new Promise((resolve, reject) => {
    const transaction = db.transaction('profiles', 'readwrite');
    if (entry) transaction.objectStore('profiles').put({ target, paper, bytes: entry.bytes, filename: entry.filename }, keyFor(target, paper));
    else transaction.objectStore('profiles').delete(keyFor(target, paper));
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
  }); } finally { db.close(); }
}
export async function restoreProfiles() {
  if (typeof indexedDB === 'undefined') return;
  const db = await database();
  try {
    const records = await new Promise((resolve, reject) => { const request = db.transaction('profiles').objectStore('profiles').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    for (const record of records) { try { await loadProfile(record.target, record.paper, record.bytes, record.filename); } catch { /* An unusable cached profile is never substituted with a fabricated proof. */ } }
  } finally { db.close(); }
}
export function removeProfile(target, paper) {
  const profile = profileFor(target, paper);
  if (profile) { profile.cms.cmsDeleteTransform(profile.transform); profiles.delete(keyFor(target, paper)); revision++; }
}
