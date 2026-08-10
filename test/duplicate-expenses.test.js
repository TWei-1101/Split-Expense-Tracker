import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDuplicateExpenses } from '../src/lib/duplicate-expenses.js';

const candidate = {
  description: '  Lunch   at Cafe ',
  originalAmount: '100',
  currency: 'TWD',
  payerName: 'alice',
  timestamp: '2026-08-10T12:00:00.000Z',
};

test('同金額、幣別、付款人與正規化品項在前後七日內才是可能重複', () => {
  const matches = findDuplicateExpenses({
    expense: candidate,
    expenses: [
      { id: 'match-before', ...candidate, description: 'lunch at cafe', timestamp: '2026-08-03T12:00:00.000Z' },
      { id: 'match-after', ...candidate, timestamp: new Date('2026-08-17T12:00:00.000Z') },
      { id: 'outside-range', ...candidate, timestamp: '2026-08-17T12:00:00.001Z' },
    ],
  });
  assert.deepEqual(matches.map(item => item.id), ['match-before', 'match-after']);
});

test('不同付款人、幣別、金額、品項與無法解析日期都不命中', () => {
  const matches = findDuplicateExpenses({
    expense: candidate,
    expenses: [
      { id: 'payer', ...candidate, payerName: 'bob' },
      { id: 'currency', ...candidate, currency: 'JPY' },
      { id: 'amount', ...candidate, originalAmount: 101 },
      { id: 'description', ...candidate, description: 'Dinner at Cafe' },
      { id: 'bad-date', ...candidate, timestamp: 'not-a-date' },
    ],
  });
  assert.equal(matches.length, 0);
});

test('編輯時排除自身，且支援 Firestore timestamp、Date 與日期字串', () => {
  const matches = findDuplicateExpenses({
    expense: { ...candidate, id: 'self', timestamp: { toDate: () => new Date('2026-08-10T12:00:00.000Z') } },
    expenses: [
      { id: 'self', ...candidate, timestamp: new Date('2026-08-10T12:00:00.000Z') },
      { id: 'string-date', ...candidate, timestamp: '2026-08-11' },
    ],
    excludeExpenseId: 'self',
  });
  assert.deepEqual(matches.map(item => item.id), ['string-date']);
});

test('重複提醒只在提交時顯示，取消不寫入，確認後允許單次儲存', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /findDuplicateExpenses\(/);
  assert.match(appSource, /可能重複/);
  assert.match(appSource, /仍要儲存/);
  assert.match(appSource, /saveExpense\(true\)/);
});
