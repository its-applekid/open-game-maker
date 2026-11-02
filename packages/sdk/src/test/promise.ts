import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

export type PromiseReplay = {
  seed: number;
  keyframe: { tick: number; state: unknown };
  actions: { tick: number; action: string; phase: 'down' | 'up' }[];
  expectedError?: string;
};

export type PromiseReplayResult = {
  class: 'reproduces_with_error' | 'reproduces_no_error' | 'not_reproducible';
  errorsSeen: string[];
};

declare global {
  // Populated by gm test's private, temporary Vitest setup module.
  var __GM_PROMISE_RESULTS__: Record<string, PromiseReplayResult> | undefined;
}

type Register = (name: string, check: () => void) => unknown;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function promiseKey(replay: PromiseReplay): string {
  return createHash('sha256').update(canonical(replay)).digest('hex');
}

export function promiseTest(replay: PromiseReplay, register: Register = it): void {
  register('keeps the reported crash fixed', () => {
    const result = globalThis.__GM_PROMISE_RESULTS__?.[promiseKey(replay)];
    expect(result, 'gm test provided no replay result for this promise').toBeDefined();
    expect(result?.class, `reported crash still reproduces: ${result?.errorsSeen[0] ?? 'unknown error'}`).not.toBe(
      'reproduces_with_error',
    );
  });
}
