import { describe, expect, it } from 'vitest';

import { unifiedDiff } from '../src/diff.js';

describe('unifiedDiff', () => {
  it('is empty when nothing changed', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n', { path: 'package.json' })).toBe('');
  });

  it('shows a changed line with its context', () => {
    const diff = unifiedDiff(
      '{\n  "a": "file:../../vendor/x.tgz",\n  "b": 1\n}\n',
      '{\n  "a": "0.0.0-core.abc",\n  "b": 1\n}\n',
      {
        path: 'games/x/package.json',
      },
    );
    expect(diff).toContain('--- a/games/x/package.json');
    expect(diff).toContain('+++ b/games/x/package.json');
    expect(diff).toContain('-  "a": "file:../../vendor/x.tgz",');
    expect(diff).toContain('+  "a": "0.0.0-core.abc",');
  });

  it('splits distant changes into separate hunks', () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
    const after = before.replace('line 0', 'line zero').replace('line 19', 'line nineteen');
    const diff = unifiedDiff(`${before}\n`, `${after}\n`, { path: '.npmrc', context: 1 });
    expect(diff.match(/^@@ /gm)?.length).toBe(2);
  });

  it('reports a file whose lines were only added', () => {
    const diff = unifiedDiff('', '@owner:registry=https://npm.pkg.github.com\n', { path: '.npmrc' });
    expect(diff).toContain('+@owner:registry=https://npm.pkg.github.com');
  });
});
