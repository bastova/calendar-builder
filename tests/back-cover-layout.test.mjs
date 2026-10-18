import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
const postcss = nextRequire('postcss');
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const stylesheet = readFileSync(path.join(PROJECT_ROOT, 'public/calendar/src/styles/main.css'), 'utf8');
const template = readFileSync(path.join(PROJECT_ROOT, 'app/calendar-template.html'), 'utf8');
const BACK_PANEL_SELECTOR = '#back-cover-panel:not([hidden])';
const BACK_INSPECTOR_SELECTOR = `#artwork-tabs:has(${BACK_PANEL_SELECTOR})`;
const BROWSER_MODULE = process.env.CALENDAR_PLAYWRIGHT_MODULE;
const VIEWPORTS = [[1440, 900], [900, 900], [721, 800], [720, 800], [390, 844], [320, 568], [844, 390]];
const PIXEL_TOLERANCE = 1;
const MINIMUM_SETTINGS_HEIGHT = 80;

/** Read declarations from one unconditionally applicable rule, including its media ancestry. */
function globalDeclarations(selector) {
  const rules = [];
  postcss.parse(stylesheet).walkRules(selector, rule => rules.push(rule));
  const globalRule = rules.find(rule => rule.parent.type === 'root');
  assert.ok(globalRule, `${selector} must apply outside all media queries`);
  return Object.fromEntries(globalRule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
}

test('back-cover fixed-preview rules are global, not accidentally nested inside Layout modifier mobile styles', () => {
  const inspector = globalDeclarations(BACK_INSPECTOR_SELECTOR);
  assert.equal(inspector.display, 'flex');
  assert.equal(inspector.overflow, 'hidden');
  assert.equal(inspector.height, undefined, 'reuse the bounded desktop inspector height');
  const panel = globalDeclarations(BACK_PANEL_SELECTOR);
  assert.equal(panel.display, 'flex');
  assert.equal(panel['min-height'], '0');
  assert.equal(panel.overflow, 'hidden');
  const workspace = globalDeclarations('#artwork-tabs #back-cover-panel .layout-editor-workspace');
  assert.equal(workspace.display, 'flex');
  assert.equal(workspace['flex-direction'], 'column');
  assert.equal(workspace['min-height'], '0');
  assert.equal(workspace.overflow, 'hidden');
  const preview = globalDeclarations('#back-cover-panel .flat-preview');
  assert.equal(preview.flex, 'none');
  const controls = globalDeclarations('#back-cover-controls');
  assert.equal(controls['overflow-y'], 'auto');
  assert.equal(controls['min-height'], '0');
  assert.equal(controls.flex, '1 1 0');
  assert.equal(controls.position, 'relative', 'contain absolutely positioned accessible labels in their scroller');
  assert.match(template, /id="back-cover-controls" class="layout-controls" tabindex="0" role="region" aria-label="Scrollable back cover settings"/);
});

test('short-phone preview can shrink without consuming the settings viewport', () => {
  const root = postcss.parse(stylesheet);
  let previewRule;
  root.walkRules('#back-cover-panel .flat-preview', rule => {
    if (rule.parent.type === 'atrule' && rule.parent.params === '(max-width:720px)') previewRule = rule;
  });
  assert.ok(previewRule);
  const declarations = Object.fromEntries(previewRule.nodes.map(node => [node.prop, node.value]));
  assert.equal(declarations['max-height'], '50%');
  assert.equal(declarations['min-height'], '0');
  assert.equal(declarations.display, 'flex');

test('back-cover typography overrides the shared compact font grid and keeps upload feedback on its own row', () => {
  const fields = globalDeclarations('#artwork-tabs #back-dynamic-settings .back-inspector-fields');
  assert.equal(fields['grid-template-columns'], 'minmax(0,1fr)');
  assert.equal(fields['min-width'], '0');
  const pickerRow = globalDeclarations('#artwork-tabs #back-dynamic-settings .back-inspector-fields>label:has([data-font-picker])');
  assert.equal(pickerRow.display, 'grid');
  assert.equal(pickerRow['grid-template-columns'], 'minmax(0,1fr) minmax(0,176px)');
  const feedback = globalDeclarations('#artwork-tabs #back-dynamic-settings .back-inspector-fields label>.layout-help');
  assert.equal(feedback['grid-column'], '1/-1');
  assert.equal(feedback['overflow-wrap'], 'anywhere');
  assert.equal(globalDeclarations('#artwork-tabs #back-dynamic-settings .back-inspector-fields input[hidden]').display, 'none');
});

test('back-cover style buttons retain responsive touch sizes instead of the shared 30px glyph size', () => {
  const row = globalDeclarations('#artwork-tabs #back-dynamic-settings .back-font-style-row');
  assert.equal(row.display, 'flex');
  assert.equal(row['justify-content'], 'space-between');
  const buttons = globalDeclarations('#artwork-tabs #back-dynamic-settings .back-font-styles .font-style-icon');
  for (const dimension of ['width','min-width','height','min-height']) assert.equal(buttons[dimension], 'var(--back-control-height)');
  assert.equal(buttons.flex, '0 0 var(--back-control-height)');
  assert.equal(buttons.border, '0');
});

});

// Optional real-browser regression: provide a local Playwright module without adding a production dependency.
// CALENDAR_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --test tests/back-cover-layout.test.mjs
const bootstrap = `
import {createLayoutEditor} from '/calendar/src/scripts/layout-editor.js';
import {createBackCoverEditor,normalizeBackCover} from '/calendar/src/scripts/back-cover.js';
import {normalizeLayout,normalizeArtworkMetadata} from '/calendar/src/scripts/layout.js';
import {normalizeHolidays} from '/calendar/src/scripts/holidays.js';
let state={year:2027,width:12,height:12,margin:.5,binding:.5,bleed:.125,week:0,month:0,editorTab:'back-cover',endSpread:null,endSpreadColor:'#000000',backCover:normalizeBackCover({mode:'dynamic'}),layout:normalizeLayout(),artworkMetadata:normalizeArtworkMetadata(),holidays:normalizeHolidays()};
const layout=createLayoutEditor(()=>state,()=>{},tab=>{state.editorTab=tab;render();},()=>{},()=>{});
const back=createBackCoverEditor(()=>state,value=>{state.backCover=value;render();});
function render(){layout.render();back.render();}
document.body.dataset.mobileScreen='edit';
render();
window.editorReady=true;
`;

/** Capture only the geometry and overflow that distinguish settings scrolling from inspector scrolling. */
async function layoutMetrics(page) {
  return page.evaluate(() => {
    const inspector = document.getElementById('artwork-tabs');
    const controls = document.getElementById('back-cover-controls');
    const preview = document.querySelector('#back-cover-panel .flat-preview');
    const toolbar = document.querySelector('#back-cover-panel .layout-zoom-toolbar');
    const viewport = document.getElementById('back-cover-zoom-viewport');
    return {
      inspectorDisplay: getComputedStyle(inspector).display,
      inspectorOverflow: getComputedStyle(inspector).overflowY,
      inspectorTop: inspector.scrollTop,
      panelTop: document.getElementById('back-cover-panel').scrollTop,
      workspaceTop: preview.parentElement.scrollTop,
      settingsOverflow: getComputedStyle(controls).overflowY,
      settingsTop: controls.scrollTop,
      settingsHeight: controls.clientHeight,
      settingsScrollHeight: controls.scrollHeight,
      previewTop: preview.getBoundingClientRect().top,
      toolbarTop: toolbar.getBoundingClientRect().top,
      previewHeight: viewport.clientHeight,
      previewScrollTop: viewport.scrollTop,
      previewScrollLeft: viewport.scrollLeft,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      documentTop: scrollY
    };
  });
}

test('real editor keeps the preview stationary while Dynamic/Image settings scroll across breakpoints', { skip: !BROWSER_MODULE, timeout: 45000 }, async () => {
  const { chromium } = await import(BROWSER_MODULE);
  const browser = await chromium.launch({ channel: process.env.CALENDAR_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const markup = template.match(/<body>([\s\S]*?)<script src=/)[1];
    await page.route('http://calendar.test/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<link rel="stylesheet" href="/calendar/src/styles/main.css">${markup}<script type="module">${bootstrap}</script>` });
      const file = path.join(PROJECT_ROOT, 'public', url.pathname);
      return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: 'Not found' });
    });
    await page.goto('http://calendar.test/');
    await page.waitForFunction(() => window.editorReady);
    for (const theme of ['light', 'dark']) for (const [width, height] of VIEWPORTS) {
      const scenario = `${theme} ${width}x${height}`;
      await page.setViewportSize({ width, height });
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        for (const detail of document.querySelectorAll('#back-dynamic-settings details')) detail.open = true;
        document.getElementById('back-cover-controls').scrollTop = 0;
        document.getElementById('artwork-tabs').scrollTop = 0;
      }, theme);
      await page.locator('#back-cover-controls').scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const before = await layoutMetrics(page);
      assert.equal(before.inspectorDisplay, 'flex', scenario);
      assert.equal(before.inspectorOverflow, 'hidden', scenario);
      assert.equal(before.settingsOverflow, 'auto', scenario);
      assert.ok(before.settingsHeight >= MINIMUM_SETTINGS_HEIGHT, `${scenario}: settings height ${before.settingsHeight}`);
      assert.ok(before.previewHeight >= 40, `${scenario}: preview remains visible`);
      assert.ok(before.settingsScrollHeight > before.settingsHeight, scenario);
      assert.ok(before.documentWidth <= before.viewportWidth + PIXEL_TOLERANCE, `${scenario}: no page-wide overflow`);
      await page.locator('#back-cover-controls').hover();
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(100);
      const after = await layoutMetrics(page);
      assert.ok(after.settingsTop > 0, `${scenario}: wheel reaches settings scroller`);
      for (const key of ['previewTop', 'toolbarTop', 'inspectorTop', 'panelTop', 'workspaceTop', 'documentTop', 'previewScrollTop', 'previewScrollLeft']) {
        assert.ok(Math.abs(after[key] - before[key]) <= PIXEL_TOLERANCE, `${scenario}: ${key} moved from ${before[key]} to ${after[key]}`);
      }
      await page.evaluate(() => document.getElementById('back-thumbnail-reset').focus());
      const focused = await layoutMetrics(page);
      assert.equal(focused.inspectorTop, 0, `${scenario}: keyboard focus must not scroll preview away`);
      assert.ok(Math.abs(focused.previewTop - before.previewTop) <= PIXEL_TOLERANCE, scenario);
      await page.locator('#back-image-tab').click();
      assert.deepEqual(await page.evaluate(() => ['back-dynamic-settings', 'back-image-settings'].map(id => {
        const el = document.getElementById(id);
        return [el.hidden, el.hasAttribute('hidden'), getComputedStyle(el).display === 'none'];
      })), [[true, true, true], [false, false, false]], scenario);
      const image = await layoutMetrics(page);
      assert.ok(image.settingsHeight >= MINIMUM_SETTINGS_HEIGHT, `${scenario}: Image controls remain reachable`);
      await page.locator('#layout-modifier-tab').click();
      assert.equal(await page.locator('#back-cover-panel').evaluate(el => el.hidden && getComputedStyle(el).display === 'none'), true, scenario);
      await page.locator('#back-cover-tab').click();
      await page.locator('#back-dynamic-tab').click();
      console.log(`${scenario}: settings=${Math.round(before.settingsHeight)}px, preview=${Math.round(before.previewHeight)}px, wheel=${Math.round(after.settingsTop)}px; preview stationary`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
