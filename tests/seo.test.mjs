import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSiteUrl, siteMetadata, structuredData } from '../app/seo.mjs';

test('public URL configuration prevents invalid canonical origins',()=>{
  assert.equal(publicSiteUrl(''),null);
  assert.equal(publicSiteUrl('https://calendar.example.com').href,'https://calendar.example.com/');
  for(const value of ['file:///tmp/calendar','https://user:password@example.com','https://example.com/calendar','https://example.com/?tracking=1'])assert.throws(()=>publicSiteUrl(value));
});
test('canonical and social metadata use the configured origin only',()=>{
  const local=siteMetadata(null);
  assert.equal(local.metadataBase,undefined);
  assert.equal(local.alternates,undefined);
  assert.equal(local.openGraph.images,undefined);
  const publicMetadata=siteMetadata(publicSiteUrl('https://calendar.example.com'));
  assert.equal(new URL(publicMetadata.alternates.canonical,publicMetadata.metadataBase).href,'https://calendar.example.com/');
  assert.equal(new URL(publicMetadata.openGraph.images[0].url,publicMetadata.metadataBase).href,'https://calendar.example.com/share-image');
  assert.equal(publicMetadata.robots.index,true);
});
test('structured data describes the actual application without fabricated ratings',()=>{
  const schema=structuredData(publicSiteUrl('https://calendar.example.com'));
  assert.equal(schema[0]['@type'],'WebApplication');
  assert.equal(schema[0].url,'https://calendar.example.com/');
  assert.equal(schema[0].aggregateRating,undefined);
  assert.equal(schema[1]['@type'],'WebSite');
  assert.doesNotThrow(()=>JSON.parse(JSON.stringify(schema)));
});
