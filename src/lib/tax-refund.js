export const TAX_REFUND_PROFILES = [
  { country: 'JP', label: '日本', currency: 'JPY', rate: 0.10, autoCurrency: true },
  { country: 'KR', label: '韓國', currency: 'KRW', rate: 0.10, autoCurrency: true },
  { country: 'TH', label: '泰國', currency: 'THB', rate: 0.07, autoCurrency: true },
  { country: 'AU', label: '澳洲', currency: 'AUD', rate: 0.10, autoCurrency: true },
  { country: 'NO', label: '挪威', currency: 'NOK', rate: 0.25, autoCurrency: true },
  { country: 'SG', label: '新加坡', currency: 'SGD', rate: 0.09, autoCurrency: true },
  { country: 'FR', label: '法國', currency: 'EUR', rate: 0.20 },
  { country: 'DE', label: '德國', currency: 'EUR', rate: 0.19 },
  { country: 'IT', label: '義大利', currency: 'EUR', rate: 0.22 },
  { country: 'ES', label: '西班牙', currency: 'EUR', rate: 0.21 },
];

export function getTaxRefundProfile(currency) {
  return TAX_REFUND_PROFILES.find((profile) => profile.currency === currency && profile.autoCurrency) || null;
}

export function getTaxRefundProfileByCountry(country) {
  return TAX_REFUND_PROFILES.find((profile) => profile.country === country) || null;
}

export function estimateTaxRefund(amount, rate) {
  const gross = Number(amount) || 0;
  const taxRate = Number(rate) || 0;
  return Math.round((gross / (1 + taxRate)) * taxRate);
}

export function createTaxRefund({ currency, originalAmount, exchangeRate, country, status = 'pending' }) {
  const profile = country ? getTaxRefundProfileByCountry(country) : getTaxRefundProfile(currency);
  const rate = profile?.rate || 0;
  const estimatedAmount = estimateTaxRefund(originalAmount, rate);
  return {
    eligible: true,
    country: profile?.country || '',
    rate,
    estimatedAmount,
    estimatedAmountInTWD: Math.round(estimatedAmount * (Number(exchangeRate) || 0)),
    exchangeRate: Number(exchangeRate) || 0,
    status: status === 'received' ? 'received' : 'pending',
  };
}

export function pendingTaxRefundTotalInTWD(expenses) {
  return expenses.reduce((total, expense) => {
    const refund = expense.taxRefund;
    if (!refund?.eligible || refund.status !== 'pending') return total;
    // 新資料以保存時匯率計算；已存在資料相容舊的 estimatedAmountInTWD 欄位。
    const storedAmount = Number(refund.estimatedAmountInTWD);
    const convertedAmount = Number(refund.estimatedAmount) * Number(refund.exchangeRate);
    return total + (Number.isFinite(convertedAmount) && convertedAmount > 0 ? convertedAmount : (Number.isFinite(storedAmount) ? storedAmount : 0));
  }, 0);
}
