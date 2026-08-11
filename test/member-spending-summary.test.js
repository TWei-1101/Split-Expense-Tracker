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

test('不再顯示獨立的各成員分類支出表', () => {
  assert.doesNotMatch(appSource, /各成員分類支出/);
  assert.doesNotMatch(appSource, /memberCategorySpending/);
});
