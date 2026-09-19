import test from 'node:test';
import assert from 'node:assert/strict';
import { splitItemAmounts, splitExpenseItems } from '../src/lib/expense-item-split.js';
import { computeItemSplits } from '../src/lib/expense-math.js';

test('currency precision applies to integer and decimal totals', () => {
  assert.deepEqual(splitItemAmounts(11, 2, 'USD'), [5.5, 5.5]);
  assert.deepEqual(splitItemAmounts(11, 2, 'EUR'), [5.5, 5.5]);
  assert.deepEqual(splitItemAmounts(11, 2, 'JPY'), [6, 5]);
  assert.deepEqual(splitItemAmounts(2728, 3, 'JPY'), [910, 909, 909]);
  assert.deepEqual(splitItemAmounts(10.55, 3, 'USD'), [3.52, 3.52, 3.51]);
});

for (const assignment of ['B', 'all', undefined]) {
  for (const index of [0, null]) {
    test('preserves allocation ' + assignment + ', index ' + index, () => {
      const items = [{ name: 'Product', amount: 100, quantity: 2 }, { name: 'Other', amount: 20 }];
      const assignments = { 1: 'B', ...(assignment ? { 0: assignment } : {}) };
      const result = splitExpenseItems(items, assignments, 'TWD', index, 2);
      assert.equal(result.items.length, 3);
      assert.equal(result.assignments[2], 'B');
      assert.equal(result.assignments[0], assignment);
      assert.equal(result.assignments[1], assignment);
      assert.deepEqual(
        computeItemSplits(result.items, result.assignments, 'A', ['A', 'B'], 120),
        computeItemSplits(items, assignments, 'A', ['A', 'B'], 120),
      );
      assert.equal(items.length, 2);
      assert.equal(assignments[1], 'B');
    });
  }
}

test('bulk and repeated splits retain later assignments and conserve total', () => {
  const original = [{ name: 'First', amount: 11, quantity: 2 }, { name: 'Second', amount: 10.55, quantity: 3 }];
  const first = splitExpenseItems(original, { 0: 'A', 1: 'B' }, 'USD');
  assert.deepEqual(first.assignments, { 0: 'A', 1: 'A', 2: 'B', 3: 'B', 4: 'B' });
  const again = splitExpenseItems(first.items, first.assignments, 'USD', 1, 2);
  assert.equal(again.items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0), 2155);
  assert.deepEqual(again.assignments, { 0: 'A', 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'B' });
});
