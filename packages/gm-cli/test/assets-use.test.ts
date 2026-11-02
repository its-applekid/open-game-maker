import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { MAP, ORC, SHEET, SHEET_META, SYNTY, WALL, preparedLibrary, useOrc } from './assets-fixture.js';
import { gm, tempDir } from './helpers.js';

describe('gm assets use', () => {
  it('copies the primary file and writes a valid lock and deterministic credits', async () => {
    const cwd = tempDir();
    const result = await useOrc(cwd, preparedLibrary());
    expect(result).toEqual({ code: 0, out: [], err: [] });
    const copied = join(cwd, 'assets/model/kenney-mini-dungeon/character-orc.glb');
    expect(readFileSync(copied, 'utf8')).toBe('orc-bytes');
    const lock = JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
    expect(lock.assets).toMatchObject([
      {
        id: ORC,
        path: 'assets/model/kenney-mini-dungeon/character-orc.glb',
        sha256: createHash('sha256').update('orc-bytes').digest('hex'),
        license: 'CC0-1.0',
      },
    ]);
    expect(readFileSync(join(cwd, 'CREDITS.md'), 'utf8')).toContain('CC0 assets from: kenney-mini-dungeon');
  });

  it('copies card metadata into the lock without changing it', async () => {
    const cwd = tempDir();
    const result = await gm(['assets', 'use', SHEET, '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: preparedLibrary() },
    });

    expect(result).toEqual({ code: 0, out: [], err: [] });
    const lock = JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
    expect(lock.assets[0]?.meta).toEqual(SHEET_META);
  });

  it('refuses inspiration-only rights without writing any game files', async () => {
    const cwd = tempDir();
    const result = await gm(['assets', 'use', MAP, '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: preparedLibrary() },
    });
    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toContain(`${MAP}  no-redistribution`);
    expect(result.err.join('\n')).toContain('Try: gm assets why');
    expect(() => readFileSync(join(cwd, 'assets.lock.json'))).toThrow();
  });

  it('keeps a mixed refused batch atomic and accepts ids from -f', async () => {
    const root = preparedLibrary();
    const refusedCwd = tempDir();
    const refused = await gm(['assets', 'use', ORC, MAP, '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd: refusedCwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(refused.code).toBe(2);
    expect(() => readFileSync(join(refusedCwd, 'assets.lock.json'))).toThrow();
    expect(() => readFileSync(join(refusedCwd, 'assets/model/kenney-mini-dungeon/character-orc.glb'))).toThrow();

    const cwd = tempDir();
    writeFileSync(join(cwd, 'picks.txt'), `# starter\n${ORC}\n`);
    const picked = await gm(['assets', 'use', '-f', 'picks.txt', '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(picked.code).toBe(0);
    expect(readFileSync(join(cwd, 'assets/model/kenney-mini-dungeon/character-orc.glb'), 'utf8')).toBe('orc-bytes');
  });

  it('copies listed texture companions and writes accepted ids with --partial', async () => {
    const root = preparedLibrary();
    const companionCwd = tempDir();
    const companion = await gm(['assets', 'use', WALL, '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd: companionCwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(companion.code).toBe(0);
    expect(readFileSync(join(companionCwd, 'assets/model/kenney-mini-dungeon/wall.glb'), 'utf8')).toBe('wall-bytes');
    expect(readFileSync(join(companionCwd, 'assets/model/kenney-mini-dungeon/colormap.png'), 'utf8')).toBe('map-bytes');

    const partialCwd = tempDir();
    const partial = await gm(['assets', 'use', ORC, MAP, '--partial', '--family', 'chunky-low-poly', '--pov', 'iso'], {
      cwd: partialCwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(partial.code).toBe(2);
    expect(readFileSync(join(partialCwd, 'assets/model/kenney-mini-dungeon/character-orc.glb'), 'utf8')).toBe(
      'orc-bytes',
    );
    const lock = JSON.parse(readFileSync(join(partialCwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
    expect(lock.assets.map((entry) => entry.id)).toEqual([ORC]);
  });

  it('refuses destination and registered-file symlinks that leave or disguise repo boundaries', async () => {
    const root = preparedLibrary();
    const outside = tempDir();
    const useCwd = tempDir();
    symlinkSync(outside, join(useCwd, 'assets'));
    const used = await useOrc(useCwd, root);
    expect(used.code).toBe(2);
    expect(() => readFileSync(join(outside, 'model/kenney-mini-dungeon/character-orc.glb'))).toThrow();

    const registerCwd = tempDir();
    await useOrc(registerCwd, root);
    const victim = join(outside, 'victim.glb');
    writeFileSync(victim, 'victim');
    const linked = join(registerCwd, 'assets/model/linked.glb');
    symlinkSync(victim, linked);
    const registered = await gm(
      ['assets', 'register', 'assets/model/linked.glb', '--made-by-agent', '--game', 'coin-hop'],
      { cwd: registerCwd, env: { OGM_ASSETS_ROOT: root } },
    );
    expect(registered.code).toBe(2);
    expect(readFileSync(victim, 'utf8')).toBe('victim');
  });

  it('requires and records a family exception before copying', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    const events = join(cwd, 'events.jsonl');
    await useOrc(cwd, root);
    const refused = await gm(['assets', 'use', SYNTY], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(refused.code).toBe(2);
    expect(refused.err.join('\n')).toContain('family-mismatch');
    const empty = await gm(['assets', 'use', SYNTY, '--exception='], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(empty.code).toBe(2);
    expect(empty.err).toContain(
      '--exception needs a reason. Try: gm assets use <id> --exception "intentional contrast"',
    );
    const accepted = await gm(['assets', 'use', SYNTY, '--exception', 'intentional contrast'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root, GM_EVENTS_FILE: events },
    });
    expect(accepted.code).toBe(0);
    const eventNames = readFileSync(events, 'utf8')
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { event: string }).event);
    expect(eventNames).toContain('assets.family_exception');
  });

  it('refuses private-audience bytes in a public game repo', async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, '.gm'));
    writeFileSync(join(cwd, '.gm/game.json'), '{"visibility":"public"}\n');
    const result = await gm(['assets', 'use', SYNTY, '--family', 'detailed-low-poly', '--pov', 'iso'], {
      cwd,
      env: { OGM_ASSETS_ROOT: preparedLibrary() },
    });
    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toContain(`${SYNTY}  private-in-public`);
    expect(() => readFileSync(join(cwd, 'assets.lock.json'))).toThrow();
  });

  it('refreshes existing lock rights from a rebuilt index without recopying the file', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const collectionPath = join(root, 'packs/kenney-mini-dungeon/collection.card.json');
    const collection = JSON.parse(readFileSync(collectionPath, 'utf8')) as {
      rights: { audience: string; basis: Array<{ audience: string }> };
    };
    collection.rights.audience = 'private';
    collection.rights.basis[0]!.audience = 'private';
    writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
    rmSync(join(root, 'index'), { recursive: true, force: true });
    const result = await gm(['assets', 'use', '--refresh'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(result.code).toBe(0);
    const lock = JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
    expect(lock.assets[0]?.rights.audience).toBe('private');
    expect(readFileSync(join(cwd, 'assets/model/kenney-mini-dungeon/character-orc.glb'), 'utf8')).toBe('orc-bytes');
  });
});

describe('gm assets register and why', () => {
  it('registers an agent-made derivative with the intersection of source rights', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const generated = join(cwd, 'assets/model/boss-door.glb');
    mkdirSync(join(generated, '..'), { recursive: true });
    writeFileSync(generated, 'door-bytes');
    const result = await gm(
      [
        'assets',
        'register',
        'assets/model/boss-door.glb',
        '--made-by-agent',
        '--from',
        ORC,
        '--from',
        SYNTY,
        '--game',
        'coin-hop',
      ],
      { cwd, env: { OGM_ASSETS_ROOT: root } },
    );
    expect(result.code).toBe(0);
    const lock = JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
    expect(lock.assets.find((entry) => entry.id.startsWith('t3:coin-hop/'))).toMatchObject({
      rights: { audience: 'private', redistribution: 'in-build' },
      derived_from: [ORC, SYNTY],
    });
  });

  it('gives a source-free agent output CC0-equivalent rights without claiming a CC0 licence', async () => {
    const cwd = tempDir();
    const root = preparedLibrary();
    await useOrc(cwd, root);
    const generated = join(cwd, 'assets/model/spark.glb');
    mkdirSync(join(generated, '..'), { recursive: true });
    writeFileSync(generated, 'spark');
    const result = await gm(['assets', 'register', 'assets/model/spark.glb', '--made-by-agent', '--game', 'g_01J'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(result.code).toBe(0);
    const lock = JSON.parse(readFileSync(join(cwd, 'assets.lock.json'), 'utf8')) as AssetsLock;
    expect(lock.assets.find((entry) => entry.id === 't3:g_01J/model/spark')).toMatchObject({
      license: 'LicenseRef-made-by-agent',
      rights: { audience: 'public', redistribution: 'free' },
    });
  });

  it('explains effective rights, every basis row, and the public-repo verdict', async () => {
    const result = await gm(['assets', 'why', SYNTY], { env: { OGM_ASSETS_ROOT: preparedLibrary() } });
    expect(result.code).toBe(0);
    expect(result.out[0]).toContain('LicenseRef-synty-personal');
    expect(result.out.some((line) => line.startsWith('license  in-game,'))).toBe(true);
    expect(result.out).toContain('public repo: refused private-in-public');
  });
});
