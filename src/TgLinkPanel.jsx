// TgLinkPanel - floating UI for browser-side Telegram linking.
//
// Flow (server-mediated, no Firestore rules needed):
//   1. User clicks the floating pill.
//   2. POST /api/tg-create-bind-code (Authorization: Bearer <Firebase idToken>)
//      returns { code, deepLink, expiresAt }.
//   3. Modal shows the code + a deep link to open @TWeiHABot?startapp=bind_<code>.
//   4. User taps the deep link → TG opens bot + Mini App with
//      start_param=bind_<code>.
//   5. Mini App (TelegramWrapper) automatically calls /api/tg-bind on mount.
//   6. Browser polls GET /api/tg-check-bind-code?code=<code> until status='linked'.

import { useEffect, useState, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import { detectTelegramMode } from './lib/tg-mode';

const TG_BOT_USERNAME = 'TWeiHABot';

async function getIdToken(forceRefresh = false) {
  const user = firebase.auth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export default function TgLinkPanel() {
  const [tgMode, setTgMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('idle'); // idle | creating | waiting | linked | error
  const [code, setCode] = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [error, setError] = useState('');
  const [authState, setAuthState] = useState('unknown'); // unknown | anonymous | signed-in

  useEffect(() => {
    setTgMode(!!detectTelegramMode());

    const unsub = firebase.auth().onAuthStateChanged((u) => {
      if (!u) setAuthState('signed-out');
      else if (u.isAnonymous) setAuthState('anonymous');
      else setAuthState('signed-in');
    });
    return () => unsub();
  }, []);

  const startBindFlow = useCallback(async () => {
    setError('');
    setStep('creating');
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) {
        setError('請先登入 Expense 帳號（瀏覽器模式）');
        setStep('error');
        return;
      }
      const idToken = await getIdToken();
      if (!idToken) {
        setError('無法取得登入身份 token，請重新登入');
        setStep('error');
        return;
      }
      const r = await fetch('/api/tg-create-bind-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'unknown');
      setCode(data.code);
      setDeepLink(data.deepLink);
      setStep('waiting');
    } catch (e) {
      console.error('[bind] failed:', e);
      setError('建立連結碼失敗：' + (e?.message || String(e)));
      setStep('error');
    }
  }, []);

  // Poll when in 'waiting' step
  useEffect(() => {
    if (step !== 'waiting' || !code) return undefined;
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      if (cancelled) return;
      try {
        const idToken = await getIdToken();
        if (!idToken) return;
        const r = await fetch(`/api/tg-check-bind-code?code=${encodeURIComponent(code)}`, {
          headers: { 'Authorization': `Bearer ${idToken}` },
        });
        const data = await r.json();
        if (data.ok && data.status === 'linked') {
          setStep('linked');
          return;
        }
      } catch (e) {
        // ignore; will retry
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [step, code]);

  // Don't render the floating button at all if in TG or browser signed-out
  if (tgMode) return null;
  if (authState === 'signed-out' || authState === 'anonymous') return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="連結 Telegram"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 100,
            padding: '10px 14px',
            background: '#0088cc',
            color: 'white',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span aria-hidden>📲</span>
          <span>連結 Telegram</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(15,23,42,.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              width: '100%', maxWidth: 420,
              background: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16,
              padding: 20, paddingBottom: 28,
              boxShadow: '0 -8px 30px rgba(0,0,0,.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>連結 Telegram</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="關閉"
                style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', padding: 4 }}
              >×</button>
            </div>

            {step === 'idle' && (
              <>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
                  把目前 Expense 帳號跟你的 Telegram 帳號綁定。綁定後你可以直接從
                  Telegram 開啟這本分帳簿。
                </p>
                <button
                  onClick={startBindFlow}
                  style={{
                    width: '100%', padding: '12px 16px',
                    background: '#0088cc', color: 'white',
                    border: 'none', borderRadius: 10,
                    fontWeight: 600, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  開始綁定
                </button>
              </>
            )}

            {step === 'creating' && (
              <p style={{ fontSize: 14, color: '#334155' }}>建立連結碼中…</p>
            )}

            {step === 'waiting' && (
              <>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  連結碼（10 分鐘內有效）：
                </p>
                <div
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 28, fontWeight: 700, letterSpacing: 4,
                    padding: '14px 16px',
                    background: '#f1f5f9', borderRadius: 10,
                    textAlign: 'center', color: '#0d9488',
                  }}
                >
                  {code}
                </div>
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block', textAlign: 'center',
                    marginTop: 14, padding: '12px 16px',
                    background: '#0088cc', color: 'white',
                    borderRadius: 10, textDecoration: 'none',
                    fontWeight: 600, fontSize: 15,
                  }}
                >
                  🛫 從 Telegram 開啟 @{TG_BOT_USERNAME}
                </a>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
                  點上面按鈕後會自動打開 Telegram、並打開分帳記帳簿 Mini App。<br/>
                  完成後回來這裡會自動顯示「已連結」。
                </p>
              </>
            )}

            {step === 'linked' && (
              <>
                <p style={{ fontSize: 15, color: '#15803d', fontWeight: 600 }}>
                  ✅ 已成功連結 Telegram！
                </p>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  之後從 @{TG_BOT_USERNAME} 打開分帳記帳簿，會自動登入你目前的 Expense 帳號。
                </p>
                <button
                  onClick={() => { setOpen(false); setStep('idle'); setCode(''); setDeepLink(''); }}
                  style={{
                    width: '100%', padding: '12px 16px',
                    background: '#10b981', color: 'white',
                    border: 'none', borderRadius: 10,
                    fontWeight: 600, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  完成
                </button>
              </>
            )}

            {step === 'error' && (
              <>
                <p style={{ fontSize: 14, color: '#b91c1c' }}>❌ {error}</p>
                <button
                  onClick={() => setStep('idle')}
                  style={{
                    width: '100%', padding: '12px 16px',
                    background: '#64748b', color: 'white',
                    border: 'none', borderRadius: 10,
                    fontWeight: 600, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  重試
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
