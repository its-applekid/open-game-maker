import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { Readable } from 'node:stream';

import { Hono, type Handler } from 'hono';

import { gameHeaders, healthHeaders } from './headers.js';
import { BadId, buildDir, isComplete, resolveFile } from './layout.js';
import { mimeForPath } from './mime.js';

export interface GamesHostOptions {
  appOrigin: string;
  root: string;
  uptimeSec?: () => number;
  version: string;
}

export function createApp(options: GamesHostOptions): Hono {
  const app = new Hono();
  const gameHeaderEntries = Object.entries(gameHeaders(options.appOrigin));
  const uptimeSec = options.uptimeSec ?? (() => process.uptime());

  app.use('/g/*', async (context, next) => {
    await next();
    for (const [name, value] of gameHeaderEntries) {
      context.res.headers.set(name, value);
    }
    context.res.headers.delete('set-cookie');
  });

  app.get('/healthz', (context) =>
    context.json(
      {
        ok: true,
        service: 'games-host',
        uptimeSec: Math.floor(uptimeSec()),
        version: options.version,
      },
      200,
      healthHeaders(),
    ),
  );

  const serveGame: Handler = async (context) => {
    const gameId = context.req.param('gameId') ?? '';
    const buildId = context.req.param('buildId') ?? '';
    let directory: string;
    try {
      directory = buildDir(options.root, gameId, buildId);
    } catch (error) {
      if (error instanceof BadId) {
        return context.text('Not Found', 404);
      }
      throw error;
    }

    if (!(await isComplete(directory))) {
      return context.text('Not Found', 404);
    }

    const urlPath = new URL(context.req.url).pathname.split('/').slice(4).join('/');
    const file = await resolveFile(directory, urlPath);
    if (file === null) {
      return context.text('Not Found', 404);
    }

    let fileStat;
    try {
      fileStat = await stat(file);
    } catch {
      return context.text('Not Found', 404);
    }
    if (!fileStat.isFile()) {
      return context.text('Not Found', 404);
    }

    const relativePath = relative(directory, file).split(sep).join('/');
    const headers = new Headers({
      'Content-Length': String(fileStat.size),
      'Content-Type': mimeForPath(file),
      ETag: `"${buildId}:${encodeURIComponent(relativePath)}"`,
    });
    const body = context.req.method === 'HEAD' ? null : (Readable.toWeb(createReadStream(file)) as unknown as BodyInit);
    return new Response(body, { headers, status: 200 });
  };

  app.on(['GET', 'HEAD'], '/g/:gameId/:buildId', serveGame);
  app.on(['GET', 'HEAD'], '/g/:gameId/:buildId/*', serveGame);

  app.notFound((context) => context.text('Not Found', 404, { 'Cache-Control': 'no-store' }));

  return app;
}
