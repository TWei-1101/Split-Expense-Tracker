const SUPPORTED_CURRENCIES = new Set(['TWD', 'CNY', 'HKD', 'USD', 'THB', 'EUR', 'CAD', 'VND', 'IDR', 'JPY', 'KRW', 'AUD', 'NOK']);

function toDateTimeLocal(value) {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const pad = (number) => String(number).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function toPositiveAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;

  // OCR commonly returns currency symbols and locale-specific thousands
  // separators (for example, \"￥1，161\").  Accept only a complete monetary
  // value after removing those presentation characters, never a number
  // embedded in arbitrary text.
  const normalized = value
    .trim()
    .replace(/[\s,，]/g, '')
    .replace(/^(?:NT\$|TWD|USD|JPY|CNY|HKD|THB|EUR|CAD|VND|IDR|KRW|AUD|NOK|[¥￥$€£])/i, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export function normalizeReceiptOcrResult(result = {}) {
  const normalized = {};
  if (typeof result.description === 'string' && result.description.trim()) normalized.description = result.description.trim();
  const amount = toPositiveAmount(result.originalAmount ?? result.amount);
  if (amount !== undefined) normalized.originalAmount = amount;
  const currency = typeof result.currency === 'string' ? result.currency.toUpperCase() : '';
  if (SUPPORTED_CURRENCIES.has(currency)) normalized.currency = currency;
  const occurredAt = toDateTimeLocal(result.occurredAt);
  if (occurredAt) normalized.occurredAt = occurredAt;
  return normalized;
}

// Keep form state in the same shape produced by a native number input: its
// value is a string while the user is editing.  In particular, do not rely on
// React coercing a numeric OCR value for a controlled <input type="number">.
// That coercion was the last ambiguous hop between the API response and the
// visible field on iOS.
export function mergeReceiptOcrIntoExpense(expense = {}, result = {}) {
  const fields = normalizeReceiptOcrResult(result);
  return {
    ...expense,
    ...fields,
    ...(fields.originalAmount !== undefined
      ? { originalAmount: String(fields.originalAmount) }
      : {}),
  };
}
