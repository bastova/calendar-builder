import { createDesignZip } from './design-zip.js';
import { calendarFontSources, importBundledFont } from './fonts.js';
import { importCustomFont } from './custom-fonts.js';

export const DESIGN_FILE = 'calendar-design.json';
const FORMAT = 'calendar-builder-design';
const VERSION = 1;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_FONT_FILES = 100;
const MAX_FONT_BYTES = 10 * 1024 * 1024;
const CORE_FAMILIES = new Set(['times','helvetica','courier']);
const safePath = value => typeof value === 'string' && value.length > 0 && !/[\\:\u0000-\u001f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');

/** Find selected font families anywhere in layout and back-cover settings. */
export function designFontFamilies(value, result = new Set()) {
  if (!value || typeof value !== 'object') return result;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'family' && typeof item === 'string') result.add(item);
    else if (item && typeof item === 'object') designFontFamilies(item, result);
  }
  return result;
}

/** Package original assigned images, selected fonts and versioned layout/style settings. */
export async function shareDesign(state, metadata, files) {
  const entries = [], images = {}, originals = new Map();
  for (const [key, item] of Object.entries(metadata)) {
    const identity = JSON.stringify([item.grantId, item.relativePath]);
    let path = originals.get(identity);
    if (!path) {
      const original = await files.readFile(item.grantId, item.relativePath);
      const name = item.relativePath.split('/').at(-1).replace(/[^a-zA-Z0-9._-]/g, '_');
      path = `images/${originals.size + 1}-${name}`;
      originals.set(identity, path);
      entries.push({path, data:original});
    }
    images[key] = {path, crop:item.crop};
  }
  const families = designFontFamilies(state), fonts = [];
  const sources = calendarFontSources();
  for (const family of families) {
    if (CORE_FAMILIES.has(family)) continue;
    const faces = sources.filter(face => face.family === family);
    if (!faces.length) throw new Error(`Font ${family} is unavailable. Restore it before sharing.`);
    for (const face of faces) {
      const path = `fonts/${family}/${face.file}`;
      fonts.push({family, style:face.style, custom:face.custom, path});
      entries.push({path, data:face.data});
    }
    if (!faces[0].custom) {
      const response = await fetch(new URL(`../../fonts/${family}/OFL.txt`, import.meta.url));
      if (!response.ok) throw new Error(`Unable to include the license for ${family}.`);
      entries.push({path:`fonts/${family}/OFL.txt`, data:await response.blob()});
    }
  }
  entries.push({path:DESIGN_FILE, data:JSON.stringify({format:FORMAT, version:VERSION, state, images, fonts}, null, 2)});
  return createDesignZip(entries);
}

/** Decode and validate the portable manifest without trusting paths or browser-local grants. */
export function decodeDesign(text) {
  const design = JSON.parse(text);
  if (!design || design.format !== FORMAT || design.version !== VERSION) throw new Error('This folder does not contain a supported calendar design.');
  if (!design.state || typeof design.state !== 'object' || Array.isArray(design.state) || !design.images || typeof design.images !== 'object' || Array.isArray(design.images) || !Array.isArray(design.fonts) || design.fonts.length > MAX_FONT_FILES) throw new Error('The calendar design file is damaged.');
  for (const image of Object.values(design.images)) if (!image || !safePath(image.path) || !image.path.startsWith('images/') || !/\.(jpe?g|png|webp)$/i.test(image.path)) throw new Error('The design contains an invalid image path.');
  for (const font of design.fonts) if (!font || !safePath(font.path) || !font.path.startsWith('fonts/') || !/\.ttf$/i.test(font.path) || typeof font.family !== 'string' || !['normal','bold','italic','bolditalic'].includes(font.style) || typeof font.custom !== 'boolean') throw new Error('The design contains an invalid font reference.');
  return design;
}

/** Read a selected extracted design folder and load its fonts before layout normalization. */
export async function readDesignFolder(grant, files) {
  const manifest = await files.readFile(grant.grantId, DESIGN_FILE);
  if (manifest.size > MAX_MANIFEST_BYTES) throw new Error('The calendar design file is too large.');
  const design = decodeDesign(await manifest.text());
  const remap = new Map(), warnings = [];
  for (const font of design.fonts) {
    const file = await files.readFile(grant.grantId, font.path);
    if (!file.size || file.size > MAX_FONT_BYTES) throw new Error('Font files must be non-empty and 10 MiB or smaller.');
    // Bundled faces retain their original family/style; custom faces use content-derived IDs.
    if (font.custom) {
      const imported = await importCustomFont(file);
      remap.set(font.family, imported.family);
      if (!imported.persisted) warnings.push('Custom fonts are available for this session only; browser storage is unavailable.');
    } else await importBundledFont(font.family, font.style, await file.arrayBuffer());
  }
  function remapFamilies(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'family' && remap.has(item)) value[key] = remap.get(item);
      else if (item && typeof item === 'object') remapFamilies(item);
    }
  }
  remapFamilies(design.state);
  const installed = new Set(calendarFontSources().map(face => face.family));
  for (const family of designFontFamilies(design.state)) if (!CORE_FAMILIES.has(family) && !installed.has(family)) throw new Error(`The design is missing font ${family}.`);
  const metadata = Object.fromEntries(Object.entries(design.images).map(([key, image]) => [key, {grantId:grant.grantId, grantName:grant.name, relativePath:image.path, crop:image.crop}]));
  return {state:design.state, metadata, warnings:[...new Set(warnings)]};
}
