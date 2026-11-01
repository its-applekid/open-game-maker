import type { Envelope } from '@ogm/contracts';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openGameBridge } from '../src/game.js';
import { openHostBridge } from '../src/host.js';
import type { Bridge } from '../src/types.js';
import { hello, validate } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

describe('host and game integration', () => {
  it('handshakes across origins and resolves an id-correlated request', async () => {
    const hostDom = new JSDOM('', { url: 'https://app.test' });
    const gameDom = new JSDOM('', { url: 'https://games.test' });
    const hostWindow = hostDom.window;
    const gameWindow = gameDom.window;
    Object.defineProperty(gameWindow, 'parent', { value: hostWindow });
    hostWindow.postMessage = ((data: unknown) => {
      hostWindow.dispatchEvent(
        new hostWindow.MessageEvent('message', {
          data,
          origin: 'https://games.test',
          source: gameWindow,
        }),
      );
    }) as typeof hostWindow.postMessage;
    gameWindow.postMessage = ((data: unknown, _origin: string, transfer?: Transferable[]) => {
      gameWindow.dispatchEvent(
        new gameWindow.MessageEvent('message', {
          data,
          origin: 'https://app.test',
          source: hostWindow,
          ports: transfer as MessagePort[],
        }),
      );
    }) as typeof gameWindow.postMessage;

    vi.stubGlobal('window', hostWindow);
    const host = openHostBridge({ contentWindow: gameWindow } as unknown as HTMLIFrameElement, {
      gameOrigin: 'https://games.test',
      validate,
      onMessage: vi.fn(),
      hello: hello('host-hello'),
    });
    let game!: Bridge;
    vi.stubGlobal('window', gameWindow);
    game = openGameBridge({
      hostOrigin: 'https://app.test',
      validate,
      helloPayload: { protocol: 1 },
      onMessage: (env) => {
        if (env.t !== 'test.advanceTime') return;
        game.send({ v: 1, id: 'g7', t: 'test.result', replyTo: env.id, payload: { ok: true } });
      },
    });

    await Promise.all([host.ready, game.ready]);
    const reply = await host.request<Envelope<string, { ok: boolean }>>({
      v: 1,
      id: 'r1',
      t: 'test.advanceTime',
      payload: { ms: 500 },
    });

    expect(reply.payload.ok).toBe(true);
    expect(host.stats()).toMatchObject({ sent: 1, received: 1 });
    expect(game.stats()).toMatchObject({ sent: 1, received: 1 });
    host.close();
    game.close();
    hostDom.window.close();
    gameDom.window.close();
  });
});
