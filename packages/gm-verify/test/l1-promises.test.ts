import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runL1, runPromiseSpecs } from '../src/gates/l1-smoke.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

describe('L1 promise specs', () => {
  it('passes when no promise specs exist', () => {
    expect(runPromiseSpecs(join(FIXTURES, 'sim-ok'))).toEqual({
      id: 'promises',
      ok: true,
      detail: 'no promise specs',
    });
  });

  it('fails and names a failing promise spec', () => {
    expect(runPromiseSpecs(join(FIXTURES, 'promises-bad'))).toEqual(
      expect.objectContaining({
        id: 'promises',
        ok: false,
        file: 'promises/fail.spec.ts',
      }),
    );
  }, 30_000);

  it('fails closed when the promise directory cannot be scanned', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-promises-unreadable-'));
    writeFileSync(join(root, 'promises'), 'not a directory');

    expect(runPromiseSpecs(root)).toEqual({
      id: 'promises',
      ok: false,
      detail: 'unavailable: promises directory',
    });
  });

  it('refuses a non-loopback browser target before launch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-l1-remote-'));
    const result = await runL1(root, { url: 'https://example.com/', outDir: join(root, 'shots') });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({ id: 'boot', ok: false, detail: 'unavailable: URL is not loopback' });
    expect(result.report).toBeUndefined();
  });

  it('refuses a zero-tick smoke instead of returning a vacuous pass', async () => {
    const result = await runL1(FIXTURES, { ticks: 0 });

    expect(result).toMatchObject({
      gate: 'L1',
      ok: false,
      checks: [{ id: 'ticks', ok: false, detail: 'ticks must be a positive whole number' }],
    });
  });
});
