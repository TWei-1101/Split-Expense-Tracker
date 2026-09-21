export function createOcrRequest(timeoutMs = 120000) {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    dispose: () => clearTimeout(timer),
    message: () => expired ? '辨識逾時，圖片已保留，請稍後重試或手動輸入。' : '已取消辨識，圖片已保留，可手動輸入。',
    run(work) {
      return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
        if (controller.signal.aborted) { abort(); return; }
        controller.signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          return work();
        }).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
      });
    },
  };
}

export function ocrResponseError(status, payload = {}) {
  if (status === 429) return payload.error === 'rate_limited'
    ? '辨識次數過多，請等約一分鐘後再試。' : '辨識服務忙碌，請稍候再試。';
  if (status === 401) return '登入已失效，請重新登入後再辨識。';
  if ([408, 504].includes(status)) return '辨識服務逾時，請稍後重試。';
  if (status === 413) return '收據圖片太大，請裁切或縮小後重試。';
  return '辨識服務暫時無法使用，請稍後重試或手動輸入。';
}
