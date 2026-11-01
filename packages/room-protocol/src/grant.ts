import { randomUUID } from 'node:crypto';

import { LIMITS, RoomGrantSchema, type Role, type RoomGrant } from '@ogm/contracts';
import { errors, jwtVerify, SignJWT } from 'jose';

/** Clock skew `verifyGrant` tolerates, and no more. */
export const GRANT_LEEWAY_SEC = 30;
const MIN_SECRET_BYTES = 32;

export type GrantClaims = { sub: string; roomId: string; gameId: string; role: Role; name: string; ttlSec?: number };
export type GrantResult = { ok: true; grant: RoomGrant } | { ok: false; code: 'GRANT_INVALID' | 'GRANT_EXPIRED' };

/** Accepts the env string as read through @ogm/config, or raw bytes. */
export type GrantSecret = string | Uint8Array;

function keyOf(secret: GrantSecret): Uint8Array {
  const key = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
  if (key.byteLength < MIN_SECRET_BYTES) throw new Error(`grant secret must be at least ${MIN_SECRET_BYTES} bytes`);
  return key;
}

/**
 * Signs a room grant (HS256). The secret is OGM_WS_TOKEN_SECRET, read by name through @ogm/config.
 * The token is a bearer secret: never log it, put it in a URL, or pass it to the game iframe.
 */
export async function signGrant(claims: GrantClaims, secret: GrantSecret, nowMs = Date.now()): Promise<string> {
  const key = keyOf(secret);
  const { ttlSec = LIMITS.grantTtlSec, ...rest } = claims;
  const iat = Math.floor(nowMs / 1000);
  const ttl = Math.min(Math.max(Math.floor(ttlSec), 1), LIMITS.grantTtlSec);
  const grant = RoomGrantSchema.parse({ ...rest, iat, exp: iat + ttl, jti: randomUUID() });
  return new SignJWT(grant).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
}

/** Verifies a grant offline. Failure codes are the `JoinRejection` codes the room returns. */
export async function verifyGrant(token: string, secret: GrantSecret, nowMs = Date.now()): Promise<GrantResult> {
  const key = keyOf(secret);
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      clockTolerance: GRANT_LEEWAY_SEC,
      currentDate: new Date(nowMs),
      requiredClaims: ['iat', 'exp', 'jti'],
    });
    const parsed = RoomGrantSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'GRANT_INVALID' };
    if (parsed.data.exp > Math.floor(nowMs / 1000) + LIMITS.grantTtlSec + GRANT_LEEWAY_SEC) {
      return { ok: false, code: 'GRANT_INVALID' };
    }
    return { ok: true, grant: parsed.data };
  } catch (error) {
    return { ok: false, code: error instanceof errors.JWTExpired ? 'GRANT_EXPIRED' : 'GRANT_INVALID' };
  }
}
