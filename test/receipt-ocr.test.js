import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReceiptOcrResult } from '../src/lib/receipt-ocr.js';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');

test('收據辨識結果只會預填有效的品項、金額、支援的幣別與日期', () => {
  assert.deepEqual(normalizeReceiptOcrResult({
    description: '全家便利商店',
    originalAmount: '150.5',
    currency: 'jpy',
    occurredAt: '2026-08-12T10:30:00+08:00',
  }), {
    description: '全家便利商店',
    originalAmount: 150.5,
    currency: 'JPY',
    occurredAt: '2026-08-12T10:30',
  });
});

test('收據辨識的不可信欄位不覆寫表單', () => {
  assert.deepEqual(normalizeReceiptOcrResult({
    description: ' ', originalAmount: -1, currency: 'BTC', occurredAt: 'not-a-date',
  }), {});
});

test('選取收據後會帶 Firebase 身分憑證呼叫本地 OCR，並只預填不自動儲存', () => {
  assert.match(appSource, /getIdToken\(\)/);
  assert.match(appSource, /RECEIPT_OCR_ENDPOINT/);
  assert.match(appSource, /normalizeReceiptOcrResult/);
  assert.match(appSource, /'Content-Type': file\.type/);
  assert.match(appSource, /不會自動儲存/);
});
