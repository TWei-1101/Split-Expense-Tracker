import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldTriggerSwipeDelete } from '../src/lib/swipe-delete.js';

test('左滑超過距離門檻或快速左滑時觸發刪除', () => {
  assert.equal(shouldTriggerSwipeDelete({ distance: -72, durationMs: 600 }), true);
  assert.equal(shouldTriggerSwipeDelete({ distance: -36, durationMs: 60 }), true);
});

test('短距離慢速滑動不會誤觸刪除，向右滑也不會', () => {
  assert.equal(shouldTriggerSwipeDelete({ distance: -36, durationMs: 600 }), false);
  assert.equal(shouldTriggerSwipeDelete({ distance: 90, durationMs: 100 }), false);
});

test('左滑手勢容許自然的斜向移動，只有垂直位移較大才視為捲動', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /Math\.abs\(yDistance\) > Math\.abs\(xDistance\) \|\| xDistance >= 0/);
  assert.doesNotMatch(source, /Math\.abs\(yDistance\) > Math\.abs\(xDistance\) \/ 1\.5/);
});

test('取得 pointer capture 後不會因 Safari 的 capture 交接而重設正在進行的左滑', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /onPointerCancel=\{\(\) => \{ dragRef\.current = null; resetPosition\(\); \}\}/);
  assert.doesNotMatch(source, /onLostPointerCapture/);
});

test('刪除底色只存在右側的滑動揭露區，靜止時由內容層完整遮住', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.swipe-delete-row__action\s*\{[\s\S]*top: 1px;[\s\S]*bottom: 1px;[\s\S]*border-radius: 0 \.75rem \.75rem 0;/);
  assert.match(css, /\.swipe-delete-row__content\s*\{[\s\S]*width: 100%;[\s\S]*box-sizing: border-box;[\s\S]*background: white;/);
});
