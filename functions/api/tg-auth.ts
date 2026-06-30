// POST /api/tg-auth
// Body: { initData: string }
// Returns: { ok: true, customToken, uid } | { ok: false, error, needLink? }

import { verifyTelegramInitData } from '../lib/tg-verify';
import { signFirebaseCustomToken } from '../lib/firebase-custom-token';
import { firestoreGetDocument } from '../lib/firestore-rest';

interface Env {
  TG_BOT_TOKEN: string;
  TG_BOT_USERNAME: string;
  FIREBASE_SA_PRIVATE_KEY: string;
  FIREBASE_SA_CLIENT_EMAIL: string;
  FIREBASE_PROJECT_ID: string;
}

interface BindAccount {
  uid: string;
  linkedAt?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (context.request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

    const body = (await context.request.json()) as { initData?: string };
    if (!body?.initData) return json({ ok: false, error: 'initData required' }, 400);

    const verifyResult = await verifyTelegramInitData(body.initData, context.env.TG_BOT_TOKEN);
    if (!verifyResult.ok || !verifyResult.user) {
      return json({ ok: false, error: verifyResult.error || 'invalid initData' }, 401);
    }

    const tgId = String(verifyResult.user.id);

    // Look up binding in Firestore
    const sa = {
      privateKeyPem: context.env.FIREBASE_SA_PRIVATE_KEY,
      clientEmail: context.env.FIREBASE_SA_CLIENT_EMAIL,
    };
    const bind = await firestoreGetDocument({
      projectId: context.env.FIREBASE_PROJECT_ID,
      path: `tgAccounts/${encodeURIComponent(tgId)}`,
      sa,
    }).catch(() => null);

    if (!bind || !(bind as unknown as BindAccount).uid) {
      return json({
        ok: false,
        error: 'tg account not linked to expense yet',
        needLink: true,
        tgId,
        botUsername: context.env.TG_BOT_USERNAME || null,
      }, 404);
    }

    const bindData = bind as unknown as BindAccount;
    const uid = bindData.uid;
    const customToken = await signFirebaseCustomToken({
      uid,
      serviceAccount: {
        privateKeyPem: context.env.FIREBASE_SA_PRIVATE_KEY,
        clientEmail: context.env.FIREBASE_SA_CLIENT_EMAIL,
      },
      projectId: context.env.FIREBASE_PROJECT_ID,
    });

    return json({
      ok: true,
      customToken,
      uid,
      tg: { id: verifyResult.user.id, first_name: verifyResult.user.first_name, username: verifyResult.user.username },
    });
  } catch (e) {
    return json({ ok: false, error: `tg-auth exception: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
};
