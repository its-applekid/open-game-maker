import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { gm, tempDir } from './helpers.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/cards/', import.meta.url));

function pack(): string {
  const root = tempDir('gm-pattern-pack-');
  for (const name of ['jump-buffer-coyote.md', 'deadzone-camera.md']) {
    const target = join(root, 'gm-genre-platformer/references/cards', name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(FIXTURES, name)));
  }
  return root;
}

describe('gm docs pattern', () => {
  it('matches an alias and prints the source card verbatim', async () => {
    const skills = pack();
    const cwd = tempDir();
    mkdirSync(join(cwd, '.claude/skills'), { recursive: true });
    const result = await gm(['docs', 'pattern', 'jump'], { cwd, env: { GM_SKILLS_DIR: skills } });

    expect(result).toMatchObject({ code: 0, err: [] });
    expect(result.out.join('\n')).toContain(readFileSync(join(FIXTURES, 'jump-buffer-coyote.md'), 'utf8').trimEnd());
  });

  it('lists cards, honors engine and max filters, and exposes optional sets', async () => {
    const skills = pack();
    const listed = await gm(['docs', 'pattern', '--list'], { env: { GM_SKILLS_DIR: skills } });
    const filtered = await gm(['docs', 'pattern', 'a', '--engine', 'three', '--max', '1'], {
      env: { GM_SKILLS_DIR: skills },
    });

    expect(listed.out).toContain('jump-buffer-coyote  phaser  jump,coyote,buffer  smallscaleint');
    expect(filtered.out).toHaveLength(1);
    expect(filtered.out[0]).toContain('deadzone-camera.md');
  });

  it('refuses unknown topics with a list hint and empty installed packs with a sync hint', async () => {
    const skills = pack();
    const unknown = await gm(['docs', 'pattern', 'nothing'], { env: { GM_SKILLS_DIR: skills } });
    const filteredUnknown = await gm(['docs', 'pattern', 'nothing', '--engine', 'three'], {
      env: { GM_SKILLS_DIR: skills },
    });
    const empty = await gm(['docs', 'pattern', '--list'], { env: { GM_SKILLS_DIR: tempDir() } });
    const game = tempDir();
    writeFileSync(join(game, 'skills.lock'), '{}\n');
    const unsynced = await gm(['docs', 'pattern', '--list'], { cwd: game, env: {} });

    expect(unknown.code).toBe(2);
    expect(unknown.err[0]).toContain('Try: gm docs pattern --list');
    expect(filteredUnknown.err[0]).toContain('closest: deadzone-camera');
    expect(filteredUnknown.err[0]).not.toContain('jump-buffer-coyote');
    expect(empty).toMatchObject({ code: 2, err: ['no pattern cards installed. Try: run gm skills sync'] });
    expect(unsynced).toMatchObject({ code: 2, err: ['no pattern cards installed. Try: run gm skills sync'] });
  });
});
