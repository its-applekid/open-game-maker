import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('deterministic SDK source', () => {
  it('does not read ambient random values or wall-clock time', () => {
    const forbidden = new RegExp(['Math', 'random|Date', 'now'].join('\\.'));
    const productionFiles = ['core', 'fx', 'nav', 'proc', 'test', 'three']
      .map((directory) => join(sourceRoot, directory))
      .flatMap(typescriptFiles)
      .filter((path) => !path.endsWith('.test.ts'));
    const offenders = productionFiles.filter((path) => forbidden.test(readFileSync(path, 'utf8')));

    expect(productionFiles.some((path) => path.endsWith('/core/clock.ts'))).toBe(true);
    expect(offenders).toEqual([]);
  });
});
