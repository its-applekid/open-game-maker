import type { GameManifest } from '@ogm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPhaserGame } from './game.js';
import type { Runtime } from '../core/runtime.js';

const mock = vi.hoisted(() => {
  const configs: unknown[] = [];
  const games: MockGame[] = [];

  class MockGame {
    readonly loop = { sleep: vi.fn(), step: vi.fn(), wake: vi.fn() };
    readonly renderer = { type: 1 };
    readonly scale = { resize: vi.fn() };
    readonly events = {
      once: vi.fn((_event: string, callback: () => void) => queueMicrotask(callback)),
    };
    readonly scene = { pause: vi.fn(), resume: vi.fn(), getScene: vi.fn() };
    readonly destroy = vi.fn();
    readonly isBooted = false;

    constructor(config: unknown) {
      configs.push(config);
      games.push(this);
    }
  }

  return { configs, games, MockGame };
});

vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    WEBGL: 1,
    CANVAS: 2,
    Core: { Events: { READY: 'ready' } },
    Scale: { FIT: 10, EXPAND: 11, CENTER_BOTH: 12 },
    Game: mock.MockGame,
  },
}));

const presentation = (fit: GameManifest['presentation']['fit']): GameManifest['presentation'] => ({
  orientation: 'landscape',
  minLogical: { w: 640, h: 360 },
  fit,
});

function runtime(build: Runtime<unknown, unknown>['build'] = 'test') {
  const frameListeners: ((dt: number) => void)[] = [];
  const viewportListeners: ((viewport: { w: number; h: number }) => void)[] = [];
  return {
    build,
    clock: { tick: 3, dt: 1 / 60 },
    host: {
      viewport: {
        current: () => ({ w: 1280, h: 720, dpr: 2 }),
        onChange: (listener: (viewport: { w: number; h: number }) => void) => {
          viewportListeners.push(listener);
          return () => undefined;
        },
      },
    },
    onFrame: (listener: (dt: number) => void) => {
      frameListeners.push(listener);
      return () => undefined;
    },
    frameListeners,
    viewportListeners,
  };
}

describe('createPhaserGame', () => {
  beforeEach(() => {
    mock.configs.length = 0;
    mock.games.length = 0;
  });

  it.each([
    ['fixed', 10],
    ['responsive', 11],
  ] as const)('maps %s presentation onto the Phaser scale manager', async (fit, mode) => {
    await createPhaserGame(runtime() as unknown as Runtime<unknown, unknown>, {
      parent: document.body,
      presentation: presentation(fit),
      scenes: [],
    });

    expect(mock.configs[0]).toMatchObject({
      type: 0,
      parent: document.body,
      width: 640,
      height: 360,
      scale: { mode, autoCenter: 12, width: 640, height: 360 },
    });
  });

  it('sleeps the autonomous loop and renders once for each SDK frame', async () => {
    const rt = runtime();
    const wrapper = await createPhaserGame(rt as unknown as Runtime<unknown, unknown>, {
      parent: document.body,
      presentation: presentation('fixed'),
      scenes: [],
    });
    const game = mock.games[0]!;

    expect(game.loop.sleep).toHaveBeenCalledOnce();
    expect(rt.frameListeners).toHaveLength(1);
    rt.frameListeners[0]!(1 / 60);
    expect(game.loop.step).toHaveBeenCalledOnce();
    expect(wrapper.info()).toMatchObject({ calls: 1, backend: 'webgl' });
  });

  it('resizes a responsive game from host viewport messages', async () => {
    const rt = runtime('draft');
    await createPhaserGame(rt as unknown as Runtime<unknown, unknown>, {
      parent: document.body,
      presentation: presentation('responsive'),
      scenes: [],
    });

    rt.viewportListeners[0]!({ w: 960, h: 540 });
    expect(mock.games[0]!.scale.resize).toHaveBeenCalledWith(960, 540);
  });
});
