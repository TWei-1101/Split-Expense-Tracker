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
