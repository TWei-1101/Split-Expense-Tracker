import test from 'node:test';
import assert from 'node:assert/strict';
import { formatExpenseDateTimeLocal, parseExpenseDateTimeLocal } from '../src/lib/expense-date-time.js';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');

test('建立日期時間可轉為 datetime-local 欄位值並還原為同一分鐘', () => {
  const date = new Date(2026, 7, 12, 10, 42, 35);
  const value = formatExpenseDateTimeLocal(date);
  assert.equal(value, '2026-08-12T10:42');
  assert.equal(parseExpenseDateTimeLocal(value)?.getTime(), new Date(2026, 7, 12, 10, 42).getTime());
});

test('無效建立日期時間不能寫入', () => {
  assert.equal(parseExpenseDateTimeLocal('not-a-date'), null);
});

test('新增支出提供建立日期時間欄位，並以使用者設定的日期儲存', () => {
  assert.match(appSource, /name="occurredAt"/);
  assert.match(appSource, /type="datetime-local"/);
  assert.match(appSource, /max-w-64/);
  assert.match(appSource, /timestamp: occurredAt/);
});
