import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { gm, tempDir } from './helpers.js';
import { ORC, SYNTY, preparedLibrary, useOrc } from './assets-fixture.js';

describe('gm check assets', () => {
  it('accepts a clean lock and reports a changed file by id and sha rule', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    expect(await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } })).toEqual({
      code: 0,
      out: [],
      err: [],
    });
    writeFileSync(join(cwd, 'assets/model/kenney-mini-dungeon/character-orc.glb'), 'changed');
    const changed = await gm(['check', 'assets'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(changed.code).toBe(1);
    expect(changed.err.join('\n')).toContain(`${ORC}  sha-mismatch`);
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
    const verdict = JSON.parse(result.out[0]!) as { allowed: boolean; reasons: Array<{ code: string; detail: string }> };
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
