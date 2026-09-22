import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { readLastGroupBook, rememberGroupBook, restoreLastGroupBook, manualBookUrl } from '../src/lib/last-group-book.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
}

// Execute both real startup entry points: the inline script runs before React.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const inlineBootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const app = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
const reactBootstrap = app.slice(app.indexOf('function canonicalizeCachedOwnBookUrl()'), app.indexOf('function getFirebaseApp()'));

function launch(href, storage) {
  const window = {
    location: { href }, localStorage: storage,
    history: { replaceState(_state, _title, url) { window.location.href = url; } },
  };
  const context = {
    window, URL,
    readCachedSignedInUser: () => JSON.parse(storage.getItem('split-expense-auth-bootstrap-v1') || 'null'),
    readLastGroupBook: uid => readLastGroupBook(uid, storage),
  };
  runInNewContext(inlineBootstrap, context);
  runInNewContext(`${reactBootstrap}\ncanonicalizeCachedOwnBookUrl();`, context);
  return new URL(window.location.href);
}

test('Telegram root launch keeps the entry URL available for last-book restoration', async () => {
  const storage = memoryStorage();
  storage.setItem('split-expense-auth-bootstrap-v1', JSON.stringify({ uid: 'A', ownShortCode: 'abc' }));
  rememberGroupBook('A', 'trip', storage);
  const url = launch('https://example.test/?tgWebAppVersion=9#tgWebAppData=test', storage);
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '?tgWebAppVersion=9');
  assert.equal(url.hash, '#tgWebAppData=test');
  assert.equal(await restoreLastGroupBook({ uid: 'A', storage, readGroup: async () => ({ owner: 'A' }) }), 'trip');
});

test('startup preserves explicit shared links despite a remembered book', () => {
  const storage = memoryStorage();
  storage.setItem('split-expense-auth-bootstrap-v1', JSON.stringify({ uid: 'A', ownShortCode: 'abc' }));
  rememberGroupBook('A', 'trip', storage);
  for (const href of ['https://example.test/g/shared', 'https://example.test/g/abc', 'https://example.test/?shareId=other']) {
    assert.equal(launch(href, storage).href, href);
  }
});

test('startup retains own-book bootstrap for default, absent or invalid preference', () => {
  for (const saved of [null, 'A', 'invalid/path']) {
    const storage = memoryStorage();
    storage.setItem('split-expense-auth-bootstrap-v1', JSON.stringify({ uid: 'A', ownShortCode: 'abc' }));
    if (saved) storage.setItem('expense:last-group-book:A', saved);
    assert.equal(launch('https://example.test/?tg=1#data', storage).href, 'https://example.test/g/abc?tg=1#data');
  }
});

test('neither cached-session nor Auth bootstrap paints the default before restoring a saved book', () => {
  const cachedStart = app.lastIndexOf('const initialUrl = new URL(window.location.href);', app.indexOf('const cachedOwnBookMatchesUrl'));
  assert.ok(cachedStart >= 0);
  const cachedPhase = app.slice(cachedStart, app.indexOf('let unsubscribe = () => {};', cachedStart));
  const authStart = app.indexOf('const initialUrl = new URL(window.location.href);', app.indexOf('unsubscribe = onAuthStateChanged'));
  const authPhase = app.slice(authStart, app.indexOf('// 1.', authStart));
  for (const saved of ['trip', 'A', null]) {
    const storage = memoryStorage();
    if (saved) rememberGroupBook('A', saved, storage);
    const updates = [];
    const context = {
      URL, window: { location: { href: 'https://example.test/?tg=1#data' } },
      user: { uid: 'A' }, isAnon: false,
      readCachedSignedInUser: () => ({ uid: 'A', ownShortCode: 'abc' }),
      readLastGroupBook: uid => readLastGroupBook(uid, storage),
      setUserId() {}, setIsGuest() {},
      setCurrentCollectionId: updater => updates.push(['collection', updater(null)]),
      setAuthReady: ready => updates.push(['ready', ready]),
    };
    for (const phase of [cachedPhase, authPhase]) {
      updates.length = 0;
      runInNewContext(phase, { ...context });
      assert.deepEqual(updates, saved === 'trip' ? [] : [['collection', 'A'], ['ready', true]]);
    }
  }
});

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
