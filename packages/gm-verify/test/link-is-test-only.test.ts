import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { scanPackageImports, scanWallClock } from '../src/gates/test-only.js';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const WEB_SRC = fileURLToPath(new URL('../../../apps/web/src/', import.meta.url));
const scratchDirs: string[] = [];

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gm-test-only-'));
  scratchDirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the simulator stays test-only', () => {
  it('is imported by no product file under apps/web/src', () => {
    expect(scanPackageImports(WEB_SRC, '@ogm/gm-verify')).toEqual([]);
  });

  it('reports a product file that imports it, with the file and line', () => {
    const root = scratch({
      'net/diagnostics/bad.ts': "import { summaryLines } from '@ogm/gm-verify';\nexport const x = summaryLines;\n",
      'net/clean.ts': "import { join } from 'node:path';\nexport const y = join;\n",
    });

    expect(scanPackageImports(root, '@ogm/gm-verify')).toEqual([
      { file: 'net/diagnostics/bad.ts', line: 1, specifier: '@ogm/gm-verify' },
    ]);
  });

  it('catches every import form, including subpaths, dynamic imports and require', () => {
    const root = scratch({
      'a.ts': "import type { SeatMetrics } from '@ogm/gm-verify/report';\nexport type A = SeatMetrics;\n",
      'b.ts': "export const load = async () => (await import('@ogm/gm-verify')).writeReport;\n",
      'c.ts': "const link = require('@ogm/gm-verify/link');\nexport default link;\n",
      'd.ts': "export * from '@ogm/gm-verify/schemas/verify-report.v1.json';\n",
    });

    expect(scanPackageImports(root, '@ogm/gm-verify').map(({ file, specifier }) => ({ file, specifier }))).toEqual([
      { file: 'a.ts', specifier: '@ogm/gm-verify/report' },
      { file: 'b.ts', specifier: '@ogm/gm-verify' },
      { file: 'c.ts', specifier: '@ogm/gm-verify/link' },
      { file: 'd.ts', specifier: '@ogm/gm-verify/schemas/verify-report.v1.json' },
    ]);
  });

  it('lets a test file import the scenario it exercises', () => {
    const root = scratch({
      'scenarios/multi-client.test.ts':
        "import { runMultiClient } from '@ogm/gm-verify';\nexport const x = runMultiClient;\n",
    });

    expect(scanPackageImports(root, '@ogm/gm-verify')).toEqual([]);
  });

  it('keeps every wall-clock and global-random read out of src/link', () => {
    expect(scanWallClock(join(PACKAGE, 'src', 'link'), PACKAGE)).toEqual([]);
  });

  it('reports a wall-clock read in the simulator when one is added', () => {
    const root = scratch({ 'src/link/bad.ts': 'export const now = () => Date.now();\n' });

    expect(scanWallClock(join(root, 'src', 'link'), root)).toEqual([
      { file: 'src/link/bad.ts', line: 1, col: 26, what: 'Date.now' },
    ]);
  });
});
