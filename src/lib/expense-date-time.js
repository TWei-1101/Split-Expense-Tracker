import { expenseTimestampToDate } from './duplicate-expenses.js';

export function formatExpenseDateTimeLocal(value = new Date()) {
  const date = expenseTimestampToDate(value) || new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function parseExpenseDateTimeLocal(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
