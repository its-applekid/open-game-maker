import { describe, expect, it } from 'vitest';

import { AssetsLockSchema, type AssetMetadata } from '../src/assets.js';
import { loadJson } from './helpers.js';
import { emittedValidator } from './json-schema.js';

type LockFixture = {
  assets: Array<{
    id: string;
    path: string;
    rights: { redistribution: string };
    meta?: AssetMetadata;
  }>;
};

function fixture(): LockFixture {
  return loadJson<LockFixture>('fixtures/assets.lock.json');
}

describe('assets lock contract', () => {
  it('accepts the canonical fixture in Zod and the emitted JSON Schema', () => {
    const doc = fixture();
    expect(AssetsLockSchema.safeParse(doc).success).toBe(true);
    expect(emittedValidator('assets-lock.v1')(doc)).toBe(true);
    expect(doc.assets[0]?.meta).toBeDefined();
  });

  it('rejects rights that prohibit redistribution', () => {
    const doc = fixture();
    doc.assets[0]!.rights.redistribution = 'none';
    expect(AssetsLockSchema.safeParse(doc).error?.issues.map((issue) => issue.path)).toContainEqual([
      'assets',
      0,
      'rights',
      'redistribution',
    ]);
  });

  it('rejects unsorted and duplicate ids', () => {
    const unsorted = fixture();
    unsorted.assets.reverse();
    expect(AssetsLockSchema.safeParse(unsorted).error?.issues.map((issue) => issue.path)).toContainEqual([
      'assets',
      1,
      'id',
    ]);

    const duplicate = fixture();
    duplicate.assets[1]!.id = duplicate.assets[0]!.id;
    expect(AssetsLockSchema.safeParse(duplicate).error?.issues.map((issue) => issue.path)).toContainEqual([
      'assets',
      1,
      'id',
    ]);
  });

  it.each(['../escape.glb', '/absolute.glb', 'node_modules/package/file.glb', '.gm/private.glb'])(
    'rejects unsafe repo path %s',
    (path) => {
      const doc = fixture();
      doc.assets[0]!.path = path;
      expect(AssetsLockSchema.safeParse(doc).error?.issues.map((issue) => issue.path)).toContainEqual([
        'assets',
        0,
        'path',
      ]);
    },
  );

  // The build trusts `source` to pick library, blob store or repo; an unknown one must not silently mean "repo".
  it('accepts library, blob and vendored sources with per-file shas and rejects anything else', () => {
    for (const source of ['library', 'blob', 'vendored']) {
      const doc = fixture() as LockFixture & { assets: Array<{ source?: string; files?: unknown }> };
      doc.assets[0]!.source = source;
      doc.assets[0]!.files = [{ path: 'Textures/colormap.png', sha256: 'a'.repeat(64) }];
      expect(AssetsLockSchema.safeParse(doc).success).toBe(true);
      expect(emittedValidator('assets-lock.v1')(doc)).toBe(true);
    }
    const unknown = fixture() as LockFixture & { assets: Array<{ source?: string }> };
    unknown.assets[0]!.source = 'cdn';
    expect(AssetsLockSchema.safeParse(unknown).success).toBe(false);
    expect(emittedValidator('assets-lock.v1')(unknown)).toBe(false);
    const tierThreeLibrary = fixture() as LockFixture & { assets: Array<{ source?: string }> };
    tierThreeLibrary.assets[0]!.id = 't3:coin-hop/model/door';
    tierThreeLibrary.assets[0]!.source = 'library';
    expect(AssetsLockSchema.safeParse(tierThreeLibrary).error?.issues.map((issue) => issue.path)).toContainEqual([
      'assets',
      0,
      'source',
    ]);
    const badFile = fixture() as LockFixture & { assets: Array<{ files?: unknown }> };
    badFile.assets[0]!.files = [{ path: 'Textures/colormap.png', sha256: 'not-a-sha' }];
    expect(AssetsLockSchema.safeParse(badFile).success).toBe(false);
  });
});
