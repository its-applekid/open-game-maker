import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { syncSkillPack } from '../src/skills/pack.js';
import { gm, tempDir } from './helpers.js';

type SkillsLock = {
  v: 1;
  pack: string;
  installedAt: string;
  skills: Record<string, { sha256: string }>;
  vendored: Record<string, string>;
  linkMode?: 'symlink' | 'copy';
};

function write(root: string, path: string, body: string): void {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body);
}

function makePack(): string {
  const root = tempDir('gm-pack-');
  write(root, 'gm-core/SKILL.md', '---\nname: gm-core\n---\ncore v1\n');
  write(root, 'gm-core/references/rules.md', 'rules v1\n');
  write(root, 'gm-build/SKILL.md', '---\nname: gm-build\n---\nbuild v1\n');
  write(root, 'vendor/phaser/cameras/SKILL.md', '---\nname: cameras\n---\ncameras v1\n');
  write(
    root,
    'vendor/skills.lock',
    `${JSON.stringify({
      v: 1,
      sets: { 'phaserjs/phaser': { sha: 'abc123', license: 'MIT', path: 'phaser' } },
    })}\n`,
  );
  return root;
}

function sha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe('gm skills sync', () => {
  it('installs every pack file, relative discovery link, and vendored pin', async () => {
    const pack = makePack();
    const repo = tempDir('gm-game-');
    const result = await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });

    expect(result.code).toBe(0);
    expect(result.out).toContain('installed gm-core');
    expect(readlinkSync(join(repo, '.codex/skills/gm-core'))).toBe('../../.claude/skills/gm-core');
    expect(readlinkSync(join(repo, '.agents/skills/gm-core'))).toBe('../../.claude/skills/gm-core');
    expect(readlinkSync(join(repo, '.codex/skills/cameras'))).toBe('../../.claude/skills/vendor/phaser/cameras');
    expect(statSync(join(repo, '.codex/skills/cameras/SKILL.md')).isFile()).toBe(true);

    const lock = JSON.parse(readFileSync(join(repo, 'skills.lock'), 'utf8')) as SkillsLock;
    expect(lock).toMatchObject({ v: 1, pack: '0.0.0', vendored: { 'phaserjs/phaser': 'abc123' } });
    expect(lock.skills['gm-core/SKILL.md']?.sha256).toBe(sha(join(repo, '.claude/skills/gm-core/SKILL.md')));
    expect(lock.skills['gm-core/references/rules.md']?.sha256).toBe(
      sha(join(repo, '.claude/skills/gm-core/references/rules.md')),
    );
    expect(lock.skills['vendor/phaser/cameras/SKILL.md']?.sha256).toBe(
      sha(join(repo, '.claude/skills/vendor/phaser/cameras/SKILL.md')),
    );
  });

  it('is a true no-op when the installed tree and links match the lock', async () => {
    const pack = makePack();
    const repo = tempDir('gm-game-');
    await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    const lock = join(repo, 'skills.lock');
    const before = statSync(lock).mtimeMs;

    const result = await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });

    expect(result).toEqual({ code: 0, out: ['skills up to date'], err: [] });
    expect(statSync(lock).mtimeMs).toBe(before);
  });

  it('keeps local edits, reports drift, and never deletes an unowned file', async () => {
    const pack = makePack();
    const repo = tempDir('gm-game-');
    await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    const installed = join(repo, '.claude/skills/gm-core/SKILL.md');
    const extra = join(repo, '.claude/skills/gm-core/my-notes.md');
    writeFileSync(installed, 'local edit\n');
    writeFileSync(extra, 'keep me\n');
    writeFileSync(join(pack, 'gm-core/SKILL.md'), 'upstream v2\n');

    const check = await gm(['skills', 'sync', '--check'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    expect(check.code).toBe(1);
    expect(check.out.join('\n')).toContain('local edit gm-core/SKILL.md');

    const sync = await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    expect(sync.code).toBe(0);
    expect(sync.out.join('\n')).toContain('kept local edit gm-core/SKILL.md');
    expect(readFileSync(installed, 'utf8')).toBe('local edit\n');
    expect(readFileSync(extra, 'utf8')).toBe('keep me\n');
    expect((await gm(['skills', 'sync', '--check'], { cwd: repo, env: { GM_SKILLS_DIR: pack } })).code).toBe(1);
  });

  it('adds a newly shipped gm skill and lists installed discovery names', async () => {
    const pack = makePack();
    const repo = tempDir('gm-game-');
    await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    write(pack, 'gm-extra/SKILL.md', '---\nname: gm-extra\n---\nextra\n');

    expect((await gm(['skills', 'sync', '--check'], { cwd: repo, env: { GM_SKILLS_DIR: pack } })).code).toBe(1);
    const sync = await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    expect(sync.out).toContain('installed gm-extra');
    expect(statSync(join(repo, '.codex/skills/gm-extra/SKILL.md')).isFile()).toBe(true);

    const list = await gm(['skills', 'list', '--limit', '3'], { cwd: repo, env: { GM_SKILLS_DIR: pack } });
    expect(list.code).toBe(0);
    expect(list.out).toContain('gm-core  0.0.0');
    expect(list.out).toContain('cameras  vendored');
    expect(list.out).not.toContain('gm-extra  0.0.0');
    expect(list.out.at(-1)).toBe('+1 more  (--limit 4)');
  });

  it('falls back to copies when symlinks are unavailable', async () => {
    const pack = makePack();
    const repo = tempDir('gm-game-');
    const unavailable = (): never => {
      throw Object.assign(new Error('links unavailable'), { code: 'EPERM' });
    };

    const result = syncSkillPack({ repoDir: repo, packDir: pack, createLink: unavailable });

    expect(result.changed).toBe(true);
    expect(lstatSync(join(repo, '.codex/skills/gm-core')).isSymbolicLink()).toBe(false);
    expect(statSync(join(repo, '.codex/skills/gm-core/SKILL.md')).isFile()).toBe(true);
    const lock = JSON.parse(readFileSync(join(repo, 'skills.lock'), 'utf8')) as SkillsLock;
    expect(lock.linkMode).toBe('copy');

    const before = statSync(join(repo, 'skills.lock')).mtimeMs;
    const again = syncSkillPack({ repoDir: repo, packDir: pack, createLink: unavailable });
    expect(again.changed).toBe(false);
    expect(statSync(join(repo, 'skills.lock')).mtimeMs).toBe(before);
  });

  it('does not create a lock when no pack can be located', async () => {
    const repo = tempDir('gm-game-');
    const result = await gm(['skills', 'sync'], { cwd: repo, env: { GM_SKILLS_DIR: join(repo, 'missing') } });
    expect(result.code).toBe(2);
    expect(existsSync(join(repo, 'skills.lock'))).toBe(false);
  });
});
