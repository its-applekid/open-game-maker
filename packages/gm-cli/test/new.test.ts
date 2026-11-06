import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gm, tempDir } from './helpers.js';

function write(root: string, path: string, body: string): void {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body);
}

function makeSource(): { cwd: string; pack: string } {
  const cwd = tempDir('gm-new-source-');
  write(cwd, 'package.json', '{"private":true,"gameMaker":{"instance":true}}\n');
  write(cwd, 'pnpm-workspace.yaml', "packages:\n  - 'games/*'\n  - 'packages/*'\n");
  write(cwd, 'games/README.md', '# Games\n');
  write(cwd, 'packages/README.md', '# Packages\n');
  write(cwd, 'templates/game-2d/package.json', '{"name":"fixture-game","private":true}\n');
  write(cwd, 'templates/game-2d/index.html', '<canvas></canvas>\n');
  write(cwd, 'templates/game-2d/src/main.ts', 'export const booted = true;\n');
  write(
    cwd,
    'templates/game-2d/tsconfig.json',
    '{"references":[{"path":"../../packages/contracts"},{"path":"../../packages/sdk"}]}\n',
  );
  const pack = join(cwd, 'pack');
  write(pack, 'gm-core/SKILL.md', '---\nname: gm-core\n---\ncore\n');
  write(pack, 'gm-build/SKILL.md', '---\nname: gm-build\n---\nbuild\n');
  write(pack, 'gm-set-smallscaleint/SKILL.md', '---\nname: gm-set-smallscaleint\n---\nset\n');
  write(pack, 'gm-set-kaykit/SKILL.md', '---\nname: gm-set-kaykit\n---\nset\n');
  write(pack, 'vendor/skills.lock', '{"v":1,"sets":{}}\n');
  write(
    cwd,
    'packages/pack-adapters/smallscaleint/package.json',
    '{"name":"@gm/pack-smallscaleint","version":"1.2.3"}\n',
  );
  return { cwd, pack };
}

function sha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe('gm new', () => {
  it('copies a scaffold and installs a self-consistent skill pack and creation lock', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'games/my-game');
    const result = await gm(['new', 'game-2d', 'my-game', '--family', 'chunky-low-poly', '--pov', 'side'], {
      cwd,
      env: { GM_SKILLS_DIR: pack },
    });

    expect(result.code).toBe(0);
    expect(result.out.at(-1)).toBe(
      `created ${game}. Next: cd ${cwd} && pnpm install --offline (refreshes pnpm-lock.yaml; commit it)`,
    );
    expect(result.err).toEqual([]);
    expect(readFileSync(join(game, 'src/main.ts'), 'utf8')).toContain('booted = true');
    expect(JSON.parse(readFileSync(join(game, 'package.json'), 'utf8')).name).toBe('@game/my-game');
    expect(JSON.parse(readFileSync(join(game, 'tsconfig.json'), 'utf8'))).not.toHaveProperty('references');
    expect(readFileSync(join(game, 'AGENTS.md'), 'utf8').split('\n')[0]).toBe(
      'Load .claude/skills/gm-core/SKILL.md first.',
    );
    expect(readlinkSync(join(game, '.codex/skills/gm-core'))).toBe('../../.claude/skills/gm-core');
    expect(statSync(join(game, '.agents/skills/gm-build/SKILL.md')).isFile()).toBe(true);

    const creation = JSON.parse(readFileSync(join(game, 'gm.lock.json'), 'utf8')) as Record<string, unknown>;
    expect(creation).toMatchObject({
      v: 1,
      template: 'game-2d',
      family: 'chunky-low-poly',
      pov: 'side',
      gmVersion: '0.0.0',
    });
    expect(typeof creation.createdAt).toBe('string');

    const lock = JSON.parse(readFileSync(join(game, 'skills.lock'), 'utf8')) as {
      skills: Record<string, { sha256: string }>;
    };
    for (const [path, entry] of Object.entries(lock.skills)) {
      expect(entry.sha256).toBe(sha(join(game, '.claude/skills', path)));
    }
    expect(existsSync(join(game, '.claude/skills/gm-set-smallscaleint'))).toBe(false);
    expect(existsSync(join(game, '.claude/skills/gm-set-kaykit'))).toBe(false);
  });

  it('pins one set adapter, installs only its skill, and records the set', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'games/set-game');

    const result = await gm(['new', 'game-2d', 'set-game', '--family', 'isometric-2d', '--set', 'smallscaleint'], {
      cwd,
      env: { GM_SKILLS_DIR: pack },
    });

    expect(result).toMatchObject({ code: 0, err: [] });
    expect(JSON.parse(readFileSync(join(game, 'package.json'), 'utf8')).dependencies).toMatchObject({
      '@gm/pack-smallscaleint': '1.2.3',
    });
    expect(JSON.parse(readFileSync(join(game, 'gm.lock.json'), 'utf8'))).toMatchObject({
      family: 'isometric-2d',
      set: 'smallscaleint',
    });
    expect(statSync(join(game, '.claude/skills/gm-set-smallscaleint/SKILL.md')).isFile()).toBe(true);
    expect(existsSync(join(game, '.claude/skills/gm-set-kaykit'))).toBe(false);
  });

  it('refuses a non-empty destination without changing its contents', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'games/existing');
    write(game, 'keep.txt', 'untouched\n');

    const result = await gm(['new', 'game-2d', 'existing'], { cwd, env: { GM_SKILLS_DIR: pack } });

    expect(result.code).toBe(2);
    expect(result.err).toEqual([`destination is not empty: ${game}. Try: choose an empty directory`]);
    expect(readFileSync(join(game, 'keep.txt'), 'utf8')).toBe('untouched\n');
  });

  it('accepts only family ids from the registry gm assets search reads', async () => {
    const { cwd, pack } = makeSource();
    const run = (dir: string, family: string) =>
      gm(['new', 'game-2d', dir, '--family', family], { cwd, env: { GM_SKILLS_DIR: pack } });

    // A game's lock family drives search; an id search cannot resolve would silently break it.
    const unknown = await run('bad', 'unknown');
    expect(unknown.code).toBe(2);
    expect(unknown.err[0]).toContain('unknown style family "unknown"');
    expect(() => statSync(join(cwd, 'games/bad'))).toThrow();

    // Sets live under families: a set id is not a family, so point at the family that owns it.
    const set = await run('set', 'limezu-modern');
    expect(set.code).toBe(2);
    expect(set.err[0]).toBe('"limezu-modern" is a style set, not a family. Try: use --family pixel-art');

    const valid = await run('good', 'pixel-art');
    expect(valid.code).toBe(0);
    expect(valid.err).toEqual([]);
    expect(JSON.parse(readFileSync(join(cwd, 'games/good/gm.lock.json'), 'utf8'))).toMatchObject({
      family: 'pixel-art',
    });
  });

  it('accepts only registered sets that belong to the selected family', async () => {
    const { cwd, pack } = makeSource();
    const run = (dir: string, family: string, set: string) =>
      gm(['new', 'game-2d', dir, '--family', family, '--set', set], {
        cwd,
        env: { GM_SKILLS_DIR: pack },
      });

    const unknown = await run('unknown-set', 'isometric-2d', 'missing');
    expect(unknown.code).toBe(2);
    expect(unknown.err[0]).toContain('unknown style set "missing"');
    expect(() => statSync(join(cwd, 'games/unknown-set'))).toThrow();

    const mismatch = await run('wrong-family', 'pixel-art', 'smallscaleint');
    expect(mismatch.code).toBe(2);
    expect(mismatch.err[0]).toBe(
      'style set "smallscaleint" belongs to family "isometric-2d", not "pixel-art". Try: use --family isometric-2d',
    );
    expect(() => statSync(join(cwd, 'games/wrong-family'))).toThrow();

    const unavailable = await run('unavailable-set', 'simple-low-poly', 'synty-simple');
    expect(unavailable.code).toBe(2);
    expect(unavailable.err[0]).toBe(
      'style set "synty-simple" has no installed skill. Try: choose a set supported by this Game Maker installation',
    );
    expect(() => statSync(join(cwd, 'games/unavailable-set'))).toThrow();
  });

  it('rejects unsupported template names before creating the destination', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'games/bad-template');
    const result = await gm(['new', '../secrets', 'bad-template'], { cwd, env: { GM_SKILLS_DIR: pack } });
    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('unknown template "../secrets"');
    expect(() => statSync(game)).toThrow();
  });

  it('rejects paths and use outside an instance repository', async () => {
    const { cwd, pack } = makeSource();
    const invalid = await gm(['new', 'game-2d', '../escape'], { cwd, env: { GM_SKILLS_DIR: pack } });
    expect(invalid.code).toBe(2);
    expect(invalid.err[0]).toContain('invalid game slug');

    const outside = tempDir('gm-new-outside-');
    const missing = await gm(['new', 'game-2d', 'valid-game'], {
      cwd: outside,
      env: { GM_SKILLS_DIR: pack },
    });
    expect(missing.code).toBe(2);
    expect(missing.err[0]).toContain('not inside a Game Maker instance repository');
  });

  it('refuses an instance whose games directory escapes through a symlink', async () => {
    const { cwd, pack } = makeSource();
    const outside = tempDir('gm-new-symlink-');
    const games = join(cwd, 'games');
    const original = join(cwd, 'games-original');
    renameSync(games, original);
    symlinkSync(outside, games);

    const result = await gm(['new', 'game-2d', 'escaped'], { cwd, env: { GM_SKILLS_DIR: pack } });

    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('not inside a Game Maker instance repository');
    expect(existsSync(join(outside, 'escaped'))).toBe(false);
    expect(readFileSync(join(original, 'README.md'), 'utf8')).toBe('# Games\n');
  });

  it('keeps searching past a parent directory with an unreadable manifest', async () => {
    const { cwd, pack } = makeSource();
    const nested = join(cwd, 'games', 'broken', 'inner');
    write(nested, 'package.json', '{not json\n');

    const result = await gm(['new', 'game-2d', 'from-nested'], { cwd: nested, env: { GM_SKILLS_DIR: pack } });

    expect(result.code).toBe(0);
    expect(existsSync(join(cwd, 'games/from-nested/package.json'))).toBe(true);
  });
});
