import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BadId, buildDir, isComplete, markComplete, resolveFile } from '../src/layout.js';

describe('games-host layout', () => {
  let root: string;
  let build: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ogm-games-layout-'));
    build = join(root, 'demo', 'b1');
    await mkdir(join(build, 'assets'), { recursive: true });
    await writeFile(join(build, 'index.html'), '<h1>demo</h1>');
    await writeFile(join(build, 'assets', 'x.webp'), 'webp');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('builds paths only from valid ids', () => {
    expect(buildDir(root, 'demo', 'b1')).toBe(join(root, 'demo', 'b1'));
    expect(buildDir(root, 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV', 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ')).toBe(
      join(root, 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV', 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ'),
    );
    expect(buildDir(root, 'game2_01ARZ3NDEKTSV4RRFFQ69G5FAV', '01BX5ZZKBKACTAV9WEVGEMMVRZ')).toBe(
      join(root, 'game2_01ARZ3NDEKTSV4RRFFQ69G5FAV', '01BX5ZZKBKACTAV9WEVGEMMVRZ'),
    );

    /* Uppercase is allowed only in the exact ULID shape: no ULID past 7ZZZ…, no uppercase prefix. */
    for (const id of [
      'Demo',
      '..',
      `a${'b'.repeat(64)}`,
      'b_81ARZ3NDEKTSV4RRFFQ69G5FAV',
      'B_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ]) {
      expect(() => buildDir(root, id, 'b1')).toThrow(BadId);
      expect(() => buildDir(root, 'demo', id)).toThrow(BadId);
    }
  });

  it('resolves files within the build and defaults to index.html', async () => {
    await expect(resolveFile(build, '')).resolves.toBe(resolve(build, 'index.html'));
    await expect(resolveFile(build, '/')).resolves.toBe(resolve(build, 'index.html'));
    await expect(resolveFile(build, 'assets/x.webp')).resolves.toBe(resolve(build, 'assets/x.webp'));
  });

  it.each([
    '../index.html',
    '%2e%2e/x',
    '%E0%A4%A',
    'assets/../../x',
    '/etc/passwd',
    'assets\\x.webp',
    'assets//x.webp',
  ])('rejects unsafe path %s', async (unsafePath) => {
    await expect(resolveFile(build, unsafePath)).resolves.toBeNull();
  });

  it('rejects symlinks that escape the build directory', async () => {
    const outside = join(root, 'outside.txt');
    await writeFile(outside, 'outside');
    await symlink(outside, join(build, 'assets', 'escape.txt'));

    await expect(resolveFile(build, 'assets/escape.txt')).resolves.toBeNull();
  });

  it('marks a build complete only after writing a durable marker', async () => {
    await expect(isComplete(build)).resolves.toBe(false);

    await markComplete(build);

    await expect(isComplete(build)).resolves.toBe(true);
    const marker = await readFile(join(build, '.complete'), 'utf8');
    expect(Number.isNaN(Date.parse(marker.trim()))).toBe(false);
  });
});
