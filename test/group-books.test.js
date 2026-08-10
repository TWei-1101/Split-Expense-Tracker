import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupBookList, createNewGroupBook } from '../src/lib/group-books.js';

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
