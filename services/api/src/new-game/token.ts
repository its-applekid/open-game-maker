import { createHmac, timingSafeEqual } from 'node:crypto';

// A request's scoped bearer: one New Game request's private context and nothing else. Minted by the API for an
// authorised internal caller (the Executor) and handed to an agent, never written to GitHub. The secret is derived
// from the API's job token secret with a domain separator, so no extra secret has to be distributed.
const PREFIX = 'ngc1';
export const CONTEXT_TOKEN_TTL_SEC = 60 * 60;

export type ContextTokenClaims = { request: string; game: string; exp: number };

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function contextTokenSecret(jobTokenSecret: string): string {
  return createHmac('sha256', jobTokenSecret).update('ogm.new-game.context.v1').digest('hex');
}

// "ngc1.<b64url claims json>.<b64url hmac-sha256(secret, 'ngc1.<b64url claims json>')>"; carries no secret.
export function signContextToken(
  claims: Omit<ContextTokenClaims, 'exp'> & { exp?: number },
  secret: string,
  nowMs = Date.now(),
): { token: string; expiresAt: string } {
  const exp = claims.exp ?? Math.floor(nowMs / 1000) + CONTEXT_TOKEN_TTL_SEC;
  const full: ContextTokenClaims = { request: claims.request, game: claims.game, exp };
  const body = `${PREFIX}.${Buffer.from(JSON.stringify(full)).toString('base64url')}`;
  return { token: `${body}.${mac(secret, body).toString('base64url')}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyContextToken(token: string, secret: string, nowMs = Date.now()): ContextTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;

  const expected = mac(secret, `${parts[0]}.${parts[1]}`);
  const given = Buffer.from(parts[2]!, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const claims = raw as Partial<ContextTokenClaims>;
  if (typeof claims.request !== 'string' || typeof claims.game !== 'string') return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null;
  return { request: claims.request, game: claims.game, exp: claims.exp };
}
