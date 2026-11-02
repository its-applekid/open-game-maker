import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';

import { FsBlobStore } from '@ogm/blob-store';
import type { AssetsLock, LockEntry } from '@ogm/contracts';

import { ZipReader } from '../src/assets-export/zip-read.js';
import { ZipWriter } from '../src/assets-export/zip-write.js';
import { writeLock } from '../src/lock.js';
import { ORC, SYNTY, preparedLibrary } from './assets-fixture.js';
import { gm, library, tempDir } from './helpers.js';

const LOOP = 't1:kenney-music-loops/loops/infinite-descent@1.1';
const LOOP_FILE = 'packs/kenney-music-loops/1.1/extracted/Loops/Infinite Descent.ogg';
const ORC_ZIP = 'library/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb';
const LOOP_ZIP = 'library/kenney-music-loops/1.1/extracted/Loops/Infinite Descent.ogg';
const SYNTY_ZIP = 'library/synty-polygon-goblin-war-camp/v3/extracted/FBX/Buildings/SM_Bld_Prop_Torch_01.fbx';
const FREE = {
  uses: ['in-game' as const],
  audience: 'public' as const,
  redistribution: 'free' as const,
  attribution: null,
};

function sha(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function entry(id: string, content: string, rights: Partial<LockEntry['rights']> = {}): LockEntry {
  return {
    id,
    sha256: sha(content),
    path: `assets/${id.replace(/[^a-z0-9]+/g, '-')}.bin`,
    license: rights.redistribution === 'in-build' ? 'LicenseRef-synty-personal' : 'CC0-1.0',
    rights: { ...FREE, ...rights },
    added: '2026-11-02',
  };
}

async function game(dir: string, id: string, entries: LockEntry[]): Promise<string> {
  mkdirSync(join(dir, '.gm'), { recursive: true });
  writeFileSync(join(dir, '.gm/game.json'), JSON.stringify({ gameId: id }));
  const lock: AssetsLock = { version: 1, family: 'chunky-low-poly', pov: 'iso', assets: entries };
  await writeLock(dir, lock);
  return dir;
}

/** A library with three packs (two free, one in-build), a blob store with one agent-made asset, and two games. */
async function instance() {
  const assetsRoot = preparedLibrary();
  mkdirSync(join(assetsRoot, LOOP_FILE, '..'), { recursive: true });
  writeFileSync(join(assetsRoot, LOOP_FILE), 'loop-bytes');
  const blobRoot = tempDir('gm-blobs-');
  const store = new FsBlobStore({ root: blobRoot, signingKey: 'unused', publicOrigin: 'http://127.0.0.1' });
  const made = await store.put(Buffer.from('made-bytes'), 'image/png');
  const unpinned = await store.put(Buffer.from('preview-bytes'), 'image/webp');
  const gamesDir = tempDir('gm-games-');
  const gameA = await game(join(gamesDir, 'a'), 'game-a', [
    entry(ORC, 'orc-bytes'),
    entry(SYNTY, 'torch-bytes', { audience: 'private', redistribution: 'in-build' }),
    entry('t3:game-a/hero-edit', 'made-bytes'),
  ]);
  const gameB = await game(join(gamesDir, 'b'), 'game-b', [entry(LOOP, 'loop-bytes')]);
  const env = { OGM_ASSETS_ROOT: assetsRoot, OGM_BLOB_ROOT: blobRoot };
  return {
    assetsRoot,
    blobRoot,
    gamesDir,
    gameA,
    gameB,
    env,
    made: made.hash.slice(7),
    unpinned: unpinned.hash.slice(7),
  };
}

async function names(zip: string): Promise<string[]> {
  const reader = await ZipReader.open(zip);
  await reader.close();
  return reader.entries.map((item) => item.name);
}

function report(zip: string): {
  included: Array<{ path: string; restricted?: boolean }>;
  excluded: Array<{ ids: string[] }>;
} {
  return JSON.parse(new AdmZip(zip).readAsText('rights-report.json')) as ReturnType<typeof report>;
}

describe('gm assets export --used', () => {
  it('zips the game lock entries from the library and blob store and leaves restricted packs out, naming them', async () => {
    const world = await instance();
    const out = join(tempDir(), 'a.zip');
    const result = await gm(['assets', 'export', '--used', '--out', out], { cwd: world.gameA, env: world.env });

    expect(result.code).toBe(0);
    expect(result.err).toEqual([
      `left out ${SYNTY} (redistribution is in-build); add --include-restricted to export it`,
    ]);
    expect(await names(out)).toEqual([
      `blobs/${world.made}`,
      ORC_ZIP,
      'CREDITS.md',
      'locks/game-a/assets.lock.json',
      'rights-report.json',
    ]);
    const zip = new AdmZip(out);
    expect(zip.readAsText(ORC_ZIP)).toBe('orc-bytes');
    expect(zip.readAsText(`blobs/${world.made}`)).toBe('made-bytes');
    expect(zip.readAsText('locks/game-a/assets.lock.json')).toBe(
      readFileSync(join(world.gameA, 'assets.lock.json'), 'utf8'),
    );
    expect(zip.readAsText('CREDITS.md')).toContain('CC0 assets from: game-a, kenney-mini-dungeon');
    expect(report(out).excluded).toMatchObject([{ ids: [SYNTY], reason: 'redistribution is in-build' }]);
  });

  it('scopes --game to that game, so packs only another game uses stay out', async () => {
    const world = await instance();
    const out = join(tempDir(), 'b.zip');
    const result = await gm(
      ['assets', 'export', '--used', '--game', 'game-b', '--games-dir', world.gamesDir, '--out', out],
      {
        cwd: world.gamesDir,
        env: world.env,
      },
    );

    expect(result.code).toBe(0);
    const listed = await names(out);
    expect(listed).toContain(LOOP_ZIP);
    expect(listed.filter((name) => name.startsWith('library/') || name.startsWith('blobs/'))).toEqual([LOOP_ZIP]);

    const both = join(tempDir(), 'both.zip');
    await gm(['assets', 'export', '--used', '--all-games', '--out', both], { cwd: world.gamesDir, env: world.env });
    expect(await names(both)).toEqual(
      expect.arrayContaining([LOOP_ZIP, ORC_ZIP, 'locks/game-a/assets.lock.json', 'locks/game-b/assets.lock.json']),
    );
  });

  it('exports restricted entries only with --include-restricted, warning by name and marking them in the report', async () => {
    const world = await instance();
    const out = join(tempDir(), 'a.zip');
    const result = await gm(['assets', 'export', '--used', '--include-restricted', '--out', out], {
      cwd: world.gameA,
      env: world.env,
    });

    expect(result.code).toBe(0);
    expect(result.err).toEqual([`warning: exporting restricted ${SYNTY} (redistribution is in-build)`]);
    expect(report(out).included.find((item) => item.path === SYNTY_ZIP)).toMatchObject({ restricted: true });
    expect(report(out).included.find((item) => item.path === ORC_ZIP)?.restricted).toBeUndefined();
  });

  it('writes byte-identical zips for the same state', async () => {
    const world = await instance();
    const first = join(tempDir(), 'one.zip');
    const second = join(tempDir(), 'two.zip');
    await gm(['assets', 'export', '--used', '--out', first], { cwd: world.gameA, env: world.env });
    await gm(['assets', 'export', '--used', '--out', second], { cwd: world.gameA, env: world.env });
    expect(sha(readFileSync(first))).toBe(sha(readFileSync(second)));
  });

  it('refuses to export a library file whose bytes no longer match the lock, and writes no zip', async () => {
    const world = await instance();
    writeFileSync(
      join(world.assetsRoot, 'packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb'),
      'changed',
    );
    const out = join(tempDir(), 'a.zip');
    const result = await gm(['assets', 'export', '--used', '--out', out], { cwd: world.gameA, env: world.env });

    expect(result.code).toBe(1);
    expect(result.err.at(-1)).toContain(
      `${ORC}: ${ORC_ZIP} has sha256 ${sha('changed')}, the lock pins ${sha('orc-bytes')}`,
    );
    expect(existsSync(out)).toBe(false);
  });

  it('fails naming each entry it cannot find instead of writing a partial zip', async () => {
    const world = await instance();
    const out = join(tempDir(), 'b.zip');
    const result = await gm(['assets', 'export', '--used', '--out', out], {
      cwd: world.gameB,
      env: { OGM_ASSETS_ROOT: library(), OGM_BLOB_ROOT: world.blobRoot },
    });

    expect(result.code).toBe(1);
    expect(result.err[0]).toBe(`${LOOP}: Loops/Infinite Descent.ogg is not in packs/kenney-music-loops/1.1/extracted`);
    expect(existsSync(out)).toBe(false);
  });
});

describe('gm assets export --all', () => {
  it('zips every free pack with its cards and every pinned blob; restricted packs and unpinned blobs stay out', async () => {
    const world = await instance();
    const out = join(tempDir(), 'all.zip');
    const result = await gm(['assets', 'export', '--all', '--games-dir', world.gamesDir, '--out', out], {
      cwd: world.gamesDir,
      env: world.env,
    });

    expect(result.code).toBe(0);
    const listed = await names(out);
    expect(listed).toEqual(
      expect.arrayContaining([
        ORC_ZIP,
        LOOP_ZIP,
        'library/kenney-mini-dungeon/collection.card.json',
        'library/kenney-mini-dungeon/cards/character-orc.card.json',
        `blobs/${world.made}`,
      ]),
    );
    expect(listed.some((name) => name.startsWith('library/synty-polygon-goblin-war-camp/'))).toBe(false);
    expect(listed).not.toContain(`blobs/${world.unpinned}`);
    expect(result.err).toEqual(
      expect.arrayContaining([
        expect.stringContaining('left out t1:synty-polygon-goblin-war-camp@v3 (redistribution is in-build)'),
        `left out blobs/${world.unpinned} (no rights are recorded for it); add --include-restricted to export it`,
      ]),
    );
  });

  it('refuses --all combined with a game scope', async () => {
    const result = await gm(['assets', 'export', '--all', '--game', 'x'], { env: { OGM_ASSETS_ROOT: library() } });
    expect(result.code).toBe(2);
  });
});

describe('gm assets import', () => {
  it('fills a fresh library and blob store with the exported bytes, and is idempotent', async () => {
    const world = await instance();
    const out = join(tempDir(), 'all-games.zip');
    await gm(['assets', 'export', '--used', '--all-games', '--out', out], { cwd: world.gamesDir, env: world.env });

    const fresh = { OGM_ASSETS_ROOT: tempDir('gm-fresh-lib-'), OGM_BLOB_ROOT: tempDir('gm-fresh-blobs-') };
    const first = await gm(['assets', 'import', out], { env: fresh });
    expect(first.code).toBe(0);
    expect(first.out).toEqual([
      `added blobs/${world.made}`,
      `added ${ORC_ZIP}`,
      `added ${LOOP_ZIP}`,
      'imported 3 files; 0 already present; 0 failed',
    ]);
    expect(
      readFileSync(
        join(fresh.OGM_ASSETS_ROOT, 'packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb'),
        'utf8',
      ),
    ).toBe('orc-bytes');
    const store = new FsBlobStore({
      root: fresh.OGM_BLOB_ROOT,
      signingKey: 'unused',
      publicOrigin: 'http://127.0.0.1',
    });
    expect(await store.head(`sha256:${world.made}`)).toMatchObject({ bytes: 10, mime: 'image/png' });

    const again = await gm(['assets', 'import', out], { env: fresh });
    expect(again).toMatchObject({ code: 0, out: ['imported 0 files; 3 already present; 0 failed'] });
  });

  it('never overwrites a different file already in the library and reports it', async () => {
    const world = await instance();
    const out = join(tempDir(), 'a.zip');
    await gm(['assets', 'export', '--used', '--out', out], { cwd: world.gameA, env: world.env });

    const fresh = { OGM_ASSETS_ROOT: tempDir('gm-fresh-lib-'), OGM_BLOB_ROOT: tempDir('gm-fresh-blobs-') };
    const mine = join(
      fresh.OGM_ASSETS_ROOT,
      'packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb',
    );
    mkdirSync(join(mine, '..'), { recursive: true });
    writeFileSync(mine, 'my-own-orc');
    const result = await gm(['assets', 'import', out], { env: fresh });

    expect(result.code).toBe(1);
    expect(result.err).toEqual([`${ORC_ZIP}: a different file is already at ${mine}; kept it`]);
    expect(readFileSync(mine, 'utf8')).toBe('my-own-orc');
  });

  it('rejects entries whose bytes do not match the rights report', async () => {
    const world = await instance();
    const exported = join(tempDir(), 'a.zip');
    await gm(['assets', 'export', '--used', '--out', exported], { cwd: world.gameA, env: world.env });
    const tampered = new AdmZip(exported);
    tampered.updateFile(ORC_ZIP, Buffer.from('evil-bytes'));
    const out = join(tempDir(), 'tampered.zip');
    tampered.writeZip(out);

    const fresh = { OGM_ASSETS_ROOT: tempDir('gm-fresh-lib-'), OGM_BLOB_ROOT: tempDir('gm-fresh-blobs-') };
    const result = await gm(['assets', 'import', out], { env: fresh });

    expect(result.code).toBe(1);
    expect(result.err).toEqual([
      `${ORC_ZIP}: bytes hash to ${sha('evil-bytes')}, the report says ${sha('orc-bytes')}; skipped`,
    ]);
    expect(
      existsSync(
        join(fresh.OGM_ASSETS_ROOT, 'packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb'),
      ),
    ).toBe(false);
  });
});

describe('zip writer and reader', () => {
  it('writes zip64 records past the limit that unzip and the reader both accept', async () => {
    const path = join(tempDir(), 'z64.zip');
    const source = join(tempDir(), 'big.bin');
    writeFileSync(source, Buffer.alloc(300, 7));
    const zip = await ZipWriter.create(path, 100);
    await zip.addBuffer('a/small.txt', Buffer.from('hi'));
    await zip.addFile('a/big.bin', source);
    await zip.close();

    const reader = await ZipReader.open(path);
    expect(reader.entries.map((item) => [item.name, item.size])).toEqual([
      ['a/small.txt', 2],
      ['a/big.bin', 300],
    ]);
    const chunks: Buffer[] = [];
    for await (const chunk of await reader.stream(reader.entries[1]!)) chunks.push(chunk as Buffer);
    await reader.close();
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(300, 7));
    if (existsSync('/usr/bin/unzip')) expect(execFileSync('unzip', ['-tq', path]).toString()).toContain('No errors');
  });

  it('reads deflated entries written by other tools', async () => {
    const path = join(tempDir(), 'deflate.zip');
    const other = new AdmZip();
    other.addFile('x/y.txt', Buffer.from('hello '.repeat(100)));
    other.writeZip(path);
    const reader = await ZipReader.open(path);
    const chunks: Buffer[] = [];
    for await (const chunk of await reader.stream(reader.entries[0]!)) chunks.push(chunk as Buffer);
    await reader.close();
    expect(reader.entries[0]!.method).toBe(8);
    expect(Buffer.concat(chunks).toString()).toBe('hello '.repeat(100));
  });

  it('refuses entry names that escape the target directory', async () => {
    const zip = await ZipWriter.create(join(tempDir(), 'bad.zip'));
    await expect(zip.addBuffer('library/../../etc/passwd', Buffer.from('x'))).rejects.toThrow('unsafe zip entry name');
    await zip.abort();
  });
});
