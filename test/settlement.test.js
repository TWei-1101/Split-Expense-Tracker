import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBalances, calculateSettlements } from '../src/lib/settlement.js';

test('calculateBalances：付款者=參與者時自己扣自己份額（#3）', () => {
  // A 付 100，shares {A: 2, B: 1}，total 3，costPerShare = 100/3
  // A: +100 - 200/3 = +100/3
  // B: -100/3
  const balances = calculateBalances(['A', 'B'], [
    { payerName: 'A', amountInTWD: 100, shares: { A: 2, B: 1 } },
  ]);
  assert.ok(Math.abs(balances.A - 100/3) < 1e-9, `A 應為 +100/3，實際 ${balances.A}`);
  assert.ok(Math.abs(balances.B + 100/3) < 1e-9, `B 應為 -100/3，實際 ${balances.B}`);
  // 守恆：A + B = 0
  assert.ok(Math.abs(balances.A + balances.B) < 1e-9);
});

test('calculateBalances：各自付款不進結算（#4）', () => {
  // 兩筆 expense：第一筆 payer='__self__' 應跳過
  // 第二筆 payer='A'，shares {B: 1, C: 1}，A+200, B-100, C-100
  const balances = calculateBalances(['A', 'B', 'C'], [
    { payerName: '__self__', amountInTWD: 999, shares: { A: 1, B: 1, C: 1 } },
    { payerName: 'A', amountInTWD: 200, shares: { B: 1, C: 1 } },
  ]);
  assert.equal(balances.A, 200);
  assert.equal(balances.B, -100);
  assert.equal(balances.C, -100);
});

test('calculateBalances：totalShares === 0 跳過（防 NaN 汙染）', () => {
  const balances = calculateBalances(['A', 'B'], [
    { payerName: 'A', amountInTWD: 100, shares: {} },
    { payerName: 'B', amountInTWD: 200, shares: { A: 0, B: 0 } },
  ]);
  assert.equal(balances.A, 0);
  assert.equal(balances.B, 0);
});

test('calculateBalances：空 expenses 回傳全 0', () => {
  assert.deepEqual(calculateBalances(['A', 'B', 'C'], []), { A: 0, B: 0, C: 0 });
});

test('calculateBalances：守恆 — 多人多筆 expense 總和 = 0', () => {
  // 4 筆：付 100/200/300/500 給不同分攤者，總付出 1100
  // 最終所有人餘額總和 = 0
  const balances = calculateBalances(['A', 'B', 'C'], [
    { payerName: 'A', amountInTWD: 100, shares: { A: 1, B: 1, C: 1 } },
    { payerName: 'B', amountInTWD: 200, shares: { A: 1, B: 1 } },
    { payerName: 'C', amountInTWD: 300, shares: { A: 1, C: 1 } },
  ]);
  const sum = balances.A + balances.B + balances.C;
  assert.ok(Math.abs(sum) < 1e-9, `餘額總和應為 0，實際 ${sum}`);
});

test('calculateSettlements：兩人場景', () => {
  const settlements = calculateSettlements({ A: 100, B: -100 });
  assert.deepEqual(settlements, [{ from: 'B', to: 'A', amount: 100 }]);
});

test('calculateSettlements：三人以上抵銷 + 守恆（#1）', () => {
  // 4 人 A/B/C/D：模擬典型旅遊場景的結餘
  // A 付 100 for all (shares A=1, B=1, C=1, D=1)
  // B 付 200 for A, C
  // C 付 300 for B, D
  // 最終：A=-25, B=+25, C=+175, D=-175
  const balances = { A: -25, B: 25, C: 175, D: -175 };
  const settlements = calculateSettlements(balances);

  // 守恆：settlements 總和 = 25 + 175 = 200（credit 總和）
  const total = settlements.reduce((s, x) => s + x.amount, 0);
  assert.equal(total, 200);

  // A 的 25 必須有 settlement
  const fromA = settlements.find(s => s.from === 'A');
  assert.ok(fromA, 'A 必須有 settlement');
  assert.equal(fromA.amount, 25);
  // D 的 175 必須有 settlement
  const fromD = settlements.find(s => s.from === 'D');
  assert.ok(fromD, 'D 必須有 settlement');
  assert.equal(fromD.amount, 175);

  // 每筆 from/to 合法、amount > 0
  for (const s of settlements) {
    assert.ok(['A', 'B', 'C', 'D'].includes(s.from));
    assert.ok(['A', 'B', 'C', 'D'].includes(s.to));
    assert.ok(s.amount > 0);
    assert.notEqual(s.from, s.to);
  }
});

test('calculateSettlements：5 人複雜場景守恆', () => {
  const balances = { A: 100, B: -50, C: 200, D: -150, E: -100 };
  const settlements = calculateSettlements(balances);
  // credit = 100 + 200 = 300, debt = 50 + 150 + 100 = 300
  const total = settlements.reduce((s, x) => s + x.amount, 0);
  assert.equal(total, 300);
});

test('calculateSettlements：空餘額回傳空陣列', () => {
  assert.deepEqual(calculateSettlements({}), []);
  assert.deepEqual(calculateSettlements({ A: 0, B: 0, C: 0 }), []);
});

test('calculateSettlements：餘額 < 1 的忽略（防飄點）', () => {
  // A=0.5, B=-0.5（小於 1 門檻）→ 不該產生 settlement
  assert.deepEqual(calculateSettlements({ A: 0.5, B: -0.5 }), []);
});
