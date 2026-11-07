import { createHash, timingSafeEqual } from 'node:crypto';

import type { Context } from 'hono';

import type { ApiBindings } from './types.js';

export function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// The internal credential in its own header, so a scoped request token and the shared internal secret never mix. The
// Executor's unit and the game's own agents carry this secret for the private New Game routes.
export function hasInternalCredential(c: Context<ApiBindings>): boolean {
  const given = c.req.header('x-ogm-internal');
  return given !== undefined && given !== '' && sameSecret(given, c.get('deps').config.internalToken);
}

// "Bearer <token>" from the Authorization header, or null when the header is absent or not a bearer.
export function bearerToken(c: Context<ApiBindings>): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
  return match ? match[1] : null;
}
