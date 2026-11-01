import { createHash, timingSafeEqual } from 'node:crypto';

import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import type { AppDeps } from '../app/types.js';
import { hasAdultAgeAttestation } from '../auth/routes.js';
import { clientIp, createRateLimiter } from '../auth/rate-limit.js';
import {
  createRoom,
  createRoomInvitation,
  freshRoomGrant,
  joinRoom,
  recordRoomEnded,
  revokeRoomAccess,
} from './rooms.js';

export const prefix = '/';

const joinLimiters = new WeakMap<AppDeps, ReturnType<typeof createRateLimiter>>();

export function setup(deps: AppDeps): void {
  joinLimiters.set(deps, createRateLimiter(10));
}

function joinLimiter(c: Context<ApiBindings>): ReturnType<typeof createRateLimiter> {
  const limiter = joinLimiters.get(c.get('deps'));
  if (!limiter) throw new Error('rooms context used before setup');
  return limiter;
}

const invitationBody = z.object({ email: z.email().optional() }).strict();
const createRoomBody = z
  .object({
    branchId: z.string().min(1),
    buildId: z.string().min(1),
    maxPlayers: z.number().int().optional(),
  })
  .strict();
const revokeBody = z
  .object({ jti: z.string().min(1).optional(), userId: z.string().min(1).optional() })
  .strict()
  .refine((body) => body.jti !== undefined || body.userId !== undefined);
const endedBody = z
  .object({
    reason: z.enum(['host-left', 'owner-closed', 'idle', 'revoked']),
    endedAt: z.iso.datetime(),
  })
  .strict();

function requireRoomsSecret(c: Context<ApiBindings>): void {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
  if (!match) throw new HttpError(401, 'unauthenticated');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(match[1]), digest(c.get('deps').config.roomsInternalSecret))) {
    throw new HttpError(401, 'unauthenticated');
  }
}

const routes = new Hono<ApiBindings>()
  .post('/api/v1/games/:gameId/rooms', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    return c.json(
      await createRoom(c.get('deps'), principal, {
        gameId: c.req.param('gameId'),
        ...(await parseBody(c, createRoomBody)),
      }),
      201,
    );
  })
  .get('/api/v1/join/:inviteToken', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    if (!hasAdultAgeAttestation(c)) throw new HttpError(403, 'age_required');
    if (!joinLimiter(c)(clientIp(c.req.raw.headers))) throw new HttpError(429, 'rate_limited');
    return c.json(await joinRoom(c.get('deps'), principal, c.req.param('inviteToken')));
  })
  .get('/api/v1/rooms/:roomId/grant', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    return c.json(await freshRoomGrant(c.get('deps'), principal, c.req.param('roomId')));
  })
  .post('/api/v1/rooms/:roomId/invites', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    return c.json(
      await createRoomInvitation(c.get('deps'), principal, c.req.param('roomId'), await parseBody(c, invitationBody)),
      201,
    );
  })
  .post('/api/v1/rooms/:roomId/revoke', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    await revokeRoomAccess(c.get('deps'), principal, c.req.param('roomId'), await parseBody(c, revokeBody));
    return c.body(null, 204);
  })
  .post('/internal/rooms/:roomId/ended', async (c) => {
    requireRoomsSecret(c);
    recordRoomEnded(c.get('deps'), c.req.param('roomId'), await parseBody(c, endedBody));
    return c.body(null, 204);
  });

export default routes;
