import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { analyticsMeasurementId, analyticsBootstrap } from '../app/analytics.mjs';

test('analytics remains disabled for missing or unsafe measurement IDs', () => {
  for (const value of ['', null, 'UA-123', 'G-123</script>', 'invalid']) {
    assert.equal(analyticsMeasurementId(value), null);
  }
  assert.equal(analyticsMeasurementId(' G-ABC123 '), 'G-ABC123');
});

test('bootstrap preserves queued events and configures automatic page views once', () => {
  const context = { dataLayer: [['existing-event']] };
  context.window = context;
  vm.runInNewContext(analyticsBootstrap('G-ABC123'), context);
  assert.equal(context.dataLayer.length, 3);
  assert.equal(context.dataLayer[0][0], 'existing-event');
  assert.equal(context.dataLayer[1][0], 'js');
  assert.deepEqual(Array.from(context.dataLayer[2]), ['config', 'G-ABC123']);
});
