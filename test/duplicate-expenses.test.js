import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDuplicateExpenses } from '../src/lib/duplicate-expenses.js';

const candidate = {
  description: '  Lunch   at Cafe ',
  originalAmount: '100',
  currency: 'TWD',
  payerName: 'alice',
  category: 'food',
  timestamp: '2026-08-10T12:00:00.000Z',
};

test('同金額、幣別、付款人與分類即使日期或品項不同仍是可能重複', () => {
  const matches = findDuplicateExpenses({
    expense: candidate,
    expenses: [
      { id: 'old-match', ...candidate, description: '早餐', timestamp: '2020-01-01T12:00:00.000Z' },
      { id: 'future-match', ...candidate, description: '晚餐', timestamp: new Date('2030-12-31T12:00:00.000Z') },
    ],
  });
  assert.deepEqual(matches.map(item => item.id), ['old-match', 'future-match']);
});

test('不同付款人、幣別、金額或分類不命中', () => {
  const matches = findDuplicateExpenses({
    expense: candidate,
    expenses: [
      { id: 'payer', ...candidate, payerName: 'bob' },
      { id: 'currency', ...candidate, currency: 'JPY' },
      { id: 'amount', ...candidate, originalAmount: 101 },
      { id: 'category', ...candidate, category: 'transport' },
    ],
  });
  assert.equal(matches.length, 0);
});

test('舊資料缺少分類時視為其他，編輯時排除自身', () => {
  const matches = findDuplicateExpenses({
    expense: { ...candidate, id: 'self', category: 'other', timestamp: { toDate: () => new Date('2026-08-10T12:00:00.000Z') } },
    expenses: [
      { id: 'self', ...candidate, timestamp: new Date('2026-08-10T12:00:00.000Z') },
      { id: 'legacy-other', ...candidate, category: undefined, timestamp: 'not-a-date' },
    ],
    excludeExpenseId: 'self',
  });
  assert.deepEqual(matches.map(item => item.id), ['legacy-other']);
});

test('重複提醒只在提交時顯示，取消不寫入，確認後允許單次儲存', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /findDuplicateExpenses\(/);
  assert.match(appSource, /可能重複/);
  assert.match(appSource, /仍要儲存/);
  assert.match(appSource, /saveExpense\(true\)/);
});
