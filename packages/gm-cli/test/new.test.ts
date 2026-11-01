import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
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
  write(cwd, 'templates/game-2d/package.json', '{"name":"fixture-game","private":true}\n');
  write(cwd, 'templates/game-2d/index.html', '<canvas></canvas>\n');
  write(cwd, 'templates/game-2d/src/main.ts', 'export const booted = true;\n');
  const pack = join(cwd, 'pack');
  write(pack, 'gm-core/SKILL.md', '---\nname: gm-core\n---\ncore\n');
  write(pack, 'gm-build/SKILL.md', '---\nname: gm-build\n---\nbuild\n');
  write(pack, 'vendor/skills.lock', '{"v":1,"sets":{}}\n');
  return { cwd, pack };
}

function sha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe('gm new', () => {
  it('copies a scaffold and installs a self-consistent skill pack and creation lock', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'my-game');
    const result = await gm(['new', 'game-2d', game, '--family', 'chunky-low-poly', '--pov', 'side'], {
      cwd,
      env: { GM_SKILLS_DIR: pack },
    });

    expect(result.code).toBe(0);
    expect(result.out.at(-1)).toBe(`created ${game}. Next: cd ${game} && pnpm install --offline`);
    expect(result.err).toEqual([]);
    expect(readFileSync(join(game, 'src/main.ts'), 'utf8')).toContain('booted = true');
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
  });

  it('refuses a non-empty destination without changing its contents', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'existing');
    write(game, 'keep.txt', 'untouched\n');

    const result = await gm(['new', 'game-2d', game], { cwd, env: { GM_SKILLS_DIR: pack } });

    expect(result.code).toBe(2);
    expect(result.err).toEqual([`destination is not empty: ${game}. Try: choose an empty directory`]);
    expect(readFileSync(join(game, 'keep.txt'), 'utf8')).toBe('untouched\n');
  });

  it('accepts only family ids from the registry gm assets search reads', async () => {
    const { cwd, pack } = makeSource();
    const run = (dir: string, family: string) =>
      gm(['new', 'game-2d', join(cwd, dir), '--family', family], { cwd, env: { GM_SKILLS_DIR: pack } });

    // A game's lock family drives search; an id search cannot resolve would silently break it.
    const unknown = await run('bad', 'unknown');
    expect(unknown.code).toBe(2);
    expect(unknown.err[0]).toContain('unknown style family "unknown"');
    expect(() => statSync(join(cwd, 'bad'))).toThrow();

    // Sets live under families: a set id is not a family, so point at the family that owns it.
    const set = await run('set', 'limezu-modern');
    expect(set.code).toBe(2);
    expect(set.err[0]).toBe('"limezu-modern" is a style set, not a family. Try: use --family pixel-art');

    const valid = await run('good', 'pixel-art');
    expect(valid.code).toBe(0);
    expect(valid.err).toEqual([]);
    expect(JSON.parse(readFileSync(join(cwd, 'good/gm.lock.json'), 'utf8'))).toMatchObject({ family: 'pixel-art' });
  });

  it('rejects unsupported template names before creating the destination', async () => {
    const { cwd, pack } = makeSource();
    const game = join(cwd, 'bad-template');
    const result = await gm(['new', '../secrets', game], { cwd, env: { GM_SKILLS_DIR: pack } });
    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('unknown template "../secrets"');
    expect(() => statSync(game)).toThrow();
  });
});
