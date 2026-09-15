// Telegram Mini App mode helpers
// Used by both TelegramWrapper and TgLinkButton. Side-effect-free when not in TG.

export function detectTelegramMode() {
  if (typeof window === 'undefined') return null;
  // The telegram-web-app.js SDK attaches WebApp to window.Telegram.WebApp
  const tg = window.Telegram?.WebApp;
  if (!tg) return null;
  // Detected if Telegram WebApp SDK is active (initData, platform or version present)
  if (tg.initData || tg.platform || tg.version) return tg;
  return null;
}

export function getTelegramInitData() {
  const tg = detectTelegramMode();
  return tg?.initData || null;
}

export function getTelegramUser() {
  const tg = detectTelegramMode();
  if (!tg?.initData) return null;
  try {
    const params = new URLSearchParams(tg.initData);
    const userStr = params.get('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

// Apply Telegram theme colors to document root as CSS variables.
// These are referenced via tailwind config + custom CSS.
export function applyTelegramTheme() {
  const tg = detectTelegramMode();
  if (!tg) return;
  const tp = tg.themeParams || {};
  const root = document.documentElement;
  root.dataset.tgMode = 'true';
  if (tp.bg_color) root.style.setProperty('--tg-bg-color', tp.bg_color);
  if (tp.secondary_bg_color) root.style.setProperty('--tg-secondary-bg-color', tp.secondary_bg_color);
  if (tp.text_color) root.style.setProperty('--tg-text-color', tp.text_color);
  if (tp.hint_color) root.style.setProperty('--tg-hint-color', tp.hint_color);
  if (tp.link_color) root.style.setProperty('--tg-link-color', tp.link_color);
  if (tp.button_color) root.style.setProperty('--tg-button-color', tp.button_color);
  if (tp.button_text_color) root.style.setProperty('--tg-button-text-color', tp.button_text_color);
  if (tg.colorScheme) root.dataset.tgColorScheme = tg.colorScheme;
  if (tg.backgroundColor) root.style.background = tg.backgroundColor;

  const updateFullscreenStatus = () => {
    const isFs = typeof tg.isFullscreen === 'boolean' ? tg.isFullscreen : Boolean(tg.requestFullscreen);
    root.dataset.tgFullscreen = isFs ? 'true' : 'false';
  };

  tg.ready();
  tg.expand();
  if (tg.requestFullscreen) {
    try { tg.requestFullscreen(); } catch { /* ignore */ }
  }
  if (tg.disableVerticalSwipes) {
    try { tg.disableVerticalSwipes(); } catch { /* ignore */ }
  }
  if (tg.setHeaderColor) {
    try { tg.setHeaderColor('#f9fafb'); } catch { /* ignore */ }
  }
  if (tg.setBackgroundColor) {
    try { tg.setBackgroundColor('#f9fafb'); } catch { /* ignore */ }
  }

  updateFullscreenStatus();
  if (tg.onEvent) {
    try { tg.onEvent('fullscreenChanged', updateFullscreenStatus); } catch { /* ignore */ }
  }
}

// Wait for Telegram SDK to be ready (it's a tiny script that loads before main.jsx).
export function whenTelegramReady() {
  return new Promise((resolve) => {
    const tg = detectTelegramMode();
    if (!tg) return resolve(null);
    if (tg.isExpanded || tg.viewportStable) return resolve(tg);
    const onChange = () => {
      if (tg.viewportStable) {
        tg.offEvent('viewportChanged', onChange);
        resolve(tg);
      }
    };
    tg.onEvent('viewportChanged', onChange);
    // Fallback: resolve after 500ms even if no event fires
    setTimeout(() => resolve(tg), 500);
  });
}

export function showTelegramAlert(message) {
  const tg = detectTelegramMode();
  if (tg?.showAlert) {
    tg.showAlert(message);
    return;
  }
  alert(message);
}

export function showTelegramConfirm(message) {
  return new Promise((resolve) => {
    const tg = detectTelegramMode();
    if (tg?.showConfirm) {
      tg.showConfirm(message, (ok) => resolve(ok));
      return;
    }
    resolve(window.confirm(message));
  });
}

export function telegramClose() {
  const tg = detectTelegramMode();
  if (tg?.close) tg.close();
}
