import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type WsTokenClaims = { sub: string; familyId: string; exp: number; nonce: string };

const PREFIX = 'ogw1';
export const WS_TOKEN_TTL_SEC = 5 * 60;

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

// "ogw1.<b64url claims json>.<b64url hmac-sha256(secret, 'ogw1.<b64url claims json>')>": a short-lived
// session proof for socket services that cannot read the session cookie.
export function signWsToken(
  c: Omit<WsTokenClaims, 'exp' | 'nonce'>,
  secret: string,
  ttlSec = WS_TOKEN_TTL_SEC,
  nowMs = Date.now(),
): { token: string; expiresAt: string } {
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  const claims: WsTokenClaims = { sub: c.sub, familyId: c.familyId, exp, nonce: randomBytes(12).toString('base64url') };
  const body = `${PREFIX}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
  return { token: `${body}.${mac(secret, body).toString('base64url')}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyWsToken(token: string, secret: string, now = Date.now()): WsTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;

  const expected = mac(secret, `${parts[0]}.${parts[1]}`);
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const raw = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<WsTokenClaims>;
    if (typeof raw.sub !== 'string' || typeof raw.familyId !== 'string') return null;
    if (typeof raw.exp !== 'number' || typeof raw.nonce !== 'string' || raw.exp * 1000 <= now) return null;
    return { sub: raw.sub, familyId: raw.familyId, exp: raw.exp, nonce: raw.nonce };
  } catch {
    return null;
  }
}
