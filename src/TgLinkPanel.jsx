// TgLinkPanel - floating UI for browser-side Telegram linking.
//
// Shows only when:
//   - In browser (NOT in TG mode)
//   - User is signed in
//   - No TG link exists yet for this user
//
// Flow:
//   1. User clicks the floating pill.
//   2. App generates a random code and writes it to firestore (rules-gated by auth).
//   3. Modal shows the code + a deep link to open @TWeiHABot?startapp=bind_<code>.
//   4. User taps the deep link → TG opens bot + Mini App with start_param=bind_<code>.
//   5. Mini App (TelegramWrapper) automatically calls /api/tg-bind on mount.
//   6. User returns to browser; status shows "已連結".

import { useEffect, useState, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import { detectTelegramMode, telegramClose } from './lib/tg-mode';

const TG_BOT_USERNAME = 'TWeiHABot';

function genCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

export default function TgLinkPanel() {
  const [tgMode, setTgMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('idle'); // idle | creating | waiting | linked | error
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setTgMode(!!detectTelegramMode());
  }, []);

  const startBindFlow = useCallback(async () => {
    setError('');
    setStep('creating');

    const _auth = firebase.auth();
    const user = _auth?.currentUser;
    if (!user) {
      setError('請先登入 Expense 帳號（瀏覽器模式）');
      setStep('error');
      return;
    }

    const newCode = genCode(8);
    try {
      const db = firebase.firestore();
      const path = `tgBindCodes/${newCode}`;
      await db.doc(path).set({
        code: newCode,
        uid: user.uid,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      setCode(newCode);
      setStep('waiting');
    } catch (e) {
      console.error('[bind] failed to create code:', e);
      setError('建立連結碼失敗：' + (e?.message || String(e)));
      setStep('error');
    }
  }, []);

  // Poll binding status when in 'waiting' step
  useEffect(() => {
    if (step !== 'waiting' || !code) return;
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      if (cancelled) return;
      try {
        const database = firebase.firestore();
        const snap = await database.doc(`tgBindCodes/${code}`).get();
        if (snap.exists && snap.data()?.status === 'linked') {
          setStep('linked');
          return;
        }
      } catch (e) {
        // ignore polling errors
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [step, code]);

  if (tgMode) return null;

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

            {(step === 'creating') && (
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
                  href={`https://t.me/${TG_BOT_USERNAME}?startapp=bind_${code}`}
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
                  🛫 在 Telegram 開啟 @${TG_BOT_USERNAME}
                </a>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 10, textAlign: 'center' }}>
                  點上面按鈕後會自動打開 Telegram、並打開分帳記帳簿 Mini App。<br/>
                  完成後回到這裡會自動顯示「已連結」。
                </p>
              </>
            )}

            {step === 'linked' && (
              <>
                <p style={{ fontSize: 15, color: '#15803d', fontWeight: 600 }}>
                  ✅ 已成功連結 Telegram！
                </p>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  之後從 @${TG_BOT_USERNAME} 打開分帳記帳簿，會自動登入你目前的 Expense 帳號。
                </p>
                <button
                  onClick={() => { setOpen(false); setStep('idle'); setCode(''); }}
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
