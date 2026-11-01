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
    expect(result.err).toContain(
      'style families are unavailable; recorded --family chunky-low-poly without validation',
    );
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

  it('validates --family when the style-family registry is present', async () => {
    const { cwd, pack } = makeSource();
    write(cwd, 'packages/asset-cards/data/style-families.json', '[{"id":"chunky-low-poly"},{"id":"pixel-art"}]\n');

    const invalid = await gm(['new', 'game-2d', join(cwd, 'bad'), '--family', 'unknown'], {
      cwd,
      env: { GM_SKILLS_DIR: pack },
    });
    expect(invalid.code).toBe(2);
    expect(invalid.err[0]).toContain('unknown style family "unknown"');

    const valid = await gm(['new', 'game-2d', join(cwd, 'good'), '--family', 'pixel-art'], {
      cwd,
      env: { GM_SKILLS_DIR: pack },
    });
    expect(valid.code).toBe(0);
    expect(valid.err).toEqual([]);
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
