import { createHash, timingSafeEqual } from 'node:crypto';

import { matchMaker } from '@colyseus/core';
import { LIMITS } from '@ogm/contracts';
import { healthResponse } from '@ogm/health';
import { Hono } from 'hono';
import { z } from 'zod';

import { type GameRoom, roomCount } from './game-room.js';
import { droppedSnapshot } from './metrics.js';

const createRoomBody = z
  .object({
    gameId: z.string().min(1),
    branchId: z.string().min(1),
    buildId: z.string().min(1),
    ownerId: z.string().min(1),
    maxPlayers: z.number().int().optional(),
  })
  .strict();

const revokeBody = z
  .object({ jti: z.string().min(1).optional(), userId: z.string().min(1).optional() })
  .strict()
  .refine((body) => body.jti !== undefined || body.userId !== undefined);

export type InternalAppOptions = {
  internalSecret: string;
  startedAtMs: number;
  version: string;
};

function bearerMatches(expected: string, authorization: string | undefined): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const expectedHash = createHash('sha256').update(expected).digest();
  const receivedHash = createHash('sha256').update(authorization.slice('Bearer '.length)).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

export function createInternalApp(options: InternalAppOptions): Hono {
  const app = new Hono();

  app.get('/healthz', (context) =>
    context.json({
      ...healthResponse({ service: 'rooms', version: options.version, startedAtMs: options.startedAtMs }),
      rooms: roomCount(),
      dropped: droppedSnapshot(),
    }),
  );

  app.use('/internal/*', async (context, next) => {
    if (!bearerMatches(options.internalSecret, context.req.header('authorization'))) {
      return context.body(null, 401);
    }
    await next();
  });

  app.post('/internal/rooms', async (context) => {
    const body = createRoomBody.safeParse(await context.req.json().catch(() => undefined));
    if (!body.success) return context.json({ error: 'invalid room' }, 400);
    const maxPlayers = Math.min(
      Math.max(body.data.maxPlayers ?? LIMITS.maxPlayersDefault, 1),
      LIMITS.maxPlayersCeiling,
    );
    const room = await matchMaker.createRoom('game', { ...body.data, maxPlayers });
    return context.json({ roomId: room.roomId }, 201);
  });

  app.post('/internal/rooms/:roomId/revoke', async (context) => {
    const body = revokeBody.safeParse(await context.req.json().catch(() => undefined));
    if (!body.success) return context.json({ error: 'invalid revoke' }, 400);
    try {
      await matchMaker.remoteRoomCall<GameRoom, 'revoke'>(context.req.param('roomId'), 'revoke', [body.data]);
      return context.body(null, 204);
    } catch {
      return context.body(null, 404);
    }
  });

  return app;
}
