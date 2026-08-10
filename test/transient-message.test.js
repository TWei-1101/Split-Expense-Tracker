import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedMessageController } from '../src/lib/transient-message.js';

test('成功提示會在指定時間後自動清除', () => {
  const messages = [];
  let scheduled;
  const controller = createTimedMessageController({
    setMessage: (message) => messages.push(message),
    setTimeoutFn: (callback) => {
      scheduled = callback;
      return 1;
    },
    clearTimeoutFn: () => {},
  });

  controller.show('已建立「京都自由行」');
  scheduled();

  assert.deepEqual(messages, ['已建立「京都自由行」', '']);
});

test('關閉後會取消舊提示，重新開啟不會留下已建立訊息', () => {
  const messages = [];
  const cancelled = [];
  const controller = createTimedMessageController({
    setMessage: (message) => messages.push(message),
    setTimeoutFn: () => 42,
    clearTimeoutFn: (timer) => cancelled.push(timer),
  });

  controller.show('已建立「京都自由行」');
  controller.clear();

  assert.deepEqual(cancelled, [42]);
  assert.deepEqual(messages, ['已建立「京都自由行」', '']);
});
