import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');

test('每人花費摘要只顯示筆數與合計，不顯示統計範圍標籤', () => {
  assert.doesNotMatch(appSource, /統計範圍：/);
  assert.match(appSource, /全部 \{expenses\.length\} 筆 · 合計 TWD \{totalSpending\.toFixed\(0\)\}/);
});
