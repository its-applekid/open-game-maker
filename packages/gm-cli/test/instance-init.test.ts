import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { copyWorkspacePackageClosure } from '../../../tools/skills/eval/workspace.js';
import { gm, tempDir } from './helpers.js';

function write(root: string, path: string, body: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
}

function runPnpm(cwd: string, ...args: string[]): string {
  const result = spawnSync('pnpm', args, { cwd, encoding: 'utf8' });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  return `${result.stdout}${result.stderr}`;
}

describe('gm instance init', () => {
  it('writes the instance template into a new directory', async () => {
    const cwd = tempDir('gm-instance-init-');
    const destination = join(cwd, 'instance');

    const result = await gm(['instance', 'init', destination], { cwd });

    expect(result).toEqual({
      code: 0,
      err: [],
      out: [`initialized ${destination}. Next: cd ${destination} && pnpm install`],
    });
    expect(JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))).toMatchObject({ private: true });
    expect(readFileSync(join(destination, 'pnpm-workspace.yaml'), 'utf8')).toContain("'games/*'");
    expect(existsSync(join(destination, 'games/README.md'))).toBe(true);
    expect(existsSync(join(destination, 'packages/README.md'))).toBe(true);
  });

  it('accepts an existing empty directory and refuses a non-empty one', async () => {
    const cwd = tempDir('gm-instance-empty-');
    const empty = join(cwd, 'empty');
    const occupied = join(cwd, 'occupied');
    mkdirSync(empty);
    mkdirSync(occupied);
    writeFileSync(join(occupied, 'keep.txt'), 'keep\n');

    expect(await gm(['instance', 'init', empty], { cwd })).toMatchObject({ code: 0, err: [] });
    const refused = await gm(['instance', 'init', occupied], { cwd });
    expect(refused.code).toBe(2);
    expect(refused.err).toEqual([`destination is not empty: ${occupied}. Try: choose an empty directory`]);
    expect(readFileSync(join(occupied, 'keep.txt'), 'utf8')).toBe('keep\n');
  });

  it('installs, typechecks, tests, and builds two games with an instance package', async () => {
    const cwd = tempDir('gm-instance-smoke-');
    const instance = join(cwd, 'instance');
    expect(await gm(['instance', 'init', instance], { cwd })).toMatchObject({ code: 0, err: [] });

    write(
      instance,
      'packages/shared/package.json',
      '{"name":"@instance/shared","version":"0.0.0","private":true,"type":"module","exports":{"types":"./index.d.ts","default":"./index.js"}}\n',
    );
    write(instance, 'packages/shared/index.js', "export const shared = 'ready';\n");
    write(instance, 'packages/shared/index.d.ts', "export declare const shared: 'ready';\n");

    expect(await gm(['new', 'game-2d', 'first-game'], { cwd: instance })).toMatchObject({
      code: 0,
      err: [],
    });
    expect(await gm(['new', 'game-3d', 'second-game'], { cwd: instance })).toMatchObject({
      code: 0,
      err: [],
    });

    const games = ['first-game', 'second-game'].map((slug) => join(instance, 'games', slug));
    expect(JSON.parse(readFileSync(join(games[0]!, 'package.json'), 'utf8')).devDependencies).toMatchObject({
      '@types/node': '26.6.6',
      typescript: '6.0.3',
    });
    for (const game of games) {
      const manifestPath = join(game, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies: Record<string, string>;
      };
      manifest.dependencies['@instance/shared'] = 'workspace:*';
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      write(
        game,
        'tests/instance-shared.test.ts',
        "import { expect, it } from 'vitest';\nimport { shared } from '@instance/shared';\nit('uses the instance package', () => expect(shared).toBe('ready'));\n",
      );
    }
    copyWorkspacePackageClosure(
      join(instance, 'packages'),
      games.map((game) => join(game, 'package.json')),
    );

    runPnpm(
      instance,
      '--store-dir',
      join(tmpdir(), 'gm-instance-pnpm-store'),
      'install',
      '--prefer-offline',
      '--no-frozen-lockfile',
    );
    for (const command of ['typecheck', 'test', 'build']) {
      const output = runPnpm(instance, command);
      expect(output).toContain('games/first-game');
      expect(output).toContain('games/second-game');
    }
  }, 420_000);
});
