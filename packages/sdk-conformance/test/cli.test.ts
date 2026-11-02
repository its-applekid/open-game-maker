import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { main, USAGE } from '../src/cli.js';
import type { RunOptions } from '../src/runner.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/conformance.report.v1.json', import.meta.url), 'utf8'));

function io(checks = fixture.checks) {
  const out: string[] = [];
  const err: string[] = [];
  const runs: RunOptions[] = [];
  return {
    out,
    err,
    runs,
    io: {
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
      env: {},
      run: async (options: RunOptions) => {
        runs.push(options);
        return { ...fixture, checks, outDir: '/out' };
      },
    },
  };
}

describe('gm-sdk check', () => {
  it('exits 2 with one usage line when the game dir is missing', async () => {
    const t = io();
    expect(await main(['check'], t.io)).toBe(2);
    expect(t.err).toEqual([USAGE]);
    expect(t.runs).toEqual([]);
  });

  it('exits 0 when every check passed or is unchecked, and passes the flags through', async () => {
    const t = io();
    const code = await main(['check', 'templates/game-2d', '--previous', 'p', '--out', 'o', '--software-gl'], t.io);
    expect(code).toBe(0);
    expect(t.runs[0]).toMatchObject({ gameDir: 'templates/game-2d', previousDir: 'p', outDir: 'o', softwareGl: true });
    expect(t.out.at(-1)).toBe('report: /out/conformance.json');
  });

  it('exits 1 on any fail', async () => {
    const t = io([{ id: 'C6', name: 'pause-halts', status: 'fail', detail: 'tick moved' }]);
    expect(await main(['check', 'g'], t.io)).toBe(1);
  });

  it('takes SwiftShader from GM_VERIFY_SOFTWARE_GL=1', async () => {
    const t = io();
    await main(['check', 'g', '--json'], { ...t.io, env: { GM_VERIFY_SOFTWARE_GL: '1' } });
    expect(t.runs[0]!.softwareGl).toBe(true);
    expect(JSON.parse(t.out[0]!).checks).toHaveLength(11);
  });
});
