export function createTimedMessageController({
  setMessage,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  duration = 4000,
}) {
  let timer = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
    setMessage('');
  };

  const show = (message) => {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
    setMessage(message);

    if (message) {
      timer = setTimeoutFn(() => {
        timer = null;
        setMessage('');
      }, duration);
    }
  };

  return { show, clear };
}
