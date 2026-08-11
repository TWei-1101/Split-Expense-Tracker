import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getOfflineSyncStatus } from '../src/lib/offline-sync-status.js';

test('reports offline when the browser has no network, even with local pending writes', () => {
  assert.deepEqual(getOfflineSyncStatus({ isOnline: false, hasPendingWrites: true }), {
    kind: 'offline',
    label: '離線：新增支出會在連線後同步',
  });
});

test('reports pending writes as syncing after network returns', () => {
  assert.deepEqual(getOfflineSyncStatus({ isOnline: true, hasPendingWrites: true }), {
    kind: 'syncing',
    label: '待同步',
  });
});

test('reports a settled online state only when no local writes remain', () => {
  assert.deepEqual(getOfflineSyncStatus({ isOnline: true, hasPendingWrites: false }), {
    kind: 'synced',
    label: '已同步',
  });
});

test('PWA icons are square PNGs at the advertised install sizes', async () => {
  for (const size of [192, 512]) {
    const png = await readFile(new URL(`../public/apple-touch-icon-${size}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size, `${size}px icon width`);
    assert.equal(png.readUInt32BE(20), size, `${size}px icon height`);
  }
});

test('places the offline sync status beside the balance summary heading', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const balanceSummary = source.slice(source.indexOf('const BalanceSummary'));
  assert.match(source, /<BalanceSummary[\s\S]*offlineSyncStatus=\{offlineSyncStatus\}/);
  assert.match(balanceSummary, /結餘總結[\s\S]*role="status"/);
});

test('automatically closes the expense form after an offline save', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isOnline\) \{[\s\S]*?onExpenseSaved\?\.\(\{ queued: true, isEditing \}\);\s*onClose\(\);\s*return;/);
  assert.match(source, /const writePromise = isEditing/);
  assert.doesNotMatch(source, /offlineSaveMessage/);
});

test('activates the latest service worker immediately for offline launches', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /registerType:\s*'autoUpdate'/);
});

test('registers the service worker immediately so the first online launch primes offline access', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /registerSW\(\{\s*immediate: true,/);
});
