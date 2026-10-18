import { FONT_LABELS, CSS_FONT_FAMILIES } from './fonts.js';
import { importCustomFont } from './custom-fonts.js';

const UPLOAD_VALUE = '__upload_custom_font__';
const FONT_ACCEPT = '.ttf';

/** Refresh a font picker without changing its selected family. */
export function refreshFontPicker(select) {
  const selected = select.value;
  const keys = Object.keys(FONT_LABELS);
  if (select.dataset.fontSignature === keys.join(',')) return;
  select.replaceChildren();
  for (const family of keys) {
    const option = document.createElement('option');
    option.value = family;
    option.textContent = FONT_LABELS[family];
    option.style.fontFamily = CSS_FONT_FAMILIES[family];
    select.append(option);
  }
  const upload = document.createElement('option');
  upload.value = UPLOAD_VALUE;
  upload.textContent = 'Upload custom font…';
  select.append(upload);
  select.value = selected;
  select.dataset.fontSignature = keys.join(',');
}

/** Add local TrueType uploading to any artwork font-family picker. */
export function bindFontPicker(select) {
  select.dataset.fontPicker = '';
  let previous = select.value;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = FONT_ACCEPT;
  input.hidden = true;
  input.setAttribute('aria-label', 'Upload static TrueType font');
  const status = document.createElement('span');
  status.className = 'layout-help';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  select.parentElement.append(input, status);
  refreshFontPicker(select);
  select.addEventListener('focus', () => { refreshFontPicker(select); previous = select.value; });
  select.addEventListener('change', event => {
    if (select.value !== UPLOAD_VALUE) { previous = select.value; return; }
    event.stopImmediatePropagation();
    select.value = previous;
    status.hidden = false;
    status.textContent = 'Choose a static .ttf file, up to 10 MB. Use fonts you are licensed to embed.';
    input.click();
  }, true);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    select.disabled = true;
    status.hidden = false;
    status.textContent = 'Loading font…';
    try {
      const font = await importCustomFont(file);
      for (const picker of document.querySelectorAll('select[data-font-picker]')) refreshFontPicker(picker);
      select.value = font.family;
      previous = font.family;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      status.textContent = font.persisted ? `${font.label} added and saved in this browser.` : `${font.label} added for this session. Browser storage is unavailable; upload it again next time.`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to load this font. Choose a static .ttf file.';
    } finally {
      select.disabled = false;
      input.value = '';
    }
  });
}
