import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { getRequestListener } from '@hono/node-server';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { type RoomsServiceConfig } from './config.js';
import { GameRoom } from './game-room.js';
import { createInternalApp } from './internal.js';

export type { RoomsServiceConfig } from './config.js';

export type RoomsServerBundle = {
  app: ReturnType<typeof createInternalApp>;
  gameServer: Server;
};

export function createRoomsServer(config: RoomsServiceConfig): RoomsServerBundle {
  const app = createInternalApp({
    internalSecret: config.internalSecret,
    startedAtMs: Date.now(),
    version: config.version,
  });
  const httpServer = createHttpServer();
  const transport = new WebSocketTransport({ server: httpServer, maxPayload: 128 * 1024 });
  const requestListener = getRequestListener(app.fetch);
  const gameServer = new Server({
    transport,
    gracefullyShutdown: false,
    greet: false,
    express(expressApp) {
      expressApp.use((request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
        void requestListener(request, response).catch(next);
      });
    },
  });
  gameServer.define('game', GameRoom, {
    runtime: {
      grantSecret: config.grantSecret,
      internalSecret: config.internalSecret,
      apiInternalUrl: config.apiInternalUrl,
      gamesOrigin: config.gamesOrigin,
      timings: config.timings,
      fetchFn: config.endedFetch ?? fetch,
    },
  } as import('./game-room.js').GameRoomOptions);
  return { app, gameServer };
}
