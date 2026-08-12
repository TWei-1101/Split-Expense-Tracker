const SUPPORTED_CURRENCIES = new Set(['TWD', 'CNY', 'HKD', 'USD', 'THB', 'EUR', 'CAD', 'VND', 'IDR', 'JPY', 'KRW', 'AUD', 'NOK']);

function toDateTimeLocal(value) {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const pad = (number) => String(number).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function normalizeReceiptOcrResult(result = {}) {
  const normalized = {};
  if (typeof result.description === 'string' && result.description.trim()) normalized.description = result.description.trim();
  const amount = Number(result.originalAmount);
  if (Number.isFinite(amount) && amount > 0) normalized.originalAmount = amount;
  const currency = typeof result.currency === 'string' ? result.currency.toUpperCase() : '';
  if (SUPPORTED_CURRENCIES.has(currency)) normalized.currency = currency;
  const occurredAt = toDateTimeLocal(result.occurredAt);
  if (occurredAt) normalized.occurredAt = occurredAt;
  return normalized;
}
