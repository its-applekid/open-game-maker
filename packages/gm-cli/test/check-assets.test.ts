import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { gm, tempDir } from './helpers.js';
import { ORC, SYNTY, WALL, preparedLibrary, useOrc } from './assets-fixture.js';

const ORC_FILE = 'packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb';

function writeBlobLock(cwd: string, bytes: string): void {
  writeFileSync(
    join(cwd, 'assets.lock.json'),
    `${JSON.stringify({
      version: 1,
      family: 'chunky-low-poly',
      pov: 'iso',
      assets: [
        {
          id: 't3:coin-hop/model/door',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          path: 'model/door.glb',
          source: 'blob',
          license: 'LicenseRef-made-by-agent',
          rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
          credit: {
            pack: 'coin-hop',
            title: 'Made for this game',
            licenseSource: 'created for this game',
            attribution: 'none required',
            source: { label: 'agent-generated' },
          },
          added: '2026-11-02',
        },
      ],
    })}\n`,
  );
}

describe('gm check assets', () => {
  it('accepts a lock resolvable from the library and reports a changed or missing library file by id', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    expect(await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } })).toEqual({
      code: 0,
      out: [],
      err: [],
    });
    writeFileSync(join(root, ORC_FILE), 'changed');
    const changed = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(changed.code).toBe(1);
    expect(changed.err.join('\n')).toContain(`${ORC}  sha-mismatch`);
    rmSync(join(root, ORC_FILE));
    const missing = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(missing.code).toBe(1);
    expect(missing.err.join('\n')).toContain(
      `${ORC}  missing-file  Models/GLB format/character-orc.glb is missing from the library source. Try: gm packs import`,
    );
  });

  it('verifies vendored files and their companions in the repo', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await gm(['assets', 'use', WALL, '--vendor', '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect((await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } })).code).toBe(0);
    writeFileSync(join(cwd, 'assets/model/kenney-mini-dungeon/colormap.png'), 'changed');
    const changed = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(changed.code).toBe(1);
    expect(changed.err.join('\n')).toContain(
      `${WALL}  sha-mismatch  assets/model/kenney-mini-dungeon/colormap.png sha256 does not match the lock`,
    );
  });

  it('resolves a tier-3 entry from the blob store by sha', async () => {
    const cwd = tempDir();
    const blobs = tempDir('gm-blobs-');
    writeBlobLock(cwd, 'door-bytes');
    const hex = createHash('sha256').update('door-bytes').digest('hex');
    mkdirSync(join(blobs, 'blobs/sha256'), { recursive: true });
    writeFileSync(join(blobs, 'blobs/sha256', hex), 'door-bytes');
    expect((await gm(['check', 'assets'], { cwd, env: { OGM_BLOB_ROOT: blobs } })).code).toBe(0);
    rmSync(join(blobs, 'blobs/sha256', hex));
    const missing = await gm(['check', 'assets'], { cwd, env: { OGM_BLOB_ROOT: blobs } });
    expect(missing.code).toBe(1);
    expect(missing.err.join('\n')).toContain('t3:coin-hop/model/door  missing-file');
  });

  it('detects stale lock rights from the current index', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const path = join(cwd, 'assets.lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8')) as AssetsLock;
    lock.assets[0]!.rights.audience = 'private';
    writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
    const result = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(result.code).toBe(1);
    expect(result.err.join('\n')).toContain(`${ORC}  stale-rights`);
  });

  it('fails a legacy lock entry that has no credit metadata', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const path = join(cwd, 'assets.lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8')) as AssetsLock;
    delete lock.assets[0]!.credit;
    writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);

    const result = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });

    expect(result.code).toBe(1);
    expect(result.err.join('\n')).toContain(`${ORC}  missing-license-metadata`);
  });

  it('returns a BoundaryVerdict-compatible JSON refusal for a private Synty asset in a public repo', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    const used = await gm(['assets', 'use', SYNTY, '--family', 'detailed-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(used.code).toBe(0);
    const result = await gm(['check', 'assets', '--publish', '--repo-visibility', 'public', '--json'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(result.code).toBe(1);
    const verdict = JSON.parse(result.out[0]!) as {
      allowed: boolean;
      reasons: Array<{ code: string; detail: string }>;
    };
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons).toContainEqual(
      expect.objectContaining({ code: 'rights', detail: expect.stringContaining(`${SYNTY} private-in-public`) }),
    );
  });

  it('reports files under assets that are not represented by the lock', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const extra = join(cwd, 'assets/extra.png');
    mkdirSync(join(extra, '..'), { recursive: true });
    writeFileSync(extra, 'extra');
    const result = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(result.code).toBe(1);
    expect(result.err).toContain('assets/extra.png  unknown-id  file is not represented in assets.lock.json');
  });

  it('emits a failed check event for an invalid lock', async () => {
    const cwd = tempDir();
    const events = join(cwd, 'events.jsonl');
    writeFileSync(join(cwd, 'assets.lock.json'), '{"version":1}\n');
    const result = await gm(['check', 'assets'], { cwd, env: { GM_EVENTS_FILE: events } });
    expect(result.code).toBe(1);
    const event = JSON.parse(readFileSync(events, 'utf8')) as { event: string; payload: { violations: number } };
    expect(event).toMatchObject({ event: 'assets.check', payload: { violations: 1 } });
  });
});
