import test from 'node:test';
import assert from 'node:assert/strict';
import { computeItemSplits, isSettlement, migrateExpenseIdentity, resolveExpenseConversion, validatePayers, getSearchSpendingSummary } from '../src/lib/expense-math.js';
import { calculateBalances } from '../src/lib/settlement.js';

test('discounts follow item allocations without negative member costs', () => {
  assert.deepEqual(computeItemSplits([{amount:100}], {0:'B'}, 'A', ['A','B'], 90), {A:0,B:90});
  assert.deepEqual(computeItemSplits([{amount:30},{amount:70}], {0:'A',1:'B'}, 'A', ['A','B'], 90), {A:27,B:63});
});

test('item allocation distributes rounding cents and preserves the bill total', () => {
  const splits = computeItemSplits([{amount:100}], {0:'all'}, 'A', ['A','B','C'], 100);
  assert.deepEqual(splits, {A:33.34,B:33.33,C:33.33});
  assert.equal(Object.values(splits).reduce((sum,n)=>sum+Math.round(n*100),0),10000);
});

test('both historical and new repayments are excluded from spending', () => {
  const bill = {description:'餐費',amountInTWD:100,payerName:'A',shares:{A:1,B:1}};
  for (const marker of [{description:'[結清] B 歸還給 A 欠款'}, {kind:'settlement',description:'已還款'}]) {
    const repayment = {...marker,amountInTWD:50,payerName:'B',shares:{A:50}};
    assert.equal([bill,repayment].filter(exp=>!isSettlement(exp)).reduce((sum,exp)=>sum+exp.amountInTWD,0),100);
    assert.deepEqual(calculateBalances(['A','B'],[bill,repayment]),{A:0,B:0});
  }
});

test('member migration preserves payment and split amounts and item assignments', () => {
  const expense={payerName:'A',amountInTWD:100,shares:{A:50,oldB:50},customSplits:{A:50,oldB:50},payers:{A:20,oldB:80},itemAssignments:{0:'oldB',1:'all'}};
  const migrated={...expense,...migrateExpenseIdentity(expense,'oldB','newB')};
  assert.deepEqual(calculateBalances(['A','newB'],[migrated]),{A:-30,newB:30});
  assert.deepEqual(migrated.itemAssignments,{0:'newB',1:'all'});
  assert.deepEqual(migrateExpenseIdentity({payers:{oldB:30,newB:70}},'oldB','newB'),{payers:{newB:100}});
});

test('a sole co-payer receives the credit even if the primary payer paid zero', () => {
  const payers = validatePayers({A:0,B:100}, ['A','B'], 100);
  assert.deepEqual(calculateBalances(['A','B'],[{payerName:'A',amountInTWD:100,payers,shares:{A:1,B:1}}]),{A:-50,B:50});
  assert.throws(() => validatePayers({A:0,B:110}, ['A','B'], 100));
  assert.throws(() => validatePayers({A:0,B:0}, ['A','B'], 100));
});

test('editing metadata preserves saved currency valuation; amount edits retain the saved rate', () => {
  const saved={currency:'USD',originalAmount:100,exchangeRate:30,amountInTWD:3000};
  assert.deepEqual(resolveExpenseConversion({...saved,description:'new'},saved,32),{rate:30,amount:3000});
  assert.deepEqual(resolveExpenseConversion({...saved,originalAmount:200},saved,32),{rate:30,amount:6000});
  assert.deepEqual(resolveExpenseConversion({currency:'EUR',originalAmount:100},saved,35),{rate:35,amount:3500});
  assert.deepEqual(resolveExpenseConversion(saved,null,32),{rate:32,amount:3200});
});

test('search average counts people for item splits and mixed weighted expenses', () => {
  const expenses=[{amountInTWD:100,shares:{A:30,B:70},customSplits:{A:30,B:70}}];
  assert.deepEqual(getSearchSpendingSummary(expenses),{total:100,count:2,average:50});
  expenses.push({amountInTWD:200,shares:{A:2,B:1}}, {kind:'settlement',amountInTWD:50,shares:{C:50}});
  assert.deepEqual(getSearchSpendingSummary(expenses),{total:300,count:2,average:150});
});
