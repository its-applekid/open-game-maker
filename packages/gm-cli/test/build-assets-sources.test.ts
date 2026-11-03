import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { SHEET, preparedLibrary } from './assets-fixture.js';
import { gm, tempDir } from './helpers.js';

const SHEET_FILE = 'packs/kenney-mini-dungeon/2.0/extracted/Spritesheets/character-sheet.png';
const DOOR = 't3:coin-hop/image/door';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function png(width: number, height: number, red: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: red, g: 40, b: 90, alpha: 1 } } })
    .png()
    .toBuffer();
}

/** The fixture library with a real PNG behind the sheet card, so `gm build assets` can encode it. */
async function libraryWithSheet(): Promise<string> {
  const root = preparedLibrary();
  writeFileSync(join(root, SHEET_FILE), await png(16, 8, 200));
  return root;
}

async function useSheet(cwd: string, root: string, ...extra: string[]): Promise<void> {
  const used = await gm(['assets', 'use', SHEET, ...extra, '--family', 'chunky-low-poly', '--pov', 'iso'], {
    cwd,
    env: { OGM_ASSETS_ROOT: root },
  });
  expect(used).toEqual({ code: 0, out: [], err: [] });
}

async function addBlobEntry(cwd: string, blobs: string): Promise<void> {
  const bytes = await png(4, 4, 10);
  mkdirSync(join(blobs, 'blobs/sha256'), { recursive: true });
  writeFileSync(join(blobs, 'blobs/sha256', sha256(bytes)), bytes);
  const path = join(cwd, 'assets.lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8')) as AssetsLock;
  lock.assets.push({
    id: DOOR,
    sha256: sha256(bytes),
    path: 'image/door.png',
    source: 'blob',
    license: 'LicenseRef-made-by-agent',
    rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
    credit: {
      pack: 'coin-hop:made',
      title: 'Made for this game',
      licenseSource: 'Created for this game',
      attribution: 'none required',
      source: { label: 'agent-generated' },
    },
    added: '2026-11-02',
  });
  lock.assets.sort((left, right) => left.id.localeCompare(right.id));
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

function manifest(cwd: string): string {
  return readFileSync(join(cwd, 'public/assets/manifest.json'), 'utf8');
}

describe('gm build assets sources', () => {
  // D-ASSETS-REFERENCE done-when: dropping the repo copies changes nothing the game loads.
  it('builds the same manifest from a library reference as from a vendored copy, with no assets directory', async () => {
    const root = await libraryWithSheet();
    const referenced = tempDir('gm-build-library-');
    const vendored = tempDir('gm-build-vendored-');
    await useSheet(referenced, root);
    await useSheet(vendored, root, '--vendor');

    const fromLibrary = await gm(['build', 'assets', '--no-cache'], {
      cwd: referenced,
      env: { OGM_ASSETS_ROOT: root },
    });
    const fromRepo = await gm(['build', 'assets', '--no-cache'], { cwd: vendored, env: { OGM_ASSETS_ROOT: root } });

    expect(fromLibrary.code).toBe(0);
    expect(fromRepo.code).toBe(0);
    expect(existsSync(join(referenced, 'assets'))).toBe(false);
    expect(existsSync(join(vendored, 'assets'))).toBe(true);
    expect(JSON.parse(manifest(referenced))).toMatchObject({ assets: { [SHEET]: expect.any(Object) } });
    expect(manifest(referenced)).toBe(manifest(vendored));
  });

  it('builds a tier-3 entry from the blob store by sha', async () => {
    const root = await libraryWithSheet();
    const blobs = tempDir('gm-build-blobs-');
    const cwd = tempDir('gm-build-blob-');
    await useSheet(cwd, root);
    await addBlobEntry(cwd, blobs);

    const result = await gm(['build', 'assets', '--no-cache'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root, OGM_BLOB_ROOT: blobs },
    });

    expect(result.code).toBe(0);
    expect(Object.keys((JSON.parse(manifest(cwd)) as { assets: object }).assets).sort()).toEqual([SHEET, DOOR].sort());
  });

  it('fails only the asset whose library file is missing, by id, with the command that restores it', async () => {
    const root = await libraryWithSheet();
    const blobs = tempDir('gm-build-blobs-');
    const cwd = tempDir('gm-build-missing-');
    await useSheet(cwd, root);
    await addBlobEntry(cwd, blobs);
    rmSync(join(root, SHEET_FILE));

    const result = await gm(['build', 'assets', '--json', '--no-cache'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root, OGM_BLOB_ROOT: blobs },
    });

    expect(result.code).toBe(1);
    const report = JSON.parse(result.out[0]!) as { failures: Array<{ id: string; message: string }> };
    expect(report.failures).toEqual([
      {
        id: SHEET,
        message:
          'Spritesheets/character-sheet.png is missing from the library source. Try: gm packs import <drop> --id kenney-mini-dungeon',
      },
    ]);
    /* The blob asset still built: its tier files are on disk even though the manifest is withheld. */
    expect(readdirSync(join(cwd, 'public/a')).some((name) => /^[0-9a-f]{64}\.webp$/.test(name))).toBe(true);
  });
});
