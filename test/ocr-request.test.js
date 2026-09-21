import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOcrRequest, ocrResponseError } from '../src/lib/ocr-request.js';

test('user cancellation releases the wait even when underlying work ignores abort', async () => {
  const request = createOcrRequest();
  try {
    const pending = request.run(() => new Promise(() => {}));
    request.cancel();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.match(request.message(), /已取消/);
  } finally { request.dispose(); }
});

test('timeout covers compression/authentication as well as fetch', async () => {
  const request = createOcrRequest(5);
  try {
    await assert.rejects(request.run(() => new Promise(() => {})), { name: 'AbortError' });
    assert.match(request.message(), /逾時/);
  } finally { request.dispose(); }
});

test('late responses do not change a cancelled request into success', async () => {
  const request = createOcrRequest();
  let complete;
  try {
    const pending = request.run(() => new Promise(resolve => { complete = resolve; }));
    await Promise.resolve();
    request.cancel();
    complete({ originalAmount: 999 });
    await assert.rejects(pending, { name: 'AbortError' });
    await assert.rejects(request.run(() => 123), { name: 'AbortError' });
  } finally { request.dispose(); }
});

test('successful request and user-facing service errors', async () => {
  const request = createOcrRequest();
  try { assert.equal(await request.run(() => 123), 123); } finally { request.dispose(); }
  assert.match(ocrResponseError(429, { error: 'ocr_busy' }), /忙碌/);
  assert.match(ocrResponseError(429, { error: 'rate_limited' }), /一分鐘/);
  assert.match(ocrResponseError(401), /登入/);
});

test('deployment gates include backend tests and published-version verification', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /python -m unittest discover/);
  assert.match(workflow, /deployment-version.mjs verify/);
  assert.match(workflow, /CF_TOKEN is missing/);
});
