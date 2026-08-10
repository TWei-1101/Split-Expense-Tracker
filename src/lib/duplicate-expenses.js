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

// New records store the payer as a member UID, while some older records store
// the member's display name.  Only translate a legacy display name when it
// resolves to exactly one known member; otherwise keep the literal value so
// two members with the same display name can never be merged accidentally.
export function canonicalPayerIdentity(payerName, { members = [], getDisplayName } = {}) {
  if (!payerName) return '';
  if (payerName === '__self__') return '__self__';

  if (members.includes(payerName)) return `member:${payerName}`;
  if (typeof getDisplayName !== 'function') return `legacy:${payerName}`;

  const matchingMembers = members.filter(memberId => getDisplayName(memberId) === payerName);
  return matchingMembers.length === 1
    ? `member:${matchingMembers[0]}`
    : `legacy:${payerName}`;
}

export function findDuplicateExpenses({ expense, expenses = [], excludeExpenseId, payerIdentityOptions } = {}) {
  const targetAmount = Number(expense?.originalAmount);
  const targetCategory = normalizeExpenseCategory(expense?.category);
  const targetPayer = canonicalPayerIdentity(expense?.payerName, payerIdentityOptions);

  if (!Number.isFinite(targetAmount) || !targetPayer) return [];

  return expenses.filter(existing => {
    if (!existing || existing.id === excludeExpenseId) return false;
    if (Number(existing.originalAmount) !== targetAmount
      || existing.currency !== expense.currency
      || canonicalPayerIdentity(existing.payerName, payerIdentityOptions) !== targetPayer
      || normalizeExpenseCategory(existing.category) !== targetCategory) return false;

    return true;
  });
}
