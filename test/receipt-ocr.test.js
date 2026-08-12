import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeReceiptOcrIntoExpense, normalizeReceiptOcrResult } from '../src/lib/receipt-ocr.js';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

test('收據辨識金額接受 OCR 常見的千分位、全形逗號與相容欄位名稱', () => {
  assert.deepEqual(normalizeReceiptOcrResult({ originalAmount: '￥1，161' }), { originalAmount: 1161 });
  assert.deepEqual(normalizeReceiptOcrResult({ amount: 'NT$ 1,250.50' }), { originalAmount: 1250.5 });
  assert.deepEqual(normalizeReceiptOcrResult({ originalAmount: '總計 1,161' }), {});
});

test('OCR 回傳的 1161 會直接成為受控金額欄位可顯示的字串值', () => {
  const expense = mergeReceiptOcrIntoExpense({ description: '', originalAmount: '', currency: 'TWD' }, {
    description: '千代田店', originalAmount: 1161, currency: 'JPY', occurredAt: '2019-10-01T08:45',
  });
  assert.deepEqual(expense, {
    description: '千代田店', originalAmount: '1161', currency: 'JPY', occurredAt: '2019-10-01T08:45',
  });
  const renderedAmountInput = renderToStaticMarkup(React.createElement('input', {
    type: 'number', id: 'originalAmount', value: expense.originalAmount, readOnly: true,
  }));
  assert.match(renderedAmountInput, /value="1161"/);
  assert.match(appSource, /value=\{newExpense\.originalAmount\}/);
  assert.match(appSource, /mergeReceiptOcrIntoExpense\(previous, payload\)/);
});

test('主畫面的收據入口是單一相機按鈕，直接呼叫原生圖片選擇器並帶 Firebase 身分憑證呼叫本地 OCR', () => {
  assert.match(appSource, /getIdToken\(\)/);
  assert.match(appSource, /RECEIPT_OCR_ENDPOINT/);
  assert.match(appSource, /normalizeReceiptOcrResult/);
  assert.match(appSource, /'Content-Type': file\.type/);
  assert.match(appSource, /const startReceiptOcr = useCallback/);
  assert.match(appSource, /receiptOcrInputRef\.current\?\.click\(\)/);
  assert.match(appSource, /id="receipt-ocr-image"/);
  assert.match(appSource, /accept="image\/\*"/);
  assert.match(appSource, /onChange=\{handleReceiptImageSelected\}/);
  assert.match(appSource, /receiptImageFile: file/);
  assert.match(appSource, /isReceiptOcrEntry/);
  assert.match(appSource, /const file = state\.receiptImageFile/);
  assert.match(appSource, /if \(isReceiptOcrEntry\) \{\s*recognizeReceipt\(file\);/);
  assert.match(appSource, /不會自動儲存/);
  assert.doesNotMatch(appSource, /isReceiptPickerOpen/);
  assert.doesNotMatch(appSource, /選擇收據圖片來源/);
});

test('OCR 非同步回應抵達時不會被 modal 初始化的重渲染清空', () => {
  assert.match(appSource, /const initializedModalKeyRef = useRef\(null\)/);
  assert.match(appSource, /if \(initializedModalKeyRef\.current === modalKey\) return;/);
  assert.match(appSource, /initializedModalKeyRef\.current = modalKey;/);
  assert.match(appSource, /initializedModalKeyRef\.current = null;/);
});

test('OCR 回應後會顯示非敏感的金額資料流診斷，供行動裝置追查欄位未預填問題', () => {
  assert.match(appSource, /receiptOcrDiagnostic/);
  assert.match(appSource, /data-testid="receipt-ocr-amount-diagnostic"/);
  assert.match(appSource, /服務回傳：\{receiptOcrDiagnostic\.receivedAmount\}/);
  assert.match(appSource, /解析後：\{receiptOcrDiagnostic\.normalizedAmount\}/);
  assert.match(appSource, /金額欄目前：\{newExpense\.originalAmount/);
  assert.match(appSource, /ocr-trace-2026-08-12-1408/);
});

test('一般新增支出上傳照片不會觸發收據辨識', () => {
  assert.match(appSource, /\{isReceiptOcrEntry \? '拍照／選取收據' : '上傳照片'\}/);
  assert.match(appSource, /\{isReceiptOcrEntry && \(/);
});

test('相機與新增支出為右下角懸浮操作，管理分帳入口位於新增支出的分帳設定內', () => {
  const receiptEntry = appSource.indexOf('onClick={startReceiptOcr}');
  const floatingAddEntry = appSource.indexOf('onClick={startAdd}');
  const memberEntry = appSource.indexOf('[管理分帳成員]');
  const sharesLabel = appSource.indexOf('分帳份數');
  const averageEntry = appSource.indexOf('[設為平均分配]');
  assert.ok(receiptEntry > floatingAddEntry);
  assert.match(appSource, /fixed bottom-6 right-5/);
  assert.match(appSource, /fixed bottom-6 right-\[5\.5rem\]/);
  assert.ok(memberEntry > sharesLabel && memberEntry < averageEntry);
  assert.doesNotMatch(appSource, /<Users className="w-6 h-6" \/>/);
});

test('行李箱設定在新增支出欄位旁，回收桶在分類列最右側', () => {
  const luggageLabel = appSource.indexOf('放入行李箱');
  const luggageManage = appSource.indexOf('管理行李箱', luggageLabel);
  const categoryFilter = appSource.indexOf('aria-label="支出分類篩選"');
  const recycleEntry = appSource.indexOf('aria-label="開啟支出回收桶"', categoryFilter);
  assert.ok(luggageManage > luggageLabel);
  assert.ok(recycleEntry > categoryFilter);
  assert.match(appSource, /ml-auto inline-flex h-10 w-10/);
});
