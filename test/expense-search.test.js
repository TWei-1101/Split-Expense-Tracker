import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesSearchKeyword } from '../src/lib/expense-math.js';

test('matchesSearchKeyword supports fuzzy matching for English/Romaji (wakamodo -> WAKAMOTO)', () => {
  const itemName = '強力若元錠 (WAKAMOTO 1000錠)';
  const itemOriginal = '強力わかもと1000錠';
  assert.equal(matchesSearchKeyword(itemName, 'wakamodo'), true);
  assert.equal(matchesSearchKeyword(itemName, 'wakamoto'), true);
  assert.equal(matchesSearchKeyword(itemName, 'WAKAMOTO'), true);
  assert.equal(matchesSearchKeyword(itemName, '若元'), true);
  assert.equal(matchesSearchKeyword(itemOriginal, 'わかもと'), true);
  assert.equal(matchesSearchKeyword(itemOriginal, 'ワカモト'), true); // Katakana matches Hiragana
});

test('matchesSearchKeyword supports Katakana and Hiragana bidirectional matching', () => {
  const item = '濃厚味噌らーめん';
  assert.equal(matchesSearchKeyword(item, 'ラーメン'), true);
  assert.equal(matchesSearchKeyword(item, 'らーめん'), true);
  assert.equal(matchesSearchKeyword(item, '味噌'), true);
});

test('search filtering in App.real.jsx uses matchesSearchKeyword for description, note, and items', () => {
  const source = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /matchesSearchKeyword\(exp\.description,\s*kw\)/);
  assert.match(source, /matchesSearchKeyword\(item\.name,\s*kw\)/);
  assert.match(source, /matchesSearchKeyword\(item\.originalName,\s*kw\)/);
});

test('expense cards display matching search item badges when searching', () => {
  const source = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(source, /matchingItems\.length > 0/);
  assert.match(source, /aria-label="符合搜尋的商品明細"/);
});
