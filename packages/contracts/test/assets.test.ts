import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { assetManifestSchema, assetsLockSchema } from '../src/assets.js';
import { loadJson } from './helpers.js';
import { emittedValidator } from './json-schema.js';

type Manifest = { assets: Record<string, { file: Record<string, string> }> };

describe('assets contract', () => {
  it('accepts the golden manifest in both Zod and the emitted JSON Schema', () => {
    const doc = loadJson('fixtures/assets.v1.json');
    expect(assetManifestSchema.safeParse(doc).success).toBe(true);
    expect(emittedValidator('assets.v1')(doc)).toBe(true);
  });

  // The loader never derives file names, so every tier entry must name a real file.
  it('rejects an asset tier that names a file missing from files, at that asset', () => {
    const doc = loadJson<Manifest>('fixtures/assets.v1.json');
    doc.assets['monsters/yeti']!.file.mobile = 'monster-yeti.mobile.missing.glb';
    expect(assetManifestSchema.safeParse(doc).error?.issues.map((issue) => issue.path)).toEqual([
      ['assets', 'monsters/yeti', 'file', 'mobile'],
    ]);
  });

  it('rejects an unknown tier', () => {
    const doc = loadJson<Manifest>('fixtures/assets.v1.json');
    doc.assets['castle/tower-base']!.file = { ultra: 'kit-castle.3f9a1c.glb' };
    expect(assetManifestSchema.safeParse(doc).success).toBe(false);
  });

  it('accepts the golden lockfile with the public and private tier-1 examples', () => {
    const doc = loadJson<{ assets: { id: string }[] }>('fixtures/assets-lock.v1.json');
    expect(assetsLockSchema.parse(doc).assets.map((asset) => asset.id.slice(0, 3))).toEqual(['t1:', 't1:']);
    expect(emittedValidator('assets-lock.v1')(doc)).toBe(true);
  });

  it('rejects a lock entry without a sha256 digest', () => {
    const doc = loadJson<{ assets: { sha256: string }[] }>('fixtures/assets-lock.v1.json');
    doc.assets[0]!.sha256 = 'abc';
    expect(assetsLockSchema.safeParse(doc).error?.issues[0]?.path).toEqual(['assets', 0, 'sha256']);
  });

  it('keeps the OGM-062 lockfile marker above the lock schema', () => {
    const source = readFileSync(new URL('../src/assets.ts', import.meta.url), 'utf8');
    const marker = source.indexOf('// ---- lockfile (OGM-062 edits below this line) ----');
    expect(marker).toBeGreaterThan(source.indexOf('export const assetManifestSchema'));
    expect(marker).toBeLessThan(source.indexOf('export const assetsLockSchema'));
  });
});
