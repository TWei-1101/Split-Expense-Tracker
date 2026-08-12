import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldTriggerSwipeDelete } from '../src/lib/swipe-delete.js';

test('左滑超過較低門檻或快速左滑時要求刪除確認', () => {
  assert.equal(shouldTriggerSwipeDelete({ distance: -48, durationMs: 600 }), true);
  assert.equal(shouldTriggerSwipeDelete({ distance: -30, durationMs: 60 }), true);
});

test('短距離慢速滑動不會誤觸刪除，向右滑也不會', () => {
  assert.equal(shouldTriggerSwipeDelete({ distance: -30, durationMs: 600 }), false);
  assert.equal(shouldTriggerSwipeDelete({ distance: 90, durationMs: 100 }), false);
});

test('左滑手勢以左移距離鎖定，不會因斜向角度被當成上下捲動', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(xDistance >= 0\) return;/);
  assert.match(source, /if \(Math\.abs\(xDistance\) < 8\) return;/);
  assert.doesNotMatch(source, /yDistance/);
});

test('取得 pointer capture 後不會因 Safari 的 capture 交接而重設正在進行的左滑', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /onPointerCancel=\{\(\) => \{ dragRef\.current = null; resetPosition\(\); \}\}/);
  assert.doesNotMatch(source, /onLostPointerCapture/);
});

test('左滑時顯示紅色刪除底色，但它不是可固定停住的按鈕', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(css, /\.swipe-delete-row__action\s*\{[\s\S]*background: rgb\(220 38 38\);[\s\S]*pointer-events: none;/);
  assert.match(source, /actionRef\.current\.style\.opacity = dampedDistance < -1 \? '1' : '0'/);
  assert.match(css, /\.swipe-delete-row__content\s*\{[\s\S]*width: 100%;[\s\S]*box-sizing: border-box;[\s\S]*background: white;/);
});

test('左滑達門檻後直接呼叫刪除確認，不停住卡片', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(shouldTriggerSwipeDelete\([^\n]+\)\) onDelete\(\);/);
  assert.doesNotMatch(source, /isActionOpen|openAction/);
});
