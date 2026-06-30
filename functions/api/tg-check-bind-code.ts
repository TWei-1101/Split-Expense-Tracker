// GET /api/tg-check-bind-code?code=***
//   Headers: Authorization: Bearer <Firebase ID token>
//   Returns: { ok: true, status, tgId? }
//
// Browser polls this after showing the binding code in the modal. Once
// status === 'linked', the modal transitions to the success state.

import { verifyFirebaseIdToken } from '../lib/firebase-id-token';
import { firestoreGetDocument } from '../lib/firestore-rest';

interface Env {
  FIREBASE_SA_PRIVATE_KEY: string;
  FIREBASE_SA_CLIENT_EMAIL: string;
  FIREBASE_PROJECT_ID: string;
}

interface BindCodeRecord {
  uid?: string;
  status?: string;
  expiresAtMs?: number;
  tgId?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const authz = context.request.headers.get('authorization') || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json({ ok: false, error: 'missing Authorization: Bearer <idToken>' }, 401);

    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');
    if (!code) return json({ ok: false, error: 'code required' }, 400);

    const verify = await verifyFirebaseIdToken(m[1], context.env.FIREBASE_PROJECT_ID);
    if (!verify.ok || !verify.uid) return json({ ok: false, error: verify.error || 'invalid id token' }, 401);

    const sa = {
      privateKeyPem: context.env.FIREBASE_SA_PRIVATE_KEY,
      clientEmail: context.env.FIREBASE_SA_CLIENT_EMAIL,
    };
    const doc = await firestoreGetDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: `tgBindCodes/${encodeURIComponent(code)}`,
      sa,
    }).catch(() => null) as BindCodeRecord | null;

    if (!doc) return json({ ok: true, status: 'not_found' });
    if (doc.uid !== verify.uid) return json({ ok: false, error: 'code belongs to another user' }, 403);

    if (doc.expiresAtMs && Date.now() > doc.expiresAtMs && doc.status === 'pending') {
      return json({ ok: true, status: 'expired' });
    }

    return json({
      ok: true,
      status: doc.status || 'pending',
      tgId: doc.tgId,
    });
  } catch (e) {
    return json({ ok: false, error: `tg-check-bind-code exception: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
};
