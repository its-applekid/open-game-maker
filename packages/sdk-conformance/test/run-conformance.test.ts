import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHECKS } from '../src/checks/index.js';
import { runConformance } from '../src/runner.js';

describe('runConformance', () => {
  it('reports a game that cannot load as C0 with every check unchecked, and drops a stale save', async () => {
    const gameDir = mkdtempSync(join(tmpdir(), 'gm-sdk-empty-'));
    const outDir = mkdtempSync(join(tmpdir(), 'gm-sdk-out-'));
    writeFileSync(join(outDir, 'save.json'), JSON.stringify({ saveSchemaVersion: 1, data: { stale: true } }));

    const report = await runConformance({ gameDir, outDir, runtimeDir: mkdtempSync(join(tmpdir(), 'gm-sdk-run-')) });

    expect(report.checks[0]).toMatchObject({ id: 'C0', status: 'fail' });
    expect(report.checks.slice(1)).toEqual(
      CHECKS.map((check) => ({ id: check.id, name: check.name, status: 'unchecked', detail: 'boot-failed' })),
    );
    expect(existsSync(join(outDir, 'save.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(outDir, 'conformance.json'), 'utf8'))).toMatchObject({ checks: report.checks });
  });
});
