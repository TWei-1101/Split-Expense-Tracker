import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function splitItemAmounts(totalAmt, parts) {
  if (Number.isInteger(totalAmt)) {
    const base = Math.floor(totalAmt / parts);
    const rem = totalAmt - (base * parts);
    return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
  }
  const cents = Math.round(totalAmt * 100);
  const baseCents = Math.floor(cents / parts);
  const remCents = cents - (baseCents * parts);
  return Array.from({ length: parts }, (_, i) => {
    const c = baseCents + (i < remCents ? 1 : 0);
    return c % 100 === 0 ? c / 100 : Number((c / 100).toFixed(2));
  });
}

test('splitItemAmounts evenly distributes integer totals with exact sum conservation', () => {
  const parts2 = splitItemAmounts(254, 2);
  assert.deepEqual(parts2, [127, 127]);
  assert.equal(parts2.reduce((s, a) => s + a, 0), 254);

  const parts3 = splitItemAmounts(2728, 3);
  assert.deepEqual(parts3, [910, 909, 909]);
  assert.equal(parts3.reduce((s, a) => s + a, 0), 2728);
});

test('splitItemAmounts evenly distributes decimal totals with exact cents conservation', () => {
  const parts2 = splitItemAmounts(10.50, 2);
  assert.deepEqual(parts2, [5.25, 5.25]);
  assert.equal(parts2.reduce((s, a) => s + a, 0), 10.50);

  const parts3 = splitItemAmounts(10.55, 3);
  assert.deepEqual(parts3, [3.52, 3.52, 3.51]);
  assert.equal(Number(parts3.reduce((s, a) => s + a, 0).toFixed(2)), 10.55);
});

test('App.real.jsx defines splitExpenseItem and splitAllMultiQuantityItems', () => {
  const source = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /const splitExpenseItem =/);
  assert.match(source, /const splitAllMultiQuantityItems =/);
  assert.match(source, /✂️ 全部依數量拆開/);
});
