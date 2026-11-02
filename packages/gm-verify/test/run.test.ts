import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runVerify } from '../src/run.js';

describe('runVerify failure envelope', () => {
  it('writes an error report and an end event when the host semaphore cannot be acquired', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-run-failure-'));
    const outDir = join(root, 'shots');
    const eventsFile = join(root, 'events.jsonl');
    const result = await runVerify({
      url: 'http://127.0.0.1:1/',
      outDir,
      viewport: 'phone',
      tier: 'mobile',
      software: true,
      eventsFile,
      slots: { runtimeDir: root, slots: 0, waitMs: 1, pollMs: 1 },
    });

    expect(result.report.verdict).toBe('error');
    expect(result.report.error).toMatch(/no free capture slot/);
    expect(existsSync(result.reportPath)).toBe(true);
    expect(
      readFileSync(eventsFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).phase),
    ).toEqual(['start', 'end']);
  });
});
