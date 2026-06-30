// Telegram WebApp initData signature verification
// Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Algorithm:
// 1. parse initData, extract "hash" field
// 2. data_check_string = sorted (k=v) joined with \n, excluding hash
// 3. secret_key = HMAC-SHA256(bot_token, "WebAppData")
// 4. computed = HMAC-SHA256(secret_key, data_check_string).hex()
// 5. compare computed == hash (constant-time)

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface VerifyResult {
  ok: boolean;
  user?: TelegramUser;
  auth_date?: string;
  query_id?: string;
  start_param?: string;
  raw?: Record<string, string>;
  error?: string;
}

const HMAC_ALG = { name: 'HMAC', hash: 'SHA-256' } as const;

async function hmacSha256(keyData: ArrayBuffer | Uint8Array | string, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof keyData === 'string' ? new TextEncoder().encode(keyData) : keyData instanceof Uint8Array ? keyData : keyData,
    HMAC_ALG,
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  opts?: { maxAgeSeconds?: number }
): Promise<VerifyResult> {
  const maxAge = opts?.maxAgeSeconds ?? 600;
  try {
    if (!initData || !botToken) return { ok: false, error: 'missing initData or botToken' };

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'no hash field' };

    // data_check_string: sorted (k=v) joined with \n, excluding hash
    const dataCheckString = Array.from(params.entries())
      .filter(([k]) => k !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // secret_key = HMAC-SHA256(bot_token, "WebAppData")
    const secretKey = await hmacSha256('WebAppData', botToken);
    // computed = HMAC-SHA256(secret_key, data_check_string).hex()
    const computed = bufferToHex(await hmacSha256(new Uint8Array(secretKey), dataCheckString));

    if (!safeCompare(computed, hash)) return { ok: false, error: 'signature mismatch' };

    // check auth_date for replay protection (default 10 minutes)
    const authDateRaw = params.get('auth_date');
    if (authDateRaw) {
      const authTs = parseInt(authDateRaw, 10);
      if (Number.isFinite(authTs)) {
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - authTs) > maxAge) {
          return { ok: false, error: `initData too old (${now - authTs}s > ${maxAge}s)` };
        }
      }
    }

    // collect raw params
    const raw: Record<string, string> = {};
    params.forEach((v, k) => { raw[k] = v; });

    const userJson = raw.user;
    const user = userJson ? (JSON.parse(userJson) as TelegramUser) : undefined;

    return {
      ok: true,
      user,
      auth_date: authDateRaw || undefined,
      query_id: raw.query_id,
      start_param: raw.start_param,
      raw,
    };
  } catch (e) {
    return { ok: false, error: `verify exception: ${String(e)}` };
  }
}
