import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPENSE_CATEGORIES,
  inferExpenseCategory,
  resolveExpenseCategory,
  calculateMemberCategorySpending,
  toggleExpenseCategoryFilter,
  filterExpensesByCategory,
} from '../src/lib/expense-categories.js';

test('品項依中英日旅遊關鍵字自動分類，未命中歸其他', () => {
  assert.equal(inferExpenseCategory('拉麵晚餐'), EXPENSE_CATEGORIES.FOOD);
  assert.equal(inferExpenseCategory('Airport express train'), EXPENSE_CATEGORIES.TRANSPORT);
  assert.equal(inferExpenseCategory('ホテル Hotel 住宿'), EXPENSE_CATEGORIES.LODGING);
  assert.equal(inferExpenseCategory('7-Eleven'), EXPENSE_CATEGORIES.OTHER);
  assert.equal(inferExpenseCategory('伴手禮'), EXPENSE_CATEGORIES.OTHER);
});

test('新支出描述變更可重算分類，但使用者手動選擇後不被覆蓋', () => {
  assert.equal(resolveExpenseCategory({ description: '咖啡', categoryWasManuallySelected: false }), EXPENSE_CATEGORIES.FOOD);
  assert.equal(resolveExpenseCategory({ description: '咖啡', category: EXPENSE_CATEGORIES.TRANSPORT, categoryWasManuallySelected: true }), EXPENSE_CATEGORIES.TRANSPORT);
});

test('支出分類篩選可切換、再次點同類別取消，且舊資料歸其他', () => {
  assert.equal(toggleExpenseCategoryFilter(null, EXPENSE_CATEGORIES.FOOD), EXPENSE_CATEGORIES.FOOD);
  assert.equal(toggleExpenseCategoryFilter(EXPENSE_CATEGORIES.FOOD, EXPENSE_CATEGORIES.FOOD), null);
  assert.equal(toggleExpenseCategoryFilter(EXPENSE_CATEGORIES.FOOD, EXPENSE_CATEGORIES.TRANSPORT), EXPENSE_CATEGORIES.TRANSPORT);

  const expenses = [
    { id: 'food', category: EXPENSE_CATEGORIES.FOOD },
    { id: 'transport', category: EXPENSE_CATEGORIES.TRANSPORT },
    { id: 'legacy' },
  ];
  assert.deepEqual(filterExpensesByCategory(expenses, EXPENSE_CATEGORIES.FOOD).map(expense => expense.id), ['food']);
  assert.deepEqual(filterExpensesByCategory(expenses, EXPENSE_CATEGORIES.OTHER).map(expense => expense.id), ['legacy']);
  assert.equal(filterExpensesByCategory(expenses, null), expenses);
});

test('各成員分類支出依份數分攤、使用保存的台幣金額，且舊資料歸其他', () => {
  const spending = calculateMemberCategorySpending({
    members: ['a', 'b', 'c'],
    expenses: [
      { amountInTWD: 900, category: 'food', payerName: 'a', shares: { a: 1, b: 2 } },
      { amountInTWD: 600, category: 'transport', payerName: '__self__', shares: { a: 1, c: 1 } },
      { amountInTWD: 750, category: 'lodging', payerName: 'b', shares: { b: 3 } },
      { amountInTWD: 100, payerName: 'c', shares: { c: 1 } },
      { originalAmount: 1000, exchangeRate: 0.25, category: 'food', payerName: 'a', shares: { a: 1 } },
    ],
  });

  assert.deepEqual(spending.a, { food: 550, transport: 300, lodging: 0, other: 0, total: 850 });
  assert.deepEqual(spending.b, { food: 600, transport: 0, lodging: 750, other: 0, total: 1350 });
  assert.deepEqual(spending.c, { food: 0, transport: 300, lodging: 0, other: 100, total: 400 });
});

test('退稅資訊不改變分類分攤金額', () => {
  const spending = calculateMemberCategorySpending({
    members: ['a', 'b'],
    expenses: [{
      amountInTWD: 1000,
      category: 'food',
      payerName: 'a',
      shares: { a: 1, b: 1 },
      taxRefund: { eligible: true, estimatedAmountInTWD: 100, status: 'pending' },
    }],
  });
  assert.equal(spending.a.food, 500);
  assert.equal(spending.b.food, 500);
});

test('支出表單提供分類手動調整，所有支出提供分類篩選', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /htmlFor="expense-category"/);
  assert.match(appSource, /setCategoryWasManuallySelected\(true\)/);
  assert.match(appSource, /aria-label="支出分類篩選"/);
});

test('各自付款篩選沒有結果時不洩漏內部付款人 key', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /filterPayer === SELF_PAYER_KEY\s*\?\s*'目前沒有任何支出記錄。'/);
});
