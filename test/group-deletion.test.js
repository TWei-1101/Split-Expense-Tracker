import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDeleteGroupBook,
  createGroupDeletionPlan,
  createGroupDeletionConfirmationSteps,
  deleteGroupBookDataThenCleanup,
} from '../src/lib/group-deletion.js';

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

test('只有帳本 owner 且非訪客可刪除帳本', () => {
  assert.equal(canDeleteGroupBook({ userId: 'owner', groupOwner: 'owner', isGuest: false }), true);
  assert.equal(canDeleteGroupBook({ userId: 'member', groupOwner: 'owner', isGuest: false }), false);
  assert.equal(canDeleteGroupBook({ userId: 'owner', groupOwner: 'owner', isGuest: true }), false);
});

test('刪除計畫只處理目標帳本的 expenses、members 與安全的收據路徑', () => {
  const plan = createGroupDeletionPlan({
    appId: 'app',
    groupId: 'trip-2026',
    expenses: [
      { id: 'e1', imagePath: 'artifacts/app/groups/trip-2026/expense-images/e1.jpg' },
      { id: 'e2', imagePath: 'artifacts/app/groups/other/expense-images/e2.jpg' },
      { id: 'e3', imagePath: 'https://example.test/legacy.jpg' },
    ],
  });

  assert.equal(plan.expensesPath, 'artifacts/app/groups/trip-2026/expenses');
  assert.equal(plan.membersPath, 'artifacts/app/groups/trip-2026/settings/members');
  assert.equal(plan.groupPath, 'artifacts/app/groups/trip-2026');
  assert.deepEqual(plan.safeImagePaths, ['artifacts/app/groups/trip-2026/expense-images/e1.jpg']);
  assert.deepEqual(plan.unmanagedImagePaths, [
    'artifacts/app/groups/other/expense-images/e2.jpg',
    'https://example.test/legacy.jpg',
  ]);
});

test('刪除帳本必須經過警告與最後確認兩步', () => {
  const steps = createGroupDeletionConfirmationSteps('京都自由行');
  assert.equal(steps.length, 2);
  assert.match(steps[0].title, /第 1\/2 步/);
  assert.match(steps[1].title, /第 2\/2 步/);
  assert.match(steps[1].message, /京都自由行/);
});

test('帳本資料刪除後必須先切換並解鎖介面，不等待慢速圖片清理', async () => {
  const imageCleanup = deferred();
  const events = [];

  await deleteGroupBookDataThenCleanup({
    deleteFirestoreData: async () => {
      events.push('firestore-deleted');
      return { safeImagePaths: ['artifacts/app/groups/old/expense-images/a.jpg'] };
    },
    chooseNextBook: async () => ({ id: 'next', name: '下一本帳本' }),
    applyUiTransition: (nextBook) => events.push(`switched:${nextBook.id}`),
    deleteImages: () => imageCleanup.promise.then(() => events.push('images-deleted')),
    onBackgroundCleanupStart: () => events.push('cleanup-started'),
    onBackgroundCleanupDone: () => events.push('cleanup-finished'),
  });

  assert.deepEqual(events, [
    'firestore-deleted',
    'switched:next',
    'cleanup-started',
  ]);

  imageCleanup.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events.slice(-2), ['images-deleted', 'cleanup-finished']);
});
