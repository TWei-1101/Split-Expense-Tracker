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
  assert.match(source, /const writePromise = isEditing/);
  assert.match(source, /writePromise\.catch\([\s\S]*?onExpenseSaved\?\.\(\{ queued: !isOnline, isEditing \}\);\s*onClose\(\);/);
  assert.doesNotMatch(source, /await writePromise/);
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

test('does not block a cached signed-in user from opening their own book offline', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /const hasExplicitSharedBook = initialUrl\.pathname\.includes\('\/g\/'\)[\s\S]*?if \(!hasExplicitSharedBook\) \{\s*setCurrentCollectionId\(\(prev\) => prev \|\| user\.uid\);\s*setAuthReady\(true\);/);
});

test('boots a previously verified account into its own book before Safari finishes offline Auth restoration', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /const AUTH_BOOTSTRAP_STORAGE_KEY = 'split-expense-auth-bootstrap-v1'/);
  assert.match(source, /const requestedOwnBook = requestedShortCode[\s\S]*?requestedShortCode === cachedSignedInUser\?\.ownShortCode/);
  assert.match(source, /const cachedOwnBookMatchesUrl = cachedSignedInUser[\s\S]*?!requestedShortCode \|\| requestedOwnBook/);
  assert.match(source, /setCurrentCollectionId\(\(prev\) => prev \|\| cachedSignedInUser\.uid\);[\s\S]*?setAuthReady\(true\)/);
  assert.match(source, /cacheSignedInUser\(user, \{[\s\S]*?collectionId: user\.uid,[\s\S]*?shortCode: myShortCode,[\s\S]*?ownShortCode: myShortCode,/);
  assert.match(source, /clearCachedSignedInUser\(\);\s*await signOut\(auth\)/);
});

test('canonicalizes a bare root URL to the cached own-book URL before the first App render', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /function canonicalizeCachedOwnBookUrl\(\)[\s\S]*?const isBareRootRequest = !requestedShortCode && !url\.searchParams\.has\('shareId'\)[\s\S]*?cachedSignedInUser\?\.ownShortCode[\s\S]*?window\.history\.replaceState\(null, '', ownBookUrl\.toString\(\)\)/);
  const appBody = source.slice(source.indexOf('const App = () => {'));
  assert.match(appBody, /const ownBookBootstrap = canonicalizeCachedOwnBookUrl\(\);[\s\S]*?const \[userId, setUserId\] = useState\(\(\) => ownBookBootstrap\?\.uid \|\| null\);/);
});

test('does not canonicalize an explicit shared link using the cached own-book URL', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isBareRootRequest \|\| !cachedSignedInUser\?\.ownShortCode\) return null;/);
});

test('never restores a last-viewed shared book for an offline own-book URL', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /bootstrap cache is deliberately scoped to the signed-in[\s\S]*?setCurrentCollectionId\(\(prev\) => prev \|\| cachedSignedInUser\.uid\)/);
  assert.doesNotMatch(source, /collectionId: targetCollectionId,\s*shortCode: targetShortCode,\s*ownShortCode: myShortCode/);
});

test('returns to the own book using the same bare URL flow as a fresh launch', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const returnHandler = source.slice(source.indexOf('const handleReturnToOwn'));
  assert.match(returnHandler, /const ownShortCode = cachedSession\?\.uid === userId[\s\S]*?ownBookUrl\.pathname = ownShortCode \? `\$\{normalizedRoot\}g\/\$\{ownShortCode\}` : normalizedRoot[\s\S]*?window\.location\.assign\(ownBookUrl\.toString\(\)\)/);
  assert.doesNotMatch(returnHandler, /getDoc\(|setCurrentCollectionId\(|cacheSignedInUser\(/);
});

test('restores the canonical own-book share URL after a bare URL return', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(navigator\.onLine && !shortCodeFromPath && !shareId && myShortCode\) \{[\s\S]*?window\.history\.replaceState\(null, '', `\$\{rootPath\}g\/\$\{myShortCode\}`\)/);
});

test('uses Firestore cached snapshots rather than Safari navigator.onLine to show offline status', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /onSnapshot\(expensesRef, \{ includeMetadataChanges: true \}, \(snapshot\) => \{[\s\S]*?setIsOnline\(!snapshot\.metadata\.fromCache\)/);
});

test('uses durable Auth persistence without manually restarting Firestore networking', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /initializeAuth\(app, \{\s*persistence: \[indexedDBLocalPersistence, browserLocalPersistence\]/);
  assert.doesNotMatch(source, /enableNetwork\(|disableNetwork\(/);
});

test('uses single-tab Firestore persistence to avoid Safari duplicate listener targets', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /localCache: persistentLocalCache\(\)/);
  assert.doesNotMatch(source, /persistentMultipleTabManager/);
});
