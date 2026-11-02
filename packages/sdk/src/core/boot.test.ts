import type { Envelope, HostToGame } from '@ogm/contracts';
import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    return {
      ready: Promise.resolve(),
      send: bridge.send,
      close: bridge.close,
      request: vi.fn(),
      stats: () => ({ dropped: { tooLarge: 0, rateLimited: 0, invalid: 0 }, sent: 0, received: 0 }),
    };
  }),
}));

let id = 0;
const message = <T extends HostToGame['t']>(t: T, payload: Extract<HostToGame, { t: T }>['payload']) =>
  ({ v: 1, id: `host-${++id}`, t, payload }) as Extract<HostToGame, { t: T }>;

const hello = (build: 'draft' | 'test' | 'published' = 'draft') =>
  message('hello', {
    protocol: 1,
    capabilities: ['events'],
    mode: 'edit',
    build,
    playerIndex: 0,
  });

async function start(options: { helloBuild?: 'draft' | 'test' | 'published'; migrate?: boolean } = {}) {
  const fixture = createCounterGame(options);
  const pending = boot(fixture.module, { hostOrigin: 'https://app.test', headless: true });
  await vi.waitFor(() => expect(bridge.onMessage).toBeTypeOf('function'));
  bridge.onMessage!(hello(options.helloBuild));
  return { ...fixture, runtime: await pending };
}

describe('boot', () => {
  beforeEach(() => {
    id = 0;
    bridge.close.mockReset();
    bridge.send.mockReset();
    bridge.onMessage = undefined;
  });

  it('mounts from schema defaults and answers hello with ready marks', async () => {
    const { module, runtime } = await start();

    expect(runtime.instance.serialize().data).toMatchObject({ counter: 0, entities: {} });
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        t: 'ready',
        payload: expect.objectContaining({ manifest: module.manifest, marks: expect.any(Array) }),
      }),
    );
    expect(runtime.hooks.marks[0]?.[0]).toBe('start');
    expect(runtime.hooks.marks.at(-1)?.[0]).toBe('frame0');
    expect(runtime.hooks.ready).toBe(true);
  });

  it('applies valid designs once and returns the same revision', async () => {
    const { metrics } = await start();
    bridge.onMessage!(
      message('design.apply', {
        rev: 5,
        doc: { speed: 9, entities: {} },
        patches: [{ op: 'replace', path: ['speed'], value: 9 }],
      }),
    );

    await vi.waitFor(() => expect(metrics.applyCalls).toBe(1));
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'design.applied', payload: { rev: 5, result: 'live' } }),
    );

    bridge.onMessage!(message('design.apply', { rev: 6, doc: { speed: 99 }, patches: [] }));
    await vi.waitFor(() => expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ t: 'error' })));
    expect(metrics.applyCalls).toBe(1);
  });

  it('restores the last save and reports a throwing design application', async () => {
    const { metrics, runtime } = await start();
    const applyDesign = runtime.instance.applyDesign.bind(runtime.instance);
    let throwAfterApply = true;
    runtime.instance.applyDesign = (design, patches) => {
      const result = applyDesign(design, patches);
      if (!throwAfterApply) return result;
      throwAfterApply = false;
      throw new Error('design exploded');
    };

    bridge.onMessage!(
      message('design.apply', {
        rev: 7,
        doc: { speed: 2, entities: {} },
        patches: [{ op: 'replace', path: ['speed'], value: 2 }],
      }),
    );

    await vi.waitFor(() => expect(metrics.restoreCalls).toHaveLength(1));
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        t: 'error',
        replyTo: expect.any(String),
        payload: expect.objectContaining({ code: 'apply_failed', message: 'Error: design exploded' }),
      }),
    );
    runtime.hooks.inject({ playerIndex: 0, tick: 0, source: 'keyboard', actions: { go: true } });
    runtime.hooks.advanceTime(17);
    expect(runtime.instance.serialize().data.counter).toBe(1);
  });

  it('uses the compiled build kind instead of the host claim', async () => {
    const { runtime } = await start({ helloBuild: 'published' });

    expect(runtime.build).toBe('draft');
  });

  it('migrates supported saves and rejects unsupported versions', async () => {
    const migrated = await start();
    bridge.onMessage!(message('save.restore', { saveSchemaVersion: 0, data: { counter: 4 } }));
    await vi.waitFor(() => expect(migrated.metrics.restoreCalls).toHaveLength(1));
    expect(migrated.metrics.restoreCalls[0]?.saveSchemaVersion).toBe(1);
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'save.write', payload: expect.objectContaining({ reason: 'migration' }) }),
    );

    bridge.send.mockClear();
    const unsupported = await start({ migrate: false });
    bridge.onMessage!(message('save.restore', { saveSchemaVersion: 0, data: { counter: 4 } }));
    await vi.waitFor(() =>
      expect(bridge.send).toHaveBeenCalledWith(
        expect.objectContaining({ t: 'error', payload: expect.objectContaining({ code: 'save_unsupported' }) }),
      ),
    );
    expect(unsupported.metrics.restoreCalls).toHaveLength(0);
  });

  it('does not call migrate for a save two schemas behind', async () => {
    const { metrics, runtime } = await start();
    runtime.instance.serialize = () => ({ saveSchemaVersion: 2, data: { counter: 0, entities: {}, players: [] } });
    runtime.instance.migrate = vi.fn(runtime.instance.migrate);
    bridge.onMessage!(message('save.restore', { saveSchemaVersion: 0, data: { counter: 4 } }));

    await vi.waitFor(() =>
      expect(bridge.send).toHaveBeenCalledWith(
        expect.objectContaining({ t: 'error', payload: expect.objectContaining({ code: 'save_unsupported' }) }),
      ),
    );
    expect(runtime.instance.migrate).not.toHaveBeenCalled();
    expect(metrics.restoreCalls).toHaveLength(0);
  });

  it('fans input, viewport, settings, lifecycle, and checkpoint saves through the runtime', async () => {
    const { metrics, runtime } = await start();
    const frame = { playerIndex: 0, tick: 0, source: 'keyboard' as const, actions: { go: true } };

    bridge.onMessage!(
      message('viewport', {
        w: 640,
        h: 360,
        dpr: 2,
        orientation: 'landscape',
        safe: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    );
    bridge.onMessage!(message('settings', { mute: false, volume: 0.5, textScale: 1, reduceMotion: false }));
    bridge.onMessage!(message('input.frame', frame));
    runtime.hooks.advanceTime(17);

    expect(metrics.lastViewport).toMatchObject({ w: 640, h: 360 });
    expect(metrics.lastSettings).toMatchObject({ volume: 0.5 });
    expect(runtime.instance.serialize().data.counter).toBe(1);

    bridge.onMessage!(message('lifecycle.pause', {}));
    runtime.hooks.advanceTime(1000);
    expect(runtime.clock.tick).toBe(1);
    bridge.onMessage!(message('lifecycle.resume', {}));
    bridge.onMessage!(message('mode.set', { mode: 'play' }));
    expect(runtime.mode).toBe('play');

    runtime.host.events.emit('checkpoint', { reason: 'test' });
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ t: 'event' }));
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ t: 'save.write' }));
  });

  it('samples held canvas input on each fixed step and forwards raw host hotkeys', async () => {
    const { runtime } = await start();
    const canvas = document.createElement('canvas');
    runtime.attachInput({
      canvas,
      mapping: {
        keyboard: { KeyG: 'go', Escape: 'host.pause' },
        touch: 'stick',
        gamepad: {},
        pointerLock: false,
      },
    });

    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    runtime.hooks.advanceTime(34);
    expect(runtime.instance.serialize().data.counter).toBe(2);

    canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG' }));
    runtime.hooks.advanceTime(17);
    expect(runtime.instance.serialize().data.counter).toBe(2);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'input.rawKey', payload: { code: 'Escape', down: true } }),
    );
  });

  it('replays recorded merged frames without current held input leaking into history', async () => {
    const { runtime } = await start();
    const canvas = document.createElement('canvas');
    runtime.attachInput({
      canvas,
      mapping: {
        keyboard: { KeyG: 'go' },
        touch: 'stick',
        gamepad: {},
        pointerLock: false,
      },
    });

    runtime.hooks.advanceTime(17);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    runtime.hooks.advanceTime(17);
    expect(runtime.instance.serialize().data.counter).toBe(1);

    runtime.hooks.renderAt(17);
    expect(runtime.instance.serialize().data.counter).toBe(0);
  });

  it('refuses a published build forced into test mode by the URL', async () => {
    history.replaceState({}, '', '?build=test');
    const fixture = createCounterGame();
    const pending = boot(fixture.module, { hostOrigin: 'https://app.test', build: 'published', headless: true });
    await vi.waitFor(() => expect(bridge.onMessage).toBeTypeOf('function'));
    bridge.onMessage!(hello());

    await expect(pending).rejects.toThrow('published build');
    history.replaceState({}, '', '/');
  });

  it('rejects a mismatched host protocol before mounting', async () => {
    const fixture = createCounterGame();
    const pending = boot(fixture.module, { hostOrigin: 'https://app.test', headless: true });
    await vi.waitFor(() => expect(bridge.onMessage).toBeTypeOf('function'));
    bridge.onMessage!(message('hello', { ...hello().payload, protocol: 2 }));

    await expect(pending).rejects.toThrow('unsupported host protocol 2');
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'error', payload: expect.objectContaining({ code: 'protocol_mismatch' }) }),
    );
  });

  it('fails before ready when the module has no default design', async () => {
    const fixture = createCounterGame();
    fixture.module.designSchema = z.object({
      speed: z.number(),
      entities: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
    });
    const pending = boot(fixture.module, { hostOrigin: 'https://app.test', headless: true });
    await vi.waitFor(() => expect(bridge.onMessage).toBeTypeOf('function'));
    bridge.onMessage!(hello());

    await expect(pending).rejects.toThrow();
    expect(bridge.close).toHaveBeenCalledOnce();
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'error', payload: expect.objectContaining({ code: 'boot_failed' }) }),
    );
  });

  it('disposes a mounted game when later boot initialization fails', async () => {
    const fixture = createCounterGame();
    const mount = fixture.module.mount.bind(fixture.module);
    fixture.module.mount = async (...args) => {
      const instance = await mount(...args);
      instance.serialize = () => {
        throw new Error('serialize failed');
      };
      return instance;
    };
    const pending = boot(fixture.module, { hostOrigin: 'https://app.test', headless: true });
    await vi.waitFor(() => expect(bridge.onMessage).toBeTypeOf('function'));
    bridge.onMessage!(hello());

    await expect(pending).rejects.toThrow('serialize failed');
    expect(fixture.metrics.disposed).toBe(1);
    expect(bridge.close).toHaveBeenCalledOnce();
  });

  it('finishes SDK cleanup when the game disposer throws', async () => {
    const { runtime } = await start();
    expect(window.__gm).toBeDefined();
    runtime.instance.dispose = () => {
      throw new Error('dispose failed');
    };

    expect(() => runtime.dispose()).toThrow('dispose failed');
    expect(window.__gm).toBeUndefined();
    expect(bridge.close).toHaveBeenCalledOnce();
  });
});
