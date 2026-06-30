// Verify Firebase ID tokens using `jose` library (workerd-compatible).
//
// Firebase ID tokens are JWTs signed by Google's securetoken service.
// Google's signing keys are published at
//   https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com
// (x509 PEMs, not JWKs), so we use createRemoteJWKSet with a custom fetch and
// convert PEM -> JWK on-the-fly via the PEM -> public-key parser below.

import { jwtVerify, createLocalJWKSet, importSPKI } from 'jose';

interface VerifyResult {
  ok: boolean;
  uid?: string;
  email?: string;
  error?: string;
}

let cachedKeySet: ReturnType<typeof createLocalJWKSet> | null = null;
let cachedKeysAt = 0;
const KEYS_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const ALG_HEADER = 'x-goog-x4-server-key-name';

async function fetchAndCacheJWKS(): Promise<ReturnType<typeof createLocalJWKSet>> {
  if (cachedKeySet && Date.now() - cachedKeysAt < KEYS_TTL_MS) return cachedKeySet;

  // Fetch x509 PEMs from Google's cert repo
  const resp = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!resp.ok) throw new Error(`google certs http ${resp.status}`);
  const x5cMap = (await resp.json()) as Record<string, string>; // kid -> BEGIN...END
  const jwks: Record<string, { kty: 'RSA'; e: string; n: string; kid: string; alg: 'RS256'; use: 'sig' }> = {};
  await Promise.all(Object.entries(x5cMap).map(async ([kid, pem]) => {
    try {
      const key = await importSPKI(pem, 'RS256', { extractable: true });
      const jwkAny = await crypto.subtle.exportKey('jwk', key) as { n?: string; e?: string };
      if (!jwkAny.n || !jwkAny.e) return;
      jwks[kid] = {
        kty: 'RSA',
        e: jwkAny.e,
        n: jwkAny.n,
        kid,
        alg: 'RS256',
        use: 'sig',
      };
    } catch (err) {
      // skip key we can't convert
    }
  }));

  if (!Object.keys(jwks).length) throw new Error('no usable Google signing keys');
  cachedKeySet = createLocalJWKSet({ keys: Object.values(jwks) });
  cachedKeysAt = Date.now();
  return cachedKeySet;
}

export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<VerifyResult> {
  try {
    const jwks = await fetchAndCacheJWKS();
    const { payload, key } = await jwtVerify(idToken, jwks as Parameters<typeof jwtVerify>[1], {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    // jose v5 jwks.get return key for header.kid lookup
    void key;
    const uid = payload.user_id;
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    if (!uid || typeof uid !== 'string') return { ok: false, error: 'no uid in token' };
    return { ok: true, uid, email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
