import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGroupSnapshot, normalizeMemberSettings } from '../src/hooks/useGroup.js';
import { readSharedCollectionId } from '../src/hooks/useAuth.js';

test('normalizes a group owner into members and keeps the fallback name', () => {
  assert.deepEqual(normalizeGroupSnapshot({ owner: 'owner', members: ['member'] }), {
    owner: 'owner',
    members: ['member', 'owner'],
    name: '分帳記帳簿',
  });
});

test('reads short shared codes before legacy share IDs', () => {
  assert.equal(readSharedCollectionId('https://expense.test/g/ABC123?shareId=legacy'), 'ABC123');
  assert.equal(readSharedCollectionId('https://expense.test/?shareId=legacy'), null);
});

test('normalizes absent member settings without carrying stale values', () => {
  assert.deepEqual(normalizeMemberSettings(null), { list: [], defaultShares: {} });
  assert.deepEqual(normalizeMemberSettings({ list: ['A'], defaultShares: { A: 2 } }), {
    list: ['A'],
    defaultShares: { A: 2 },
  });
});
