import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('SDK package exports', () => {
  it('publishes achievements and analytics feature entry points', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };

    expect(manifest.exports['./achievements']).toEqual({
      types: './dist/achievements.d.ts',
      import: './dist/achievements.js',
    });
    expect(manifest.exports['./analytics']).toEqual({
      types: './dist/analytics.d.ts',
      import: './dist/analytics.js',
    });
  });

  it('exposes the net area through the root namespace', () => {
    expect(readFileSync('src/index.ts', 'utf8')).toContain("export * as net from './net/index.js';");
  });
});
