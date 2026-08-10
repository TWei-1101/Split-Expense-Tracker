import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createLuggageItem,
  normalizeLuggageList,
  getLuggageId,
  getExpenseLuggageId,
  buildLuggageDeletionPlan,
  groupTaxRefundExpensesByLuggage,
} from '../src/lib/luggage.js';

test('行李箱名稱會去除空白，且避免重複名稱', () => {
  assert.deepEqual(createLuggageItem({ name: '  黑色 28 吋  ', ownerId: 'u1', existing: [] }), {
    id: 'luggage-new', name: '黑色 28 吋', ownerId: 'u1',
  });
  assert.throws(() => createLuggageItem({ name: '黑色 28 吋', existing: [{ id: 'x', name: ' 黑色 28 吋 ' }] }), /相同/);
});

test('舊退稅資料沒有 luggageId 時視為未指定', () => {
  assert.equal(getLuggageId({ eligible: true }), '');
  assert.deepEqual(normalizeLuggageList([{ id: 'a', name: ' A ' }, { id: '', name: 'bad' }]), [{ id: 'a', name: 'A', ownerId: '' }]);
});

test('行李箱指派適用所有支出，並相容舊退稅欄位', () => {
  assert.equal(getExpenseLuggageId({ luggageId: 'case-a', taxRefund: { eligible: false } }), 'case-a');
  assert.equal(getExpenseLuggageId({ taxRefund: { eligible: true, luggageId: 'case-b' } }), 'case-b');
});

test('刪行李箱計畫解除所有類型的支出，並可分批處理', () => {
  const plan = buildLuggageDeletionPlan({ luggageId: 'case-a', expenses: [
    { id: '1', taxRefund: { eligible: true, luggageId: 'case-a' } },
    { id: '2', luggageId: 'case-a', taxRefund: { eligible: false } },
    { id: '3', taxRefund: { eligible: true, luggageId: 'case-b' } },
    { id: '4', taxRefund: { eligible: true, luggageId: 'case-a' } },
  ], batchSize: 1 });
  assert.equal(plan.affectedCount, 3);
  assert.deepEqual(plan.batches.map(batch => batch.map(item => item.id)), [['1'], ['2'], ['4']]);
});

test('退稅商品能按行李箱分組並統計未指定', () => {
  const groups = groupTaxRefundExpensesByLuggage({
    expenses: [
      { id: '1', description: '藥妝', taxRefund: { eligible: true, luggageId: 'a' } },
      { id: '2', description: '衣服', taxRefund: { eligible: true } },
      { id: '3', description: '一般商品', luggageId: 'a', taxRefund: { eligible: false } },
    ], luggage: [{ id: 'a', name: '黑色箱' }],
  });
  assert.equal(groups.unassigned.length, 1);
  assert.equal(groups.byLuggage[0].expenses.length, 1);
  assert.equal(groups.byLuggage[0].regularExpenses.length, 1);
});

test('支出列表會顯示已指派的行李箱名稱', async () => {
  const source = await readFile(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /luggageName = luggageById\.get\(getExpenseLuggageId\(exp\)\)/);
  assert.match(source, /🧳 \{luggageName\}/);
});
