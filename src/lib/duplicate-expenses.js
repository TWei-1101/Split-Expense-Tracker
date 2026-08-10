const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  const targetDate = expenseTimestampToDate(expense?.timestamp) || new Date();
  const targetAmount = Number(expense?.originalAmount);
  const targetDescription = normalizeExpenseDescription(expense?.description);

  if (!targetDescription || !Number.isFinite(targetAmount)) return [];

  return expenses.filter(existing => {
    if (!existing || existing.id === excludeExpenseId) return false;
    if (Number(existing.originalAmount) !== targetAmount
      || existing.currency !== expense.currency
      || existing.payerName !== expense.payerName
      || normalizeExpenseDescription(existing.description) !== targetDescription) return false;

    const existingDate = expenseTimestampToDate(existing.timestamp);
    return existingDate && Math.abs(existingDate.getTime() - targetDate.getTime()) <= DUPLICATE_WINDOW_MS;
  });
}
