import { serve, type ServerType } from '@hono/node-server';
import { expect, test } from '@playwright/test';
import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { markComplete } from '../../src/layout.js';
import { createApp } from '../../src/server.js';
import { startTestServer, type TestServer } from './helpers/parent-server.js';

test.describe('games origin browser boundary', () => {
  let allowedParent: TestServer;
  let blockedParent: TestServer;
  let gamesServer: ServerType;
  let gamesOrigin: string;
  let outsideHits: number;
  let outsideServer: TestServer;
  let root: string;

  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ogm-games-browser-'));
    const build = join(root, 'demo', 'b1');
    const fixture = fileURLToPath(new URL('./fixtures/demo-build/', import.meta.url));
    await mkdir(dirname(build), { recursive: true });
    await cp(fixture, build, { recursive: true });
    await markComplete(build);

    outsideHits = 0;
    outsideServer = await startTestServer((_request, response) => {
      outsideHits += 1;
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('outside');
    });

    let parentGameOrigin = '';
    allowedParent = await startTestServer((_request, response) => {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
      response.end(parentHtml(parentGameOrigin, outsideServer.origin));
    });

    const app = createApp({
      root,
      appOrigin: allowedParent.origin,
      version: 'browser-test',
      workerScript: fileURLToPath(new URL('./fixtures/game-cache.js', import.meta.url)),
    });
    gamesServer = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    if (!gamesServer.listening) {
      await once(gamesServer, 'listening');
    }
    const address = gamesServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('games server did not bind a TCP port');
    }
    gamesOrigin = `http://127.0.0.1:${address.port}`;
    parentGameOrigin = gamesOrigin;

    blockedParent = await startTestServer((_request, response) => {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
      response.end(parentHtml(gamesOrigin, outsideServer.origin));
    });
  });

  test.afterAll(async () => {
    gamesServer.close();
    await once(gamesServer, 'close');
    await Promise.all([allowedParent.close(), blockedParent.close(), outsideServer.close()]);
    await rm(root, { recursive: true, force: true });
  });

  test('allows only the configured parent and blocks outside access', async ({ page }) => {
    await page.goto(allowedParent.origin);
    const iframe = page.locator('#game');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    await expect(iframe).toHaveAttribute('allow', 'autoplay; fullscreen; gamepad; microphone');
    const gameFrame = await waitForGameFrame(page, gamesOrigin);

    await expect(gameFrame.locator('#ready')).toHaveText('ready');
    await expect
      .poll(() =>
        gameFrame.evaluate(
          () =>
            Reflect.get(window, '__probe') as {
              cookie: string;
              fetchOutside: string;
              parentDocument: string;
            },
        ),
      )
      .toEqual({
        cookie: '',
        fetchOutside: 'blocked',
        parentDocument: 'blocked',
        serviceWorkerScope: `${gamesOrigin}/g/`,
      });
    expect(outsideHits).toBe(0);
  });

  test('blocks a parent outside frame-ancestors', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (message) => consoleMessages.push(message.text()));

    await page.goto(blockedParent.origin);

    await expect.poll(() => consoleMessages.some((message) => message.includes('frame-ancestors'))).toBe(true);
    expect(page.frames().some((frame) => frame.url().startsWith(`${gamesOrigin}/g/`))).toBe(false);
  });
});

function parentHtml(gamesOrigin: string, outsideOrigin: string): string {
  const source = `${gamesOrigin}/g/demo/b1/index.html?outside=${encodeURIComponent(`${outsideOrigin}/x`)}`;
  return `<!doctype html>
<html lang="en">
  <body>
    <iframe
      id="game"
      title="Game"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      allow="autoplay; fullscreen; gamepad; microphone"
      src="${source}"
    ></iframe>
  </body>
</html>`;
}

async function waitForGameFrame(page: import('@playwright/test').Page, gamesOrigin: string) {
  await expect.poll(() => page.frames().some((frame) => frame.url().startsWith(`${gamesOrigin}/g/`))).toBe(true);
  const frame = page.frames().find((candidate) => candidate.url().startsWith(`${gamesOrigin}/g/`));
  if (frame === undefined) {
    throw new Error('game frame did not load');
  }
  return frame;
}
