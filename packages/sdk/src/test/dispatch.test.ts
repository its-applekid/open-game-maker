import type { Envelope, GmTestHooks } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { dispatchTest } from './dispatch.js';

const hooks = (overrides: Partial<GmTestHooks> = {}): GmTestHooks => ({
  ready: true,
  marks: [],
  advanceTime: vi.fn(),
  renderAt: vi.fn(),
  renderGameToText: vi.fn(() => ({ coords: 'grid', tick: 0, mode: 'play' as const, state: {}, players: [] })),
  renderInfo: vi.fn(() => ({ calls: 0, triangles: 0, frameMs: 0, textureBytes: 0, backend: 'test' })),
  hitTest: vi.fn(() => false),
  setSeed: vi.fn(),
  inject: vi.fn(),
  probes: vi.fn(() => ({})),
  events: vi.fn(() => []),
  seed: vi.fn(() => 1),
  ...overrides,
});

const request = (t: string, payload: unknown): Envelope<string, unknown> => ({ v: 1, id: 'request-1', t, payload });

describe('dispatchTest', () => {
  it.each([
    ['test.advanceTime', { ms: 10 }, 'advanceTime', [10]],
    ['test.renderAt', { ms: 20 }, 'renderAt', [20]],
    ['test.renderGameToText', {}, 'renderGameToText', []],
    ['test.renderInfo', {}, 'renderInfo', []],
    ['test.hitTest', { nx: 0.5, ny: 0.5 }, 'hitTest', [0.5, 0.5]],
    ['test.setSeed', { seed: 7 }, 'setSeed', [7]],
    ['test.seed', {}, 'seed', []],
    [
      'test.inject',
      { playerIndex: 0, tick: 1, source: 'keyboard', actions: {} },
      'inject',
      [{ playerIndex: 0, tick: 1, source: 'keyboard', actions: {} }],
    ],
    ['test.probes', {}, 'probes', []],
    ['test.events', { since: 3 }, 'events', [3]],
  ] as const)('routes %s through %s', (type, payload, method, args) => {
    const send = vi.fn();
    const current = hooks();

    expect(dispatchTest(request(type, payload), current, send)).toBe(true);

    expect(vi.mocked(current[method])).toHaveBeenCalledWith(...args);
    expect(send).toHaveBeenCalledWith('test.result', expect.objectContaining({ ok: true }), 'request-1');
  });

  it('contains hook errors in a failed result', () => {
    const send = vi.fn();

    dispatchTest(
      request('test.renderInfo', {}),
      hooks({
        renderInfo: () => {
          throw new Error('renderer failed');
        },
      }),
      send,
    );

    expect(send).toHaveBeenCalledWith('test.result', { ok: false, error: 'Error: renderer failed' }, 'request-1');
  });

  it('leaves non-test envelopes for the runtime dispatcher', () => {
    expect(dispatchTest(request('viewport', {}), hooks(), vi.fn())).toBe(false);
  });
});
