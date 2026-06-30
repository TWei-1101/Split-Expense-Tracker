// TelegramWrapper - TG Mini App 視覺整合 (theme + BackButton/MainButton + close).
// 不處理登入：在 TG Mini App 內用原本的 email/password 登入流程 (App.real.jsx)。
// 拿掉了先前版本的 bind/auth orchestration。

import { useEffect } from 'react';
import { detectTelegramMode, applyTelegramTheme, whenTelegramReady, telegramClose } from './lib/tg-mode';

export default function TelegramWrapper({ children }) {
  useEffect(() => {
    const tg = detectTelegramMode();
    if (!tg) return;

    applyTelegramTheme();

    if (tg.BackButton) {
      tg.BackButton.onClick(() => telegramClose());
      try { tg.BackButton.show(); } catch { /* ignore */ }
    }

    if (tg.MainButton) {
      tg.MainButton.setText('關閉').show().onClick(() => telegramClose());
    }

    whenTelegramReady();

    return () => {
      try { tg.BackButton?.hide(); } catch { /* ignore */ }
      try { tg.MainButton?.hide(); } catch { /* ignore */ }
    };
  }, []);

  return children;
}
