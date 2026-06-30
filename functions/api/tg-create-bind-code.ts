// POST /api/tg-create-bind-code
//   Headers: Authorization: Bearer <Firebase ID token from current user>
//   Body: {}
//   Returns: { ok: true, code, deepLink, expiresAt } | { ok: false, error }
//
// Generates a one-time binding code owned by the authed user's uid, stores it
// in Firestore `tgBindCodes/{code}` via admin scope (bypasses rules). Browser
// then deep-links to TG with this code, where Mini App picks it up via
// start_param and /api/tg-bind completes the linkage.

import { verifyFirebaseIdToken } from '../lib/firebase-id-token';
import { firestoreCreateDocument } from '../lib/firestore-rest';

interface Env {
  TG_BOT_USERNAME: string;
  FIREBASE_SA_PRIVATE_KEY: string;
  FIREBASE_SA_CLIENT_EMAIL: string;
  FIREBASE_PROJECT_ID: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function genCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const authz = context.request.headers.get('authorization') || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json({ ok: false, error: 'missing Authorization: Bearer <idToken>' }, 401);
    const idToken = m[1];

    const verify = await verifyFirebaseIdToken(idToken, context.env.FIREBASE_PROJECT_ID);
    if (!verify.ok || !verify.uid) return json({ ok: false, error: verify.error || 'invalid id token' }, 401);

    const code = genCode(8);
    const expiresAtMs = Date.now() + 10 * 60 * 1000;
    const sa = {
      privateKeyPem: context.env.FIREBASE_SA_PRIVATE_KEY,
      clientEmail: context.env.FIREBASE_SA_CLIENT_EMAIL,
    };
    await firestoreCreateDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: 'tgBindCodes',
      docId: code,
      fields: {
        code,
        uid: verify.uid,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAtMs: Math.floor(expiresAtMs / 1000),
        sourceEmail: verify.email || '',
      },
      sa,
    });

    const deepLink = `https://t.me/${context.env.TG_BOT_USERNAME}?startapp=bind_${code}`;
    return json({ ok: true, code, deepLink, expiresAt: expiresAtMs });
  } catch (e) {
    return json({ ok: false, error: `tg-create-bind-code exception: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
};
