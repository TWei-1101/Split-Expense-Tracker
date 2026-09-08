// 幣別換算工具：所有跨幣別計算都走這裡，方便 unit test。
//
// 設計重點：
// - parseFloat + || 0：空字串/NaN 統一回 0，避免下游計算被 NaN 汙染
// - 不在這裡 round：保留原始乘積，display 端用 toFixed 控制顯示精度
export function convertToTWD(originalAmount, exchangeRate) {
  const amount = parseFloat(originalAmount) || 0;
  const rate = Number(exchangeRate) || 0;
  return amount * rate;
}

// Frankfurter v2 returns one row per TWD/quote pair. The app stores the
// inverse value so every rate consistently means "1 unit = x TWD".
export function normalizeFrankfurterRates(rows, currencies, fallbackRates) {
  if (!Array.isArray(rows)) {
    throw new TypeError('Frankfurter rates must be an array');
  }

  const twdToCurrency = new Map(
    rows
      .filter((row) => row?.base === 'TWD'
        && typeof row.quote === 'string'
        && Number.isFinite(row.rate)
        && row.rate > 0)
      .map((row) => [row.quote, row.rate]),
  );

  return Object.fromEntries(currencies.map((code) => {
    if (code === 'TWD') return [code, 1];

    const rate = twdToCurrency.get(code);
    return [code, rate ? 1 / rate : fallbackRates[code]];
  }));
}
