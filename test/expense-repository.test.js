import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getExpensePath,
  getGroupExpensesPath,
  mapExpenseSnapshot,
} from '../src/services/expenseRepository.js';

test('expense repository constructs the established group expense paths', () => {
  assert.equal(getGroupExpensesPath('app', 'group'), 'artifacts/app/groups/group/expenses');
  assert.equal(getExpensePath('app', 'group', 'expense'), 'artifacts/app/groups/group/expenses/expense');
});

test('expense repository preserves the legacy Firestore snapshot mapping', () => {
  const mapped = mapExpenseSnapshot({
    id: 'expense-1',
    data: () => ({ amount: '100', currency: 'JPY', timestamp: { toDate: () => 'date' } }),
  }, 'TWD', { JPY: 0.25 });

  assert.deepEqual(mapped, {
    id: 'expense-1', amount: '100', originalAmount: 100, currency: 'JPY', exchangeRate: 0.25,
    amountInTWD: 25, shares: {}, timestamp: 'date',
  });
});

test('expense CRUD is centralized outside the UI and app orchestrator', () => {
  const repositorySource = readFileSync(new URL('../src/services/expenseRepository.js', import.meta.url), 'utf8');
  const modalSource = readFileSync(new URL('../src/features/expenses/ExpenseModal.jsx', import.meta.url), 'utf8');

  assert.match(repositorySource, /export const (createExpense|updateExpense|deleteExpense)/);
  assert.match(modalSource, /createExpense\(db, appId, collectionId/);
  assert.match(modalSource, /updateExpense\(db, appId, collectionId/);
});
