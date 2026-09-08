import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpenseMemberList } from '../src/lib/expense-members.js';

test('自訂帳本只有擁有者時，不會把帳本 ID 視為額外分帳成員', () => {
  const members = buildExpenseMemberList({
    ownerId: 'owner-uid',
    currentUserId: 'owner-uid',
    collectionId: 'group-document-id',
    groupMembers: ['owner-uid'],
    expenses: [{ payerName: 'owner-uid', shares: { 'group-document-id': 0, 'owner-uid': 1 } }],
  });

  assert.deepEqual(members, ['owner-uid']);
});

test('預設帳本 ID 等於擁有者 UID 時，仍保留唯一的擁有者', () => {
  assert.deepEqual(buildExpenseMemberList({
    ownerId: 'owner-uid',
    currentUserId: 'owner-uid',
    collectionId: 'owner-uid',
    groupMembers: ['owner-uid'],
  }), ['owner-uid']);
});

test('保留真實的群組、自訂與歷史分帳成員', () => {
  assert.deepEqual(buildExpenseMemberList({
    ownerId: 'owner-uid',
    currentUserId: 'owner-uid',
    collectionId: 'group-document-id',
    groupMembers: ['owner-uid', 'member-uid'],
    customMembers: ['旅伴'],
    expenses: [{ payerName: '舊成員', shares: { 'member-uid': 1, '歷史成員': 2 } }],
  }), ['owner-uid', 'member-uid', '旅伴', '舊成員', '歷史成員']);
});
