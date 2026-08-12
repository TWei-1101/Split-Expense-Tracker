import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldTriggerSwipeDelete } from '../src/lib/swipe-delete.js';

test('左滑超過距離門檻或快速左滑時觸發刪除', () => {
  assert.equal(shouldTriggerSwipeDelete({ distance: -72, durationMs: 600 }), true);
  assert.equal(shouldTriggerSwipeDelete({ distance: -36, durationMs: 60 }), true);
});

test('短距離慢速滑動不會誤觸刪除，向右滑也不會', () => {
  assert.equal(shouldTriggerSwipeDelete({ distance: -36, durationMs: 600 }), false);
  assert.equal(shouldTriggerSwipeDelete({ distance: 90, durationMs: 100 }), false);
});
