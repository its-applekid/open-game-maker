import type { Envelope, HostToGame } from '@ogm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { boot } from './boot.js';
import { createCounterGame } from '../test/fixtures/counter-game.js';

const bridge = vi.hoisted(() => ({
  close: vi.fn(),
  onMessage: undefined as ((message: Envelope<string, unknown>) => void) | undefined,
  send: vi.fn(),
}));

vi.mock('@ogm/iframe-bridge', () => ({
  openGameBridge: vi.fn((options: { onMessage: (message: Envelope<string, unknown>) => void }) => {
    bridge.onMessage = options.onMessage;
    return { ready: Promise.resolve(), send: bridge.send, close: bridge.close, request: vi.fn() };
  }),
}));

const hello = {
  v: 1,
  id: 'host-hello',
  t: 'hello',
  payload: { protocol: 1, capabilities: [], mode: 'play', build: 'published', playerIndex: 0 },
} as HostToGame;

async function start(build?: 'draft' | 'published') {
  const fixture = createCounterGame();
  const pending = boot(fixture.module, { hostOrigin: 'https://app.test', headless: true, build });
  await vi.waitFor(() => expect(bridge.onMessage).toBeTypeOf('function'));
  bridge.onMessage!(hello);
  return pending;
}

// C8: a published game must not ship or serve the debug adapter, whatever the host claims.
describe('published boot', () => {
  beforeEach(() => {
    bridge.close.mockReset();
    bridge.send.mockReset();
    bridge.onMessage = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ['__gm', 'render_game_to_text', 'advanceTime', '__frame', '__ready', '__marks']) {
      Reflect.deleteProperty(window, key);
    }
  });

  it('refuses every test request instead of answering it', async () => {
    const runtime = await start('published');
    const renderGameToText = vi.spyOn(runtime.hooks, 'renderGameToText');
    bridge.send.mockClear();

    bridge.onMessage!({ v: 1, id: 'host-1', t: 'test.renderGameToText', payload: {} });
    bridge.onMessage!({ v: 1, id: 'host-2', t: 'test.advanceTime', payload: { ms: 17 } });

    expect(renderGameToText).not.toHaveBeenCalled();
    expect(runtime.instance.serialize().data).toMatchObject({ counter: 0 });
    for (const replyTo of ['host-1', 'host-2']) {
      expect(bridge.send).toHaveBeenCalledWith(
        expect.objectContaining({ t: 'test.result', replyTo, payload: expect.objectContaining({ ok: false }) }),
      );
    }
    expect(window.__gm).toBeUndefined();
    expect(window.render_game_to_text).toBeUndefined();
  });

  it('keeps a published compile published when boot options ask for draft', async () => {
    vi.stubGlobal('__GM_BUILD__', 'published');
    const runtime = await start('draft');

    expect(runtime.build).toBe('published');
    expect(window.__gm).toBeUndefined();
  });

  it('still answers test requests in a draft build', async () => {
    await start('draft');
    bridge.send.mockClear();

    bridge.onMessage!({ v: 1, id: 'host-3', t: 'test.renderGameToText', payload: {} });

    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'test.result', replyTo: 'host-3', payload: expect.objectContaining({ ok: true }) }),
    );
    await vi.waitFor(() => expect(window.render_game_to_text).toBeTypeOf('function'));
  });
});
