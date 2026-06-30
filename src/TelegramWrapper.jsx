// TelegramWrapper - TG Mini App 視覺整合 (theme + BackButton)。
// 不處理登入：在 TG Mini App 內用原本的 email/password 登入流程 (App.real.jsx)。
// 拿掉了先前版本的 bind/auth orchestration，也拿掉 MainButton 關閉鈕 (使用者大多用 TG chrome 自帶的 X 關閉)。

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

    whenTelegramReady();

    return () => {
      try { tg.BackButton?.hide(); } catch { /* ignore */ }
    };
  }, []);

  return children;
}
