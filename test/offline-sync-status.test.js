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
    label: '正在同步離線新增的支出…',
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
