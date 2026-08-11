import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');

test('每人花費摘要只顯示筆數與合計，不顯示統計範圍標籤', () => {
  assert.doesNotMatch(appSource, /統計範圍：/);
  assert.match(appSource, /全部 \$\{expenses\.length\} 筆/);
  assert.match(appSource, /合計 TWD \{totalSpending\.toFixed\(0\)\}/);
});

test('點選所有支出的分類時，每人花費金額與摘要都使用該分類支出，且可取消回到全部', () => {
  assert.match(appSource, /const spendingExpenses = useMemo\(\(\) => filterExpensesByCategory\(expenses, filterCategory\), \[expenses, filterCategory\]\)/);
  assert.match(appSource, /for \(const exp of spendingExpenses\)/);
  assert.match(appSource, /\{filterCategory \? `\$\{EXPENSE_CATEGORY_OPTIONS\.find\(option => option\.value === filterCategory\)\?\.label\} \$\{spendingExpenses\.length\} 筆` : `全部 \$\{expenses\.length\} 筆`\} · 合計 TWD \{totalSpending\.toFixed\(0\)\}/);
  assert.match(appSource, /onClick=\{\(\) => toggleCategoryFilter\(option\.value\)\}/);
});

test('各自付款摘要跟隨分類：只計入目前分類，沒有各自付款時不顯示卡片', () => {
  assert.match(appSource, /const selfPaidSummary = useMemo\(\(\) => \{[\s\S]*?return spendingExpenses\.reduce\(/);
  assert.match(appSource, /\}, \[spendingExpenses\]\);/);

  const food = [
    { category: 'food', payerName: '__SELF_PAYER__', amountInTWD: 120 },
    { category: 'food', payerName: 'alice', amountInTWD: 80 },
  ];
  const transport = [
    { category: 'transport', payerName: '__SELF_PAYER__', amountInTWD: 300 },
  ];
  const summarizeSelfPaid = (items) => items.reduce((summary, exp) => {
    if (exp.payerName !== '__SELF_PAYER__') return summary;
    summary.count += 1;
    summary.amount += exp.amountInTWD || 0;
    return summary;
  }, { count: 0, amount: 0 });

  assert.deepEqual(summarizeSelfPaid(food), { count: 1, amount: 120 });
  assert.deepEqual(summarizeSelfPaid(transport), { count: 1, amount: 300 });
  assert.deepEqual(summarizeSelfPaid(food.filter(exp => exp.payerName !== '__SELF_PAYER__')), { count: 0, amount: 0 });
});

test('各自付款以結餘總結文案說明，且沒有舊的結算用語', () => {
  assert.match(appSource, /不計入結餘總結/);
  assert.doesNotMatch(appSource, /不計入結算/);
});

test('不再顯示獨立的各成員分類支出表', () => {
  assert.doesNotMatch(appSource, /各成員分類支出/);
  assert.doesNotMatch(appSource, /memberCategorySpending/);
});
