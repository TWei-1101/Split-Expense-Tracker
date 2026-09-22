import test from 'node:test';
import assert from 'node:assert/strict';
import { readLastGroupBook, rememberGroupBook, restoreLastGroupBook, manualBookUrl } from '../src/lib/last-group-book.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
}

test('last manual book selection persists independently for each account', async () => {
  const storage = memoryStorage();
  rememberGroupBook('A', 'trip1', storage);
  rememberGroupBook('B', 'trip2', storage);
  rememberGroupBook('A', 'trip3', storage);
  assert.equal(readLastGroupBook('A', storage), 'trip3');
  assert.equal(readLastGroupBook('B', storage), 'trip2');
  assert.equal(await restoreLastGroupBook({ uid: 'A', storage, readGroup: async () => ({ owner: 'A' }) }), 'trip3');
});

test('invited books are restored but deleted or inaccessible books fall back', async () => {
  const storage = memoryStorage();
  for (const data of [{ members: ['A'] }, null, { owner: 'B', members: [] }]) {
    rememberGroupBook('A', 'trip', storage);
    const expected = data?.members?.includes('A') ? 'trip' : 'A';
    assert.equal(await restoreLastGroupBook({ uid: 'A', storage, readGroup: async () => data }), expected);
    assert.equal(readLastGroupBook('A', storage), expected);
  }
});

test('transient failures preserve preference and blocked storage never crashes', async () => {
  const storage = memoryStorage();
  rememberGroupBook('A', 'trip', storage);
  assert.equal(await restoreLastGroupBook({ uid: 'A', storage, readGroup: async () => { throw Error('offline'); } }), 'A');
  assert.equal(readLastGroupBook('A', storage), 'trip');
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.doesNotThrow(() => rememberGroupBook('A', 'trip', blocked));
  assert.equal(readLastGroupBook('A', blocked), null);
});

test('manual selection removes stale share targets but preserves unrelated URL data', () => {
  assert.equal(manualBookUrl('https://example.test/g/abc?shareId=old&tg=1#tab'), '/?tg=1#tab');
  assert.equal(manualBookUrl('https://example.test/app/g/abc'), '/app/');
  assert.equal(manualBookUrl('https://example.test/?tg=1'), '/?tg=1');
});
