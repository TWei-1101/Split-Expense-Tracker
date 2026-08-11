import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExpiredRecycleBinCleanupPlan,
  createRecycleBinRecord,
  isRecycleBinRecordExpired,
} from '../src/lib/expense-recycle-bin.js';

test('移入回收桶會保留原始 id、完整支出資料與刪除時間', () => {
  const expense = { id: 'expense-1', description: '晚餐', imagePath: 'groups/a/expense_images/1.jpg', shares: { A: 1 } };
  const record = createRecycleBinRecord({ expense, deletedAt: 123456 });

  assert.equal(record.id, 'expense-1');
  assert.equal(record.deletedAt, 123456);
  assert.deepEqual(record.expense, expense);
});

test('僅刪除超過 30 天的回收桶紀錄，並以小於 500 筆的批次規劃', () => {
  const now = 31 * 24 * 60 * 60 * 1000;
  const records = Array.from({ length: 501 }, (_, index) => ({
    id: `old-${index}`,
    deletedAt: 1,
    expense: { imagePath: `groups/a/expense_images/${index}.jpg` },
  })).concat([{ id: 'still-here', deletedAt: now - (29 * 24 * 60 * 60 * 1000), expense: {} }]);

  const plan = buildExpiredRecycleBinCleanupPlan({ records, now, batchSize: 400 });

  assert.equal(isRecycleBinRecordExpired(records[0], now), true);
  assert.equal(isRecycleBinRecordExpired(records.at(-1), now), false);
  assert.deepEqual(plan.batches.map(batch => batch.length), [400, 101]);
  assert.equal(plan.imagePaths.length, 501);
  assert.equal(plan.imagePaths[0], 'groups/a/expense_images/0.jpg');
});
