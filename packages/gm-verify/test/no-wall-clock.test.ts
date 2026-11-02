import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scanFile, scanRepo } from '../src/gates/no-wall-clock.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

describe('no-wall-clock-in-sim', () => {
  it('reports a global wall-clock call in simulation with its file and line', () => {
    const root = join(FIXTURES, 'sim-bad');

    expect(scanRepo(root)).toEqual([
      {
        file: 'src/sim/enemy.ts',
        line: 1,
        col: 33,
        what: 'Math.random',
      },
    ]);
  });

  it('allows wall-clock calls in render code and opted-out source', () => {
    expect(scanRepo(join(FIXTURES, 'sim-ok'))).toEqual([]);
    expect(scanRepo(join(FIXTURES, 'sim-bad'))).not.toContainEqual(
      expect.objectContaining({ file: 'src/render/particles.ts' }),
    );
  });

  it('matches only the global forms and permits deterministic Date construction', () => {
    const source = ['foo.Math.random();', 'new Date(0);', 'Date.now();', 'performance.now();', 'new Date();'].join(
      '\n',
    );

    expect(scanFile('src/sim/time.ts', source).map(({ what, line }) => ({ what, line }))).toEqual([
      { what: 'Date.now', line: 3 },
      { what: 'performance.now', line: 4 },
      { what: 'new Date', line: 5 },
    ]);
  });

  it('recognizes the opt-out only in the first three lines', () => {
    const source = readFileSync(join(FIXTURES, 'sim-bad/src/sim/enemy.ts'), 'utf8');
    expect(scanFile('src/sim/enemy.ts', `// first\n// gm: nondeterministic ok\n${source}`)).toEqual([]);
    expect(
      scanFile('src/sim/enemy.ts', `// first\n// second\n// third\n// gm: nondeterministic ok\n${source}`),
    ).toHaveLength(1);
    expect(scanFile('src/sim/enemy.ts', `const note = 'gm: nondeterministic ok';\n${source}`)).toHaveLength(1);
  });
});
