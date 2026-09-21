import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptOcrReviewMessage, mergeReceiptOcrIntoExpense } from '../src/lib/receipt-ocr.js';

test('OCR review warnings are displayed without modifying financial fields', () => {
  const payload = { originalAmount: 1100, warnings: ['品項合計與總額不同'], needsReview: true };
  assert.match(receiptOcrReviewMessage(payload), /需要確認.*品項合計與總額不同/);
  assert.equal(mergeReceiptOcrIntoExpense({}, payload).originalAmount, '1100');
  assert.equal(mergeReceiptOcrIntoExpense({}, payload).warnings, undefined);
});

test('old OCR responses remain compatible and malformed warnings are ignored', () => {
  assert.match(receiptOcrReviewMessage({}), /已預填/);
  assert.match(receiptOcrReviewMessage({ warnings: [null, {}, ''] }), /已預填/);
});
