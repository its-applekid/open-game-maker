import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from '@ogm/config';
import { describe, expect, it } from 'vitest';

/* The built runner: it serves the bundled host page from dist/. */
import { runConformance } from '../dist/runner.js';

/* This host runs the iGPU flags; CI and GM_VERIFY_SOFTWARE_GL=1 run SwiftShader. */
const software =
  loadEnv('gm', { GM_VERIFY_SOFTWARE_GL: { kind: 'bool', required: false } }).GM_VERIFY_SOFTWARE_GL === true;
const templates = fileURLToPath(new URL('../../../templates/', import.meta.url));

async function run(
  template: string,
  previousDir?: string,
  outDir = mkdtempSync(join(tmpdir(), `gm-sdk-${template}-`)),
) {
  return runConformance({ gameDir: join(templates, template), outDir, previousDir, softwareGl: software });
}

/* Renames the first control in a run's recorded manifest, with no alias. */
function renameFirstControl(outDir: string): void {
  const manifestPath = join(outDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { controls: { id: string }[] };
  manifest.controls[0]!.id = 'player.walk';
  writeFileSync(manifestPath, JSON.stringify(manifest));
}

describe.each(['game-3d', 'game-2d'])('gm-sdk check %s', (template) => {
  it('reports eleven checks, none failing, with the renderer it really ran on', async () => {
    const report = await run(template);
    expect(report.checks.map((check) => check.id)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
      'C7',
      'C8',
      'C9',
      'C10',
      'C11',
    ]);
    expect(report.checks.filter((check) => check.status === 'fail')).toEqual([]);
    /* Without a previous build or save fixture only C4, C5, C9, C10 (and C11 with no palette) may be unchecked. */
    const passed = report.checks.filter((check) => check.status === 'pass').map((check) => check.id);
    expect(passed).toEqual(expect.arrayContaining(['C1', 'C2', 'C3', 'C6', 'C7', 'C8']));
    if (software) expect(report.gl).toBe('software');
    else expect(report.renderer).toMatch(/ANGLE \(Intel/);
    expect(report.stills).toHaveLength(2);
  });
});

describe('gm-sdk check --previous', () => {
  it('fails C9 when the previous build had a control the game renamed without an alias', async () => {
    const first = await run('game-2d');
    renameFirstControl(first.outDir);

    const report = await run('game-2d', first.outDir);
    const c9 = report.checks.find((check) => check.id === 'C9');
    expect(c9).toMatchObject({ status: 'fail', detail: 'previous control player.walk has no alias or retirement' });
    expect(report.checks.find((check) => check.id === 'C4')?.status).toBe('pass');
    expect(report.checks.find((check) => check.id === 'C10')?.status).toBe('pass');
  });

  it('reads the previous build before rewriting it when --previous is the same directory as --out', async () => {
    const first = await run('game-2d');
    renameFirstControl(first.outDir);

    const report = await run('game-2d', first.outDir, first.outDir);
    expect(report.checks.find((check) => check.id === 'C9')?.status).toBe('fail');
    expect(report.checks.find((check) => check.id === 'C4')?.status).toBe('pass');
  });
});
