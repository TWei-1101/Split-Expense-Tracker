import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenseImagePath, isGroupImagePath, deleteImageIfPresent, finalizeExpenseImageWrite, deleteRecordsWithImages } from '../src/lib/expense-images.js';
import { createGroupDeletionPlan } from '../src/lib/group-deletion.js';

test('versioned image paths never overwrite an earlier upload', () => {
  assert.notEqual(createExpenseImagePath('g', 'e', 'v1'), createExpenseImagePath('g', 'e', 'v2'));
  assert.equal(isGroupImagePath(createExpenseImagePath('g', 'e', 'v1'), 'app', 'g'), true);
  for (const path of ['groups/other/expense_images/e.jpg', 'groups/g/expense_images/../x', 'https://example.test/x', 'groups/g/expense_images/']) {
    assert.equal(isGroupImagePath(path, 'app', 'g'), false);
  }
});

test('old photo is kept until the database acknowledges the new photo', async () => {
  let resolve;
  const write = new Promise(done => { resolve = done; });
  const removed = [];
  const pending = finalizeExpenseImageWrite({ write, oldPath: 'old', newPath: 'new', remove: async path => removed.push(path) });
  await Promise.resolve();
  assert.deepEqual(removed, []);
  resolve();
  await pending;
  assert.deepEqual(removed, ['old']);
});

test('rejected write removes only the new upload, never the old photo', async () => {
  const removed = [];
  await assert.rejects(finalizeExpenseImageWrite({ write: Promise.reject(new Error('denied')), oldPath: 'old', newPath: 'new', remove: async path => removed.push(path) }), /denied/);
  assert.deepEqual(removed, ['new']);
});

test('removing an attachment waits for successful write and unchanged photos are kept', async () => {
  const removed = [];
  for (const newPath of ['old', '']) {
    await finalizeExpenseImageWrite({ write: Promise.resolve(), oldPath: 'old', newPath, remove: async path => removed.push(path) });
  }
  assert.deepEqual(removed, ['old']);
});

test('cleanup failure does not turn a successful database write into a failed save', async () => {
  const warnings = [];
  await finalizeExpenseImageWrite({ write: Promise.resolve(), oldPath: 'old', newPath: 'new', remove: async () => { throw Error('offline'); }, onCleanupError: error => warnings.push(error.message) });
  assert.deepEqual(warnings, ['offline']);
});

test('missing image is idempotent but permission failure is not swallowed', async () => {
  await deleteImageIfPresent(async () => { throw { code: 'storage/object-not-found' }; }, 'x');
  await assert.rejects(deleteImageIfPresent(async () => { throw Error('permission'); }, 'x'), /permission/);
});

test('permanent deletion keeps references on image failure and can be retried', async () => {
  let deleted = false;
  const args = { records: [{ imagePath: 'groups/g/expense_images/e.jpg' }], appId: 'app', groupId: 'g', removeRecords: async () => { deleted = true; } };
  await assert.rejects(deleteRecordsWithImages({ ...args, removeImage: async () => { throw Error('offline'); } }), /offline/);
  assert.equal(deleted, false);
  await deleteRecordsWithImages({ ...args, removeImage: async () => {} });
  assert.equal(deleted, true);
});

test('cleanup recognizes current and legacy paths, limits scope and deduplicates', async () => {
  const records = [{ imagePath: 'groups/g/expense_images/e.jpg' }, { imagePath: 'groups/g/expense_images/e.jpg' }, { imagePath: 'artifacts/app/groups/g/expense-images/e.jpg' }, { imagePath: 'groups/other/expense_images/e.jpg' }];
  const plan = createGroupDeletionPlan({ appId: 'app', groupId: 'g', expenses: records });
  assert.equal(plan.safeImagePaths.length, 2);
  assert.equal(plan.recycleBinPath, 'artifacts/app/groups/g/expense-recycle-bin');
  assert.equal(plan.settingsPath, 'artifacts/app/groups/g/settings');
  const events = [];
  await deleteRecordsWithImages({ records, appId: 'app', groupId: 'g', removeImage: async path => events.push(path), removeRecords: async () => events.push('records') });
  assert.deepEqual(events, [...plan.safeImagePaths, 'records']);
});
