import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('occasional surfaces use a shared presence transition with reduced-motion support', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(source, /const AnimatedModalFrame/);
  assert.match(source, /const useAnimatedPresence/);
  assert.match(source, /isRecycleBinModalOpen/);
  assert.match(source, /isGroupBookMenuOpen/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
});

test('recycle-bin actions wait for a card exit and restore it when the write fails', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /pendingRecycleBinExpenseIds/);
  assert.match(source, /await waitForMotionExit\(150\)/);
  assert.match(source, /setPendingRecycleBinExpenseIds\(previous => \{[\s\S]*next\.delete\(record\.id\)/);
  assert.match(source, /recycle-bin-card--exiting/);
});
