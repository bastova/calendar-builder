import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SWOP_NAME, SWOP_LICENSE_URL, swopAccepted, acceptSwopLicense, ensureSwopProfile, swopProfile } from '../public/calendar/src/scripts/swop-profile.js';
import { proofPixels, profileFor } from '../public/calendar/src/scripts/icc-proof.js';
import { normalizePrintColor, applyPaperEstimate, printColorSummary, createPrintColorPanel } from '../public/calendar/src/scripts/print-color.js';

const PROFILE_URL = new URL('../public/calendar/profiles/USWebCoatedSWOP.icc', import.meta.url);
const PROFILE_SHA256 = '35f401731df11a4eba3502af632e51d68bc394bcb7d34632a331c1ba3f4a0bf6';
const SOURCE = new Uint8ClampedArray([255, 0, 0, 127, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);

/** Minimal DOM/canvas stand-in that retains the actual pixels written by the panel. */
function panelDocument() {
  const nodes = new Map();
  class Node {
    children = []; value = ''; textContent = ''; hidden = false; listeners = new Map();
    classList = { toggle() {} };
    append(node) { this.children.push(node); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type) { this.listeners.delete(type); }
    querySelector(selector) { return get(selector); }
    getContext() { return {
      save() {}, restore() {}, translate() {}, fillRect() {},
      getImageData: () => ({ data: SOURCE.slice() }),
      putImageData: pixels => { this.pixels = pixels.data.slice(); }
    }; }
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  return { get, document: { getElementById: get, createElement: () => new Node() } };
}

test('SWOP consent gates downloads; real ICC transforms drive Print Map and optional 3D previews', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalImageData = globalThis.ImageData;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
  } });
  let requests = 0;
  const bytes = new Uint8Array(await readFile(PROFILE_URL));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), PROFILE_SHA256);
  globalThis.fetch = async url => {
    requests++;
    assert.ok(url.href.endsWith('/calendar/profiles/USWebCoatedSWOP.icc'));
    return { ok: true, arrayBuffer: async () => bytes.buffer };
  };
  let panel;
  try {
    assert.equal(swopAccepted(), false);
    await assert.rejects(ensureSwopProfile(), /Agree/);
    assert.equal(requests, 0);
    assert.ok(SWOP_LICENSE_URL.href.endsWith('.pdf#page=5'));
    assert.equal(normalizePrintColor({ mode: 'swop' }).mode, 'swop');
    const { get, document } = panelDocument();
    globalThis.document = document;
    globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
    const state = { width: 12, height: 12, bleed: 0.125, bindingStyle: 'wire', view: 'printing', endSpread: 'opening', endSpreadColor: '#ffffff', printColor: { mode: 'swop', target: 'epson', paper: 'uncoated', compare: true } };
    panel = createPrintColorPanel(() => state, settings => { state.printColor = settings; panel.render(); });
    panel.render();
    assert.equal(requests, 0);
    assert.equal(get('print-color-swop-agreement').hidden, false);
    assert.equal(get('print-color-estimate').hidden, true);
    acceptSwopLicense();
    const [first, second] = await Promise.all([ensureSwopProfile(), ensureSwopProfile()]);
    assert.equal(first, second);
    assert.equal(requests, 1);
    assert.equal(swopProfile().name, SWOP_NAME);
    assert.equal(profileFor('epson', 'uncoated'), undefined);
    const expected = proofPixels({ data: SOURCE.slice() }, first).data;
    assert.notDeepEqual(expected, SOURCE);
    assert.equal(expected[3], SOURCE[3]);
    panel.render();
    assert.deepEqual(get('print-color-estimate').pixels, expected);
    assert.equal(get('print-color-source').pixels, undefined);
    assert.equal(get('print-color-estimate').hidden, false);
    assert.equal(get('print-color-alternate-card').hidden, true);
    assert.equal(get('print-color-paper').disabled, true);
    assert.equal(state.printColor.paper, 'uncoated');
    assert.equal(state.printColor.compare, true);
    assert.ok(get('print-color-estimate-label').textContent.includes(SWOP_NAME));
    const summary = printColorSummary(state);
    assert.equal(summary.iccTransformApplied, true);
    assert.equal(summary.deviceColorProfileAvailable, false);
    assert.equal(summary.pdfColorSpace, 'RGB');
    const context = { canvas: { width: 4, height: 1 }, getImageData: () => ({ data: SOURCE.slice() }), putImageData: pixels => { context.pixels = pixels.data; } };
    state.printColor.preview3d = true;
    applyPaperEstimate(context, state);
    assert.deepEqual(context.pixels, expected);
    state.printColor.mode = 'icc';
    panel.render();
    assert.equal(get('print-color-paper').disabled, false);
    assert.equal(get('print-color-alternate-card').hidden, false);
    assert.equal(get('print-color-estimate').hidden, true);
  } finally {
    panel?.dispose();
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.ImageData = originalImageData;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  }
});
