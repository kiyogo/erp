import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollbarMetrics } from '../src/custom-ui/modalScrollbar.ts';

test('dialog scrollbar stays inside its track and reflects the scroll position', () => {
  assert.deepEqual(scrollbarMetrics(100, 100, 0), { maxScroll: 0, thumbHeight: 100, track: 0, thumbTop: 0 });
  assert.deepEqual(scrollbarMetrics(100, 400, 150), { maxScroll: 300, thumbHeight: 25, track: 75, thumbTop: 37.5 });
  assert.equal(scrollbarMetrics(100, 400, 500).thumbTop, 75);
  assert.equal(scrollbarMetrics(100, 10000, 0).thumbHeight, 24);
});
