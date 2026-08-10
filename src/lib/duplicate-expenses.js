import { normalizeExpenseCategory } from './expense-categories.js';

export function normalizeExpenseDescription(description) {
  return String(description || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

export function expenseTimestampToDate(timestamp) {
  if (timestamp instanceof Date) return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  if (timestamp && typeof timestamp.toDate === 'function') return expenseTimestampToDate(timestamp.toDate());
  if (timestamp && Number.isFinite(timestamp.seconds)) return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1e6);
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function findDuplicateExpenses({ expense, expenses = [], excludeExpenseId } = {}) {
  const targetAmount = Number(expense?.originalAmount);
  const targetCategory = normalizeExpenseCategory(expense?.category);

  if (!Number.isFinite(targetAmount)) return [];

  return expenses.filter(existing => {
    if (!existing || existing.id === excludeExpenseId) return false;
    if (Number(existing.originalAmount) !== targetAmount
      || existing.currency !== expense.currency
      || existing.payerName !== expense.payerName
      || normalizeExpenseCategory(existing.category) !== targetCategory) return false;

    return true;
  });
}
