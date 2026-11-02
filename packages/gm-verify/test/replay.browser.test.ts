import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { replay, type ReplayBundle } from '../src/replay.js';

const STUB = fileURLToPath(new URL('../fixtures/stub-game/', import.meta.url));
const SOFTWARE = process.env.GM_VERIFY_SOFTWARE_GL === '1';

function bundle(overrides: Partial<ReplayBundle> = {}): ReplayBundle {
  return {
    seed: 7,
    keyframe: { tick: 0, state: { t: 0, lastAction: null, alive: true } },
    actions: [{ tick: 11, action: 'jump', phase: 'down' }],
    errors: [],
    probes: { tick: 131, alive: true, lastAction: 'jump' },
    ...overrides,
  };
}

function options(wallClockMs = 60_000) {
  return {
    serveDir: STUB,
    outDir: mkdtempSync(join(tmpdir(), 'gm-replay-')),
    wallClockMs,
    software: SOFTWARE,
  };
}

describe('deterministic report replay', () => {
  it('classifies a matching planted crash and writes only the promise-safe replay fields', async () => {
    const result = await replay(
      bundle({
        actions: [{ tick: 11, action: 'crash', phase: 'down' }],
        errors: [{ message: "TypeError: Cannot read properties of undefined (reading 'speed')" }],
      }),
      options(),
    );

    expect(result.class).toBe('reproduces_with_error');
    expect(result.errorsSeen[0]).toContain('Cannot read properties of undefined');
    expect(result.finalState).toMatchObject({ alive: true, lastAction: 'crash' });
    expect(result.finalProbes).toMatchObject({ alive: true, lastAction: 'crash' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(readFileSync(result.scriptPath, 'utf8'))).toEqual({
      seed: 7,
      keyframe: { tick: 0, state: { t: 0, lastAction: null, alive: true } },
      actions: [{ tick: 11, action: 'crash', phase: 'down' }],
      expectedError: "TypeError: Cannot read properties of undefined (reading 'speed')",
    });
  });

  it.each([
    ['no_actions', { actions: [] }],
    ['no_keyframe', { keyframe: undefined }],
  ] as const)('refuses an incomplete bundle with %s', async (reason, overrides) => {
    const result = await replay(bundle(overrides), options());

    expect(result).toMatchObject({
      class: 'not_reproducible',
      reason,
      errorsSeen: [],
      finalState: null,
      finalProbes: {},
    });
  });

  it('classifies a matching replay without an error as not reproducible', async () => {
    const result = await replay(bundle(), options());

    expect(result).toMatchObject({ class: 'not_reproducible', errorsSeen: [] });
  });

  it('names state mismatch when final probes drift without an error', async () => {
    const result = await replay(bundle({ probes: { tick: 131, alive: false, lastAction: 'jump' } }), options());

    expect(result).toMatchObject({ class: 'reproduces_no_error', reason: 'state_mismatch', errorsSeen: [] });
  });

  it('returns a bounded timeout result and still writes the sanitized replay', async () => {
    const result = await replay(bundle(), options(1));

    expect(result).toMatchObject({ class: 'not_reproducible', reason: 'timeout' });
    expect(result.scriptPath).toContain('replay.json');
  });
});
