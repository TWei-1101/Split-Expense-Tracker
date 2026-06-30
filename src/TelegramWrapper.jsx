// TelegramWrapper - handles TG Mini App visual integration (theme + buttons + close)
// and orchestrates the auth+bind flow:
//  1. If start_param starts with bind_, call /api/tg-bind first to complete binding.
//  2. Then call /api/tg-auth to receive custom token and sign in via Firebase.
// Does NOT modify App.real.jsx; runtime is in this wrapper, App receives onAuthStateChanged callbacks as usual.

import { useEffect } from 'react';
import { detectTelegramMode, applyTelegramTheme, whenTelegramReady, telegramClose } from './lib/tg-mode';

export const TG_AUTH_ENDPOINT = '/api/tg-auth';
export const TG_BIND_ENDPOINT = '/api/tg-bind';

export async function tgPostJson(endpoint, payload) {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

function getStartParam() {
  const tg = detectTelegramMode();
  if (!tg) return null;
  // Telegram puts start_param on initDataUnsafe when launched with ?startapp=...
  return tg.initDataUnsafe?.start_param || null;
}

async function performTgBindIfNeeded() {
  const startParam = getStartParam();
  if (!startParam || !startParam.startsWith('bind_')) return { ok: true, skipped: true };
  const code = startParam.slice('bind_'.length);
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return { ok: false, error: 'no initData for bind' };
  return tgPostJson(TG_BIND_ENDPOINT, { code, initData });
}

async function performTgAuth(firebaseAuth) {
  if (!firebaseAuth) return { ok: false, error: 'firebase auth not ready' };
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return { ok: false, error: 'no initData' };
  const data = await tgPostJson(TG_AUTH_ENDPOINT, { initData });
  if (!data.ok) return { ...data, needLink: !!data.needLink };
  await firebaseAuth.signInWithCustomToken(data.customToken);
  return { ok: true, uid: data.uid, tg: data.tg, needLink: false };
}

function showTgUnlinkedBanner(tgId, botUsername) {
  const banner = document.createElement('div');
  banner.id = 'tg-unlinked-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:14px 16px;background:#fff3cd;color:#664d03;text-align:center;z-index:1000;font-size:13px;border-bottom:1px solid #ffe066;font-family:inherit;line-height:1.5';
  const handle = botUsername || 'the bot';
  banner.innerHTML = `⚠️ 你的 Telegram 帳號 (id: <code>${tgId || '?'}</code>) 尚未連結任何 Expense 帳號。<br>請先到瀏覽器登入 expense.771101.xyz 並按下「連結 Telegram」。<br>連結後到 ${handle} 傳訊息即可打開 Mini App。`;
  const old = document.getElementById('tg-unlinked-banner');
  if (old) old.remove();
  document.body.prepend(banner);
  document.body.style.paddingTop = '120px';
}

function hideTgUnlinkedBanner() {
  const el = document.getElementById('tg-unlinked-banner');
  if (el) el.remove();
  document.body.style.paddingTop = '';
}

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
      hideTgUnlinkedBanner();
    };
  }, []);

  return children;
}

// Helpers exposed for App.real.jsx (it has access to firebaseAuth).
// These wrap the full TG flow so App.real.jsx can simply await them.
export async function telegramSignInFlow(firebaseAuth) {
  const tg = detectTelegramMode();
  if (!tg) return { ok: true, skipped: true };

  // 1. bind first if start_param demands it
  try {
    const bindResult = await performTgBindIfNeeded();
    if (!bindResult.ok && !bindResult.skipped) {
      console.error('[tg-bind] failed:', bindResult.error);
      return { ok: false, error: `bind failed: ${bindResult.error}`, stage: 'bind' };
    }
  } catch (e) {
    return { ok: false, error: `bind exception: ${String(e)}`, stage: 'bind' };
  }

  // 2. auth (with the same initData but after binding is in place)
  try {
    const authResult = await performTgAuth(firebaseAuth);
    if (!authResult.ok && authResult.needLink) {
      showTgUnlinkedBanner(authResult.tgId, authResult.botUsername);
      return { ...authResult, stage: 'auth' };
    }
    if (authResult.ok) {
      hideTgUnlinkedBanner();
    }
    return { ...authResult, stage: 'auth' };
  } catch (e) {
    return { ok: false, error: `auth exception: ${String(e)}`, stage: 'auth' };
  }
}
