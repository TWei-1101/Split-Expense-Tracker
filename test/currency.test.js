import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToTWD } from '../src/lib/currency.js';

test('convertToTWD：基本換算', () => {
  assert.equal(convertToTWD(100, 0.21), 21);    // JPY 100 = TWD 21
  assert.equal(convertToTWD(1, 32.5), 32.5);      // USD 1 = TWD 32.5
  assert.equal(convertToTWD(1000, 0.024), 24);    // KRW 1000 = TWD 24
});

test('convertToTWD：空字串/NaN 統一回 0（避免下游 NaN 汙染）', () => {
  assert.equal(convertToTWD('', 0.21), 0);
  assert.equal(convertToTWD(null, 0.21), 0);
  assert.equal(convertToTWD(undefined, 0.21), 0);
  assert.equal(convertToTWD('abc', 0.21), 0);
  assert.equal(convertToTWD('0', 0.21), 0);
});

test('convertToTWD：exchangeRate 為 0/NaN 統一回 0', () => {
  assert.equal(convertToTWD(100, 0), 0);
  assert.equal(convertToTWD(100, null), 0);
  assert.equal(convertToTWD(100, undefined), 0);
  assert.equal(convertToTWD(100, 'abc'), 0);
});

test('convertToTWD：JS 浮點數乘積（可精確表示的值嚴格相等）', () => {
  // 0.1 * 32.5 = 3.25 — 兩個值在 IEEE 754 都是可精確表示的，結果嚴格相等
  assert.equal(convertToTWD(0.1, 32.5), 3.25);
  // 0.5 * 30 = 15 — 完全可表示
  assert.equal(convertToTWD(0.5, 30), 15);
});

test('convertToTWD：JS 浮點數雷（0.21 不是精確值，tolerance 比對）', () => {
  // 333 * 0.21 理論 69.93，但 0.21 在 IEEE 754 是 0.20999999...
  // JS 結果為 69.92999999999999 — 用 tolerance 接受這個浮點數特性
  const result = convertToTWD(333, 0.21);
  assert.ok(Math.abs(result - 69.93) < 1e-9, `應約 69.93，實際 ${result}`);
});

test('convertToTWD：總額守恆 — 個別轉換加總 = 整體轉換（#2 核心）', () => {
  // 3 筆 JPY 333+333+334=1000，個別加總 vs 整體
  const individualSum = convertToTWD(333, 0.21) + convertToTWD(333, 0.21) + convertToTWD(334, 0.21);
  const totalDirect = convertToTWD(1000, 0.21);
  assert.equal(individualSum, totalDirect);
});

test('convertToTWD：多幣別混合換算', () => {
  // JPY 1000 @ 0.21 = TWD 210
  // USD 10 @ 32.5 = TWD 325
  // KRW 1000 @ 0.024 = TWD 24
  // 總和 TWD 559
  const total = convertToTWD(1000, 0.21) + convertToTWD(10, 32.5) + convertToTWD(1000, 0.024);
  assert.equal(total, 559);
});

test('convertToTWD：浮點數邊界（不憑空多出金額）', () => {
  // 多筆小數相加，總和應守恆（不丟、不加）
  // 9 筆 0.1 USD = 0.9 USD；在 JS 浮點數下 0.1+0.1+...+0.1 (9次) 嚴格說不等於 0.9
  // 但 convertToTWD 是單次乘法，精度問題較小
  const oneTx = convertToTWD(0.1, 32.5);  // 3.25
  const nineTxSum = Array(9).fill(oneTx).reduce((s, v) => s + v, 0);
  const nineTimes = convertToTWD(0.9, 32.5);  // 29.25
  // 用 toFixed 比對避免 JS 浮點累計誤差
  assert.equal(nineTxSum.toFixed(2), nineTimes.toFixed(2));
});
