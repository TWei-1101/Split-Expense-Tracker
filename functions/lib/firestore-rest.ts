// Firestore REST API access from Cloudflare Pages Functions
//
// We avoid firebase-admin because it's Node-only. Instead, we sign a JWT with the
// service account and exchange it for an OAuth token via the Google token endpoint,
// then call Firestore REST directly.
//
// Collection used for Mini App binding: tgAccounts/{tgId} -> { uid, linkedAt }
// Collection used for linking codes: tgBindCodes/{code} -> { uid, chatId, status }

interface ServiceAccountAuth {
  privateKeyPem: string;
  clientEmail: string;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

async function getOAuthAccessToken(sa: ServiceAccountAuth): Promise<string> {
  const cached = tokenCache.get(sa.clientEmail);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  function base64url(s: ArrayBufferLike | string): string {
    let bytes: Uint8Array;
    if (typeof s === 'string') {
      bytes = new TextEncoder().encode(s);
    } else {
      bytes = new Uint8Array(s as ArrayBuffer);
    }
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const pem = sa.privateKeyPem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binKey = atob(pem);
  const derKey = new Uint8Array(binKey.length);
  for (let i = 0; i < binKey.length; i++) derKey[i] = binKey.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    derKey.buffer.slice(derKey.byteOffset, derKey.byteOffset + derKey.byteLength) as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const messageBytes = new TextEncoder().encode(signingInput);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    messageBytes.buffer.slice(messageBytes.byteOffset, messageBytes.byteOffset + messageBytes.byteLength) as ArrayBuffer
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await resp.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) {
    throw new Error(`OAuth exchange failed: ${data.error ?? JSON.stringify(data)}`);
  }

  tokenCache.set(sa.clientEmail, {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  });
  return data.access_token;
}

export async function firestoreGetDocument(opts: {
  projectId: string;
  path: string;
  sa: ServiceAccountAuth;
}): Promise<Record<string, unknown> | null> {
  const token = await getOAuthAccessToken(opts.sa);
  const url = `https://firestore.googleapis.com/v1/projects/${opts.projectId}/databases/(default)/documents/${opts.path}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore get ${resp.status}: ${txt}`);
  }
  const doc = await resp.json() as { fields?: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string; booleanValue?: boolean }> };
  if (!doc.fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = parseInt(v.integerValue!, 10);
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else out[k] = JSON.stringify(v);
  }
  return out;
}

export async function firestorePatchDocument(opts: {
  projectId: string;
  path: string;
  fields: Record<string, string | number | boolean>;
  sa: ServiceAccountAuth;
}): Promise<void> {
  const token = await getOAuthAccessToken(opts.sa);
  const url = `https://firestore.googleapis.com/v1/projects/${opts.projectId}/databases/(default)/documents/${opts.path}`;
  const body = {
    fields: Object.fromEntries(
      Object.entries(opts.fields).map(([k, v]) => [
        k,
        typeof v === 'string' ? { stringValue: v } :
        typeof v === 'boolean' ? { booleanValue: v } :
        { integerValue: String(v) },
      ])
    ),
  };
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore patch ${resp.status}: ${txt}`);
  }
}

export async function firestoreCreateDocument(opts: {
  projectId: string;
  path: string;     // collection path (no doc id)
  docId: string;    // explicit document id
  fields: Record<string, string | number | boolean>;
  sa: ServiceAccountAuth;
}): Promise<void> {
  const token = await getOAuthAccessToken(opts.sa);
  const url = `https://firestore.googleapis.com/v1/projects/${opts.projectId}/databases/(default)/documents/${opts.path}?documentId=${encodeURIComponent(opts.docId)}`;
  const body = {
    fields: Object.fromEntries(
      Object.entries(opts.fields).map(([k, v]) => [
        k,
        typeof v === 'string' ? { stringValue: v } :
        typeof v === 'boolean' ? { booleanValue: v } :
        { integerValue: String(v) },
      ])
    ),
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore create ${resp.status}: ${txt}`);
  }
}
