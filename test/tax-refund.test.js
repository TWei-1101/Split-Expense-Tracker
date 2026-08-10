import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTaxRefund,
  getTaxRefundProfile,
  pendingTaxRefundTotalInTWD,
} from '../src/lib/tax-refund.js';

test('單一國家幣別自動帶入退稅國家與稅率', () => {
  assert.equal(getTaxRefundProfile('JPY').country, 'JP');
  assert.equal(getTaxRefundProfile('THB').rate, 0.07);
  assert.equal(getTaxRefundProfile('TWD'), null);
});

test('共用幣別要求使用者選國家，不自動估算', () => {
  assert.equal(getTaxRefundProfile('EUR'), null);
  assert.equal(createTaxRefund({ currency: 'EUR', originalAmount: 110, exchangeRate: 33 }).estimatedAmount, 0);
});

test('以含稅金額反推預估退稅金額', () => {
  assert.equal(createTaxRefund({ currency: 'JPY', originalAmount: 11000, exchangeRate: 0.25 }).estimatedAmount, 1000);
  assert.equal(createTaxRefund({ currency: 'THB', originalAmount: 107, exchangeRate: 0.85 }).estimatedAmount, 7);
});

test('待收退稅總額只加總 pending，並使用每筆保存的匯率', () => {
  assert.equal(pendingTaxRefundTotalInTWD([
    { taxRefund: { eligible: true, status: 'pending', estimatedAmount: 1000, exchangeRate: 0.25 } },
    { taxRefund: { eligible: true, status: 'received', estimatedAmount: 500, exchangeRate: 0.25 } },
    { taxRefund: { eligible: false, status: 'pending', estimatedAmount: 999, exchangeRate: 1 } },
  ]), 250);
});

test('expense modal exposes the tax-refund controls', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /此筆可退稅/);
  assert.match(appSource, /退稅國家／地區/);
  assert.match(appSource, /退稅狀態/);
});

test('結餘總結僅在有待收退稅預估金額時顯示摘要', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /pendingTaxRefundInTWD > 0/);
  assert.match(appSource, /待收退稅預估總額/);
  assert.doesNotMatch(appSource, /僅統計待收項目，按各筆支出儲存時的匯率換算；不影響分帳結算。/);
});
