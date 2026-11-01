import { createHmac, timingSafeEqual } from 'node:crypto';

import { JobTokenClaims } from '@ogm/contracts';

const PREFIX = 'gmj1';
export const JOB_TOKEN_TTL_SEC = 48 * 60 * 60;

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

// "gmj1.<b64url claims json>.<b64url hmac-sha256(secret, 'gmj1.<b64url claims json>')>"; carries no secret.
export function signJobToken(
  claims: Omit<JobTokenClaims, 'exp'> & { exp?: number },
  secret: string,
  nowMs = Date.now(),
): string {
  const full = JobTokenClaims.parse({ ...claims, exp: claims.exp ?? Math.floor(nowMs / 1000) + JOB_TOKEN_TTL_SEC });
  const body = `${PREFIX}.${Buffer.from(JSON.stringify(full)).toString('base64url')}`;
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyJobToken(token: string, secret: string, nowMs = Date.now()): JobTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;

  const body = `${parts[0]}.${parts[1]}`;
  const expected = mac(secret, body);
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const claims = JobTokenClaims.safeParse(raw);
  if (!claims.success || claims.data.exp * 1000 <= nowMs) return null;
  return claims.data;
}
