import test from 'node:test';
import assert from 'node:assert/strict';
import { assets, backCoverUsesImage } from '../public/calendar/src/scripts/media.js';
import { normalizeBackCover } from '../public/calendar/src/scripts/back-cover.js';
import { requiredPhotoKeys } from '../public/calendar/src/scripts/pdf.js';

test('back cover source persists and Dynamic ignores a retained image reference', () => {
  const originalGet=assets.get;
  try {
    assets.get=key=>key==='back-cover'?{metadata:{relativePath:'cover.jpg'}}:undefined;
    const dynamic={backCover:normalizeBackCover({mode:'dynamic',columns:4})};
    const image={backCover:normalizeBackCover(JSON.parse(JSON.stringify({...dynamic.backCover,mode:'image'})))};
    assert.equal(backCoverUsesImage(dynamic),false);
    assert.equal(requiredPhotoKeys(dynamic).includes('back-cover'),false);
    assert.equal(backCoverUsesImage(image),true);
    assert.equal(requiredPhotoKeys(image).includes('back-cover'),true);
    assert.equal(image.backCover.columns,4);
    assert.equal(backCoverUsesImage({backCover:normalizeBackCover({})}),true);
    assets.get=()=>undefined;
    assert.equal(backCoverUsesImage(image),true);
    assert.equal(requiredPhotoKeys(image).includes('back-cover'),true);
    assert.equal(backCoverUsesImage({backCover:normalizeBackCover({})}),false);
  } finally {assets.get=originalGet;}
});
