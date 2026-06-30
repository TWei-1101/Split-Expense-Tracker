// Sign Firebase custom token WITHOUT firebase-admin SDK (workerd-compatible).
//
// Firebase custom token spec (REST signInWithCustomToken validates this format):
// - Header: { alg: "RS256", typ: "JWT", kid: <key_id> }
// - Claims: {
//     aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
//     iss: "<service_account_email>",
//     sub: "<service_account_email>",
//     iat: <unix>,
//     exp: <unix>,
//     uid: "<firebase_user_uid>",
//     claims: { ...optional extras }
//   }
//
// Then client calls auth.signInWithCustomToken(token) which swaps it for an ID token.

interface ServiceAccount {
  privateKeyPem: string;
  clientEmail: string;
  // kid = base64 url-safe SHA-256 thumbprint of the DER key (Firebase looks this up from their side)
  // For issuing tokens ourselves, kid is technically not enforced, but we set it anyway for correctness.
  privateKeyId?: string;
}

interface CustomTokenOpts {
  uid: string;
  serviceAccount: ServiceAccount;
  projectId: string;
  expiresInSeconds?: number;
  customClaims?: Record<string, unknown>;
}

function base64url(input: ArrayBufferLike | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input as ArrayBuffer);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBuffer(pem: string): ArrayBuffer {
  // strip BEGIN/END markers, decode base64
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function sha256Bytes(input: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', input);
}

async function deriveKid(pem: string): Promise<string> {
  // Compute SHA-256 thumbprint of the JWK (public-key-only JsonWebKey), then base64url-encode it.
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign']
  );
  const jwk = (await crypto.subtle.exportKey('jwk', key)) as JsonWebKey;
  if (!jwk.n || !jwk.e) throw new Error('Cannot derive kid from key');
  const jwkString = JSON.stringify({ kty: 'RSA', n: jwk.n, e: jwk.e });
  const enc = new TextEncoder().encode(jwkString);
  const hash = await sha256Bytes(enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer);
  return base64url(hash);
}

export async function signFirebaseCustomToken(opts: CustomTokenOpts): Promise<string> {
  const { uid, serviceAccount, projectId, expiresInSeconds = 3600, customClaims = {} } = opts;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;

  const kid = serviceAccount.privateKeyId || await deriveKid(serviceAccount.privateKeyPem);

  const header = { alg: 'RS256', typ: 'JWT', kid };
  const payload = {
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iss: serviceAccount.clientEmail,
    sub: serviceAccount.clientEmail,
    iat,
    exp,
    uid,
    claims: customClaims,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importRsaKey(serviceAccount.privateKeyPem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(sig)}`;
}
