// POST /api/tg-bind
// Body: { code: string, initData: string }
// 1. Verify initData (HMAC) — proves the request really comes from your TG user
// 2. Look up tgBindCodes/<code> — must contain uid and be not expired
// 3. Create tgAccounts/<tgId> = { uid, linkedAt, source: 'bind_code' }
// 4. Mark tgBindCodes/<code>.status = 'linked', store tgId

import { verifyTelegramInitData } from '../lib/tg-verify';
import { firestoreGetDocument, firestoreCreateDocument, firestorePatchDocument } from '../lib/firestore-rest';

interface Env {
  TG_BOT_TOKEN: string;
  FIREBASE_SA_PRIVATE_KEY: string;
  FIREBASE_SA_CLIENT_EMAIL: string;
  FIREBASE_PROJECT_ID: string;
}

interface BindCodeRecord {
  uid: string;
  status?: string;
  tgId?: string;
  expiresAtMs?: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as { code?: string; initData?: string };
    if (!body?.code || !body?.initData) return json({ ok: false, error: 'code and initData required' }, 400);

    const verifyResult = await verifyTelegramInitData(body.initData, context.env.TG_BOT_TOKEN);
    if (!verifyResult.ok || !verifyResult.user) {
      return json({ ok: false, error: verifyResult.error || 'invalid initData' }, 401);
    }
    const tgId = String(verifyResult.user.id);

    const sa = {
      privateKeyPem: context.env.FIREBASE_SA_PRIVATE_KEY,
      clientEmail: context.env.FIREBASE_SA_CLIENT_EMAIL,
    };

    // Look up the bind code (codes are short alphanumeric strings)
    const code = body.code.trim();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) return json({ ok: false, error: 'invalid code format' }, 400);

    const codeDoc = await firestoreGetDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: `tgBindCodes/${encodeURIComponent(code)}`,
      sa,
    }).catch(() => null) as BindCodeRecord | null;

    if (!codeDoc) return json({ ok: false, error: 'bind code not found' }, 404);
    if (codeDoc.status === 'linked') return json({ ok: false, error: 'bind code already used' }, 409);
    if (codeDoc.expiresAtMs && Date.now() > codeDoc.expiresAtMs) {
      return json({ ok: false, error: 'bind code expired' }, 410);
    }
    if (!codeDoc.uid) return json({ ok: false, error: 'bind code missing uid' }, 422);

    // Idempotency: if this tgId is already bound to this uid, succeed.
    const existing = await firestoreGetDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: `tgAccounts/${encodeURIComponent(tgId)}`,
      sa,
    }).catch(() => null) as { uid?: string } | null;

    if (existing?.uid && existing.uid === codeDoc.uid) {
      return json({ ok: true, alreadyLinked: true, tgId, uid: codeDoc.uid });
    }

    // Create binding
    await firestoreCreateDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: 'tgAccounts',
      docId: tgId,
      fields: {
        uid: codeDoc.uid,
        tgId,
        linkedAt: new Date().toISOString(),
        source: 'bind_code',
        tgUsername: verifyResult.user.username || '',
      },
      sa,
    });

    await firestorePatchDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: `tgBindCodes/${encodeURIComponent(code)}`,
      fields: {
        status: 'linked',
        tgId,
        linkedAt: new Date().toISOString(),
      },
      sa,
    }).catch(() => null);

    return json({ ok: true, tgId, uid: codeDoc.uid });
  } catch (e) {
    return json({ ok: false, error: `tg-bind exception: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
};
