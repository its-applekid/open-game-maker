import { describe, expect, it, vi } from 'vitest';

import { promiseKey, promiseTest, type PromiseReplay } from './promise.js';

const replay: PromiseReplay = {
  seed: 7,
  keyframe: { tick: 0, state: { alive: true } },
  actions: [{ tick: 11, action: 'crash', phase: 'down' }],
  expectedError: "TypeError: Cannot read properties of undefined (reading 'speed')",
};

describe('promiseTest', () => {
  it('uses a stable content key independent of object key order', () => {
    const reordered = {
      expectedError: replay.expectedError,
      actions: replay.actions,
      keyframe: replay.keyframe,
      seed: replay.seed,
    };

    expect(promiseKey(reordered)).toBe(promiseKey(replay));
  });

  it('registers a passing test after the matching crash disappears', async () => {
    globalThis.__GM_PROMISE_RESULTS__ = {
      [promiseKey(replay)]: { class: 'not_reproducible', errorsSeen: [] },
    };
    const register = vi.fn((_name: string, check: () => void) => check());

    promiseTest(replay, register);

    expect(register).toHaveBeenCalledOnce();
  });

  it('keeps the promise red while the matching crash reproduces', () => {
    globalThis.__GM_PROMISE_RESULTS__ = {
      [promiseKey(replay)]: {
        class: 'reproduces_with_error',
        errorsSeen: ["TypeError: Cannot read properties of undefined (reading 'speed')"],
      },
    };

    expect(() => promiseTest(replay, (_name, check) => check())).toThrow(/reported crash still reproduces/i);
  });

  it('fails closed when gm test did not provide a replay result', () => {
    globalThis.__GM_PROMISE_RESULTS__ = {};

    expect(() => promiseTest(replay, (_name, check) => check())).toThrow(/no replay result/i);
  });
});
