import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('search filtering supports matching expense items by name and originalName', () => {
  const source = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(
    source,
    /item\.name\s*\|\|\s*''\)\.toLowerCase\(\)\.includes\(kw\)\s*\|\|\s*\(item\.originalName\s*\|\|\s*''\)\.toLowerCase\(\)\.includes\(kw\)/,
  );
});

test('expense cards display matching search item badges when searching', () => {
  const source = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /matchingItems\.length > 0/);
  assert.match(source, /aria-label="符合搜尋的商品明細"/);
});
