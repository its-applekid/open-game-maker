import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { vendorPath } from '../src/commands/assets/vendor.js';
import { ORC, SYNTY, WALL, preparedLibrary, useOrc } from './assets-fixture.js';
import { gm, tempDir } from './helpers.js';

const copyFailure = vi.hoisted(() => ({ sourceSuffix: null as string | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    async copyFile(...args: Parameters<typeof actual.copyFile>) {
      if (copyFailure.sourceSuffix !== null && String(args[0]).endsWith(copyFailure.sourceSuffix)) {
        copyFailure.sourceSuffix = null;
        throw Object.assign(new Error('injected copy failure'), { code: 'EIO' });
      }
      return actual.copyFile(...args);
    },
  };
});

function lock(cwd: string): AssetsLock {
  return JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
}

describe('gm assets vendor', () => {
  afterEach(() => {
    copyFailure.sourceSuffix = null;
  });

  it('copies a locked CC0 asset and its companions into the repo and updates the lock', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await gm(['assets', 'use', WALL, '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });

    const result = await gm(['assets', 'vendor', WALL], { cwd, env: { OGM_ASSETS_ROOT: root } });

    expect(result).toEqual({ code: 0, out: [], err: [] });
    expect(readFileSync(join(cwd, 'assets/kenney-mini-dungeon/Models/GLB format/wall.glb'), 'utf8')).toBe('wall-bytes');
    expect(readFileSync(join(cwd, 'assets/kenney-mini-dungeon/Models/GLB format/Textures/colormap.png'), 'utf8')).toBe(
      'map-bytes',
    );
    expect(lock(cwd).assets[0]).toMatchObject({
      id: WALL,
      source: 'vendored',
      path: 'assets/kenney-mini-dungeon/Models/GLB format/wall.glb',
      files: [{ path: 'assets/kenney-mini-dungeon/Models/GLB format/Textures/colormap.png' }],
    });
  });

  it('refuses a Synty entry by id at vendor time without copying it', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    const used = await gm(['assets', 'use', SYNTY, '--family', 'detailed-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(used.code).toBe(0);

    const result = await gm(['assets', 'vendor', SYNTY], { cwd, env: { OGM_ASSETS_ROOT: root } });

    expect(result.code).toBe(2);
    expect(result.err).toEqual([expect.stringContaining(`${SYNTY}  no-redistribution`)]);
    expect(existsSync(join(cwd, 'assets'))).toBe(false);
    expect(lock(cwd).assets[0]).toMatchObject({ id: SYNTY, source: 'library' });
  });

  it('vendors eligible ids in a mixed batch and leaves each refused id as a reference', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    await gm(['assets', 'use', SYNTY, '--exception', 'intentional contrast'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });

    const result = await gm(['assets', 'vendor', ORC, SYNTY], { cwd, env: { OGM_ASSETS_ROOT: root } });

    expect(result.code).toBe(2);
    expect(result.err).toEqual([expect.stringContaining(`${SYNTY}  no-redistribution`)]);
    expect(lock(cwd).assets).toEqual([
      expect.objectContaining({ id: ORC, source: 'vendored' }),
      expect.objectContaining({ id: SYNTY, source: 'library' }),
    ]);
  });

  it('names a mismatched locked asset and leaves its lock as a reference', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    writeFileSync(join(root, 'packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb'), 'changed');

    const result = await gm(['assets', 'vendor', ORC], { cwd, env: { OGM_ASSETS_ROOT: root } });

    expect(result.code).toBe(2);
    expect(result.err).toEqual([expect.stringMatching(new RegExp(`^${ORC}  sha-mismatch  `, 'u'))]);
    expect(existsSync(join(cwd, 'assets'))).toBe(false);
    expect(lock(cwd).assets[0]).toMatchObject({ id: ORC, source: 'library' });
  });

  it('refuses an assets symlink without creating directories through it', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    const outside = tempDir();
    await useOrc(cwd, root);
    symlinkSync(outside, join(cwd, 'assets'));

    const result = await gm(['assets', 'vendor', ORC], { cwd, env: { OGM_ASSETS_ROOT: root } });

    expect(result.code).toBe(2);
    expect(result.err).toEqual([expect.stringContaining(`${ORC}  unsafe-destination`)]);
    expect(existsSync(join(outside, 'kenney-mini-dungeon'))).toBe(false);
    expect(lock(cwd).assets[0]).toMatchObject({ id: ORC, source: 'library' });
  });

  it('rejects a blob companion path that escapes its collection before creating a destination', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const malicious = lock(cwd);
    const entry = malicious.assets[0]!;
    entry.source = 'blob';
    entry.files = [{ path: '../../outside.png', sha256: 'a'.repeat(64) }];
    expect(vendorPath(entry, entry.files[0]!.path)).toBeNull();
    writeFileSync(join(cwd, 'assets.lock.json'), `${JSON.stringify(malicious, null, 2)}\n`);

    await expect(gm(['assets', 'vendor', ORC], { cwd })).rejects.toThrow('assets.lock.json is invalid');

    expect(existsSync(join(cwd, 'outside.png'))).toBe(false);
    expect(existsSync(join(cwd, 'assets'))).toBe(false);
  });

  it('leaves final paths untouched when staging fails and remains retryable', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await gm(['assets', 'use', WALL, '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    copyFailure.sourceSuffix = 'colormap.png';

    await expect(gm(['assets', 'vendor', WALL], { cwd, env: { OGM_ASSETS_ROOT: root } })).rejects.toThrow(
      'injected copy failure',
    );

    expect(existsSync(join(cwd, 'assets/kenney-mini-dungeon/Models/GLB format/wall.glb'))).toBe(false);
    expect(existsSync(join(cwd, 'assets/kenney-mini-dungeon/Models/GLB format/Textures/colormap.png'))).toBe(false);
    expect(lock(cwd).assets[0]).toMatchObject({ id: WALL, source: 'library' });

    const retried = await gm(['assets', 'vendor', WALL], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(retried).toEqual({ code: 0, out: [], err: [] });
    expect(lock(cwd).assets[0]).toMatchObject({ id: WALL, source: 'vendored' });
  });
});
