import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupBookList,
  createNewGroupBook,
  isViewingOwnGroupBook,
  renameGroupBookInList,
  mergeGroupBookSnapshot,
} from '../src/lib/group-books.js';

test('群組帳本列表會合併 owner 與 members 查詢、去重並依名稱排序', () => {
  const books = buildGroupBookList({
    userId: 'u1',
    owned: [
      { id: 'own', data: { name: '日本旅遊', owner: 'u1', members: ['u1'] } },
      { id: 'both', data: { name: '家庭帳', owner: 'u1', members: ['u1', 'u2'] } },
    ],
    invited: [
      { id: 'both', data: { name: '家庭帳', owner: 'u1', members: ['u1', 'u2'] } },
      { id: 'invite', data: { name: '聚餐', owner: 'u2', members: ['u1', 'u2'] } },
    ],
  });

  assert.deepEqual(books, [
    { id: 'own', name: '日本旅遊', role: 'owner' },
    { id: 'both', name: '家庭帳', role: 'owner' },
    { id: 'invite', name: '聚餐', role: 'member' },
  ]);
});

test('舊帳本沒有名稱時以既有預設名稱呈現，且不納入非成員帳本', () => {
  const books = buildGroupBookList({
    userId: 'u1',
    owned: [{ id: 'legacy', data: { owner: 'u1', members: [] } }],
    invited: [{ id: 'other', data: { owner: 'u2', members: ['u3'] } }],
  });

  assert.deepEqual(books, [{ id: 'legacy', name: '分帳記帳簿', role: 'owner' }]);
});

test('建立新帳本模型會修剪名稱並維持獨立 owner/members 結構', () => {
  assert.deepEqual(createNewGroupBook('  京都自由行  ', 'u1'), {
    name: '京都自由行',
    owner: 'u1',
    members: ['u1'],
  });
  assert.equal(createNewGroupBook('   ', 'u1'), null);
});

test('登入者回到 UID 對應的預設帳本時，不必等待群組 owner snapshot 也會視為自己的帳本', () => {
  assert.equal(isViewingOwnGroupBook({
    userId: 'u1',
    currentCollectionId: 'u1',
    groupOwner: null,
    isGuest: false,
  }), true);
  assert.equal(isViewingOwnGroupBook({
    userId: 'u1',
    currentCollectionId: 'shared',
    groupOwner: null,
    isGuest: false,
  }), false);
  assert.equal(isViewingOwnGroupBook({
    userId: 'u1',
    currentCollectionId: 'u1',
    groupOwner: null,
    isGuest: true,
  }), false);
});

test('帳本改名成功後會立即更新帳本選擇清單並維持排序', () => {
  const renamed = renameGroupBookInList([
    { id: 'jp', name: '日本旅遊', role: 'owner' },
    { id: 'family', name: '家庭帳', role: 'member' },
  ], 'jp', '  京都自由行  ');

  assert.deepEqual(renamed, [
    { id: 'jp', name: '京都自由行', role: 'owner' },
    { id: 'family', name: '家庭帳', role: 'member' },
  ]);
});

test('晚到的舊名稱 snapshot 不會覆蓋帳本改名的樂觀狀態，確認名稱後才解除保護', () => {
  const books = [{ id: 'jp', name: '京都自由行', role: 'owner' }];
  const stale = mergeGroupBookSnapshot({
    books,
    userId: 'u1',
    id: 'jp',
    data: { name: '日本旅遊', owner: 'u1', members: ['u1'] },
    pendingName: '京都自由行',
  });

  assert.deepEqual(stale, {
    books,
    pendingName: '京都自由行',
  });

  const acknowledged = mergeGroupBookSnapshot({
    books: stale.books,
    userId: 'u1',
    id: 'jp',
    data: { name: '京都自由行', owner: 'u1', members: ['u1'] },
    pendingName: stale.pendingName,
  });

  assert.deepEqual(acknowledged, {
    books,
    pendingName: null,
  });
});
