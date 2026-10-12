import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareCalendarAssets } from '../app/calendar-assets.mjs';

test('preview dependency changes version the entire module graph and preserve relative asset paths', () => {
  const root=mkdtempSync(path.join(tmpdir(),'calendar-assets-'));
  try {
    const source=path.join(root,'public/calendar/src/scripts');
    mkdirSync(source,{recursive:true});
    writeFileSync(path.join(root,'public/calendar/browser-files.js'),'// browser API');
    writeFileSync(path.join(source,'main.js'),"import './scene.js';");
    writeFileSync(path.join(source,'scene.js'),'// first preview');
    const first=prepareCalendarAssets(root);
    assert.deepEqual(prepareCalendarAssets(root),first);
    writeFileSync(path.join(source,'scene.js'),'// updated preview');
    const second=prepareCalendarAssets(root);
    assert.notEqual(first.main,second.main);
    const url=new URL(second.main,'https://example.com');
    assert.equal(readFileSync(path.join(root,'public',new URL('./scene.js',url).pathname),'utf8'),'// updated preview');
    assert.equal(new URL('../../fonts/test.ttf',url).pathname,'/calendar/fonts/test.ttf');
    assert.equal(new URL('../../vendor/lcms/lcms.wasm',url).pathname,'/calendar/vendor/lcms/lcms.wasm');
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
});
