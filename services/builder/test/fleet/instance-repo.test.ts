import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { renderDaemonFiles } from '@ogm/game-repo-template';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { buildFleet, cleanupHomes, memoryStore, tempHome } from './helpers.js';

const run = promisify(execFile);

afterEach(cleanupHomes);

// The ticket's "done when": two daemons on one instance repo each build their own game without touching the other's
// folder. These tests render the real daemon files and drive the real hook script against a git fixture repo.
const INSTANCE_REPO = 'everdred-games/instance';
const GAMES = ['castle-run', 'space-castle'] as const;
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, env: gitEnv() });
  return stdout;
}

// A daemon's hook runs as its own systemd unit, not inside an agent workspace's shell guard, so the test hands it a
// PATH without one. On a plain runner this is the inherited environment unchanged.
function gitEnv(): NodeJS.ProcessEnv {
  const PATH = (process.env.PATH ?? '')
    .split(':')
    .filter((entry) => !entry.includes('.aiur-runtime/bin'))
    .join(':');
  return { ...process.env, PATH, BASH_ENV: '' };
}

// A fixture instance repo shaped like the real one: one folder per game plus the shared packages and root config.
async function fixtureInstanceRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ogm-instance-repo-'));
  scratch.push(root);
  for (const game of GAMES) {
    await mkdir(join(root, 'games', game), { recursive: true });
    await writeFile(join(root, 'games', game, 'README.md'), `${game}\n`);
  }
  await mkdir(join(root, 'packages', 'shared'), { recursive: true });
  await writeFile(join(root, 'packages', 'shared', 'package.json'), '{ "name": "@ogm/shared" }\n');
  await writeFile(join(root, 'package.json'), '{ "name": "instance", "private": true }\n');
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'games/*'\n  - 'packages/*'\n");
  await git(root, 'init', '--quiet', '--initial-branch=main');
  await git(root, 'config', 'user.email', 'agent@example.test');
  await git(root, 'config', 'user.name', 'OGM Agent');
  await git(root, 'add', '--all');
  await git(root, 'commit', '--quiet', '-m', 'instance repo');
  return root;
}

// Runs the rendered `after_create` block in a fresh daemon workspace with the environment aiur gives a daemon. The
// script file lives outside the workspace so `git clone ... .` still sees an empty directory.
async function runAfterCreate(hook: string, workspace: string, repoPath: string): Promise<void> {
  const afterCreate = parse(hook).after_create as string;
  expect(afterCreate).toContain('git clone');
  const script = join(workspace, 'after-create.sh');
  await writeFile(script, afterCreate, { mode: 0o700 });
  await run('bash', [script], {
    cwd: join(workspace, 'checkout'),
    env: {
      ...gitEnv(),
      HOME: workspace,
      THIS_REPOSITORY_URL: repoPath,
      THIS_BASE_BRANCH: 'main',
      AIUR_HOOK_TICKET_IDENTIFIER: '12',
      AIUR_TICKET_BRANCH: 'aiur/12-castle-run',
      // The bundle fetch fails closed without a secret; the hook records that and carries on.
      OGM_HOOK_SECRET_FILE: join(workspace, 'no-hook-secret'),
      OGM_INTERNAL_URL: 'http://127.0.0.1:1',
    },
  });
}

describe('two daemons on one instance repo', () => {
  it('renders one daemon per game with its own unit, directory, label prefix and sparse paths', async () => {
    const home = await tempHome();
    const store = memoryStore();
    const { fleet } = buildFleet(home, { store, preflight: async () => ({ ok: true as const }) });

    for (const game of GAMES) {
      await expect(fleet.ensureDaemon({ slug: game, repo: INSTANCE_REPO }, 'feature')).resolves.toMatchObject({
        status: 'running',
      });
    }

    const rows = [...store.rows.values()];
    expect(rows.map((row) => [row.slug, row.repo])).toEqual(GAMES.map((game) => [game, INSTANCE_REPO]));
    expect(new Set(rows.map((row) => row.unit)).size).toBe(2);
    expect(new Set(rows.map((row) => row.checkoutPath)).size).toBe(2);
    expect(new Set(rows.map((row) => row.port)).size).toBe(2);

    for (const game of GAMES) {
      const dir = join(home, '.local/share/ogm/daemons', game);
      const config = parse(await readFile(join(dir, '.aiur/config'), 'utf8'));
      expect(config.tracker.github).toMatchObject({ repo: INSTANCE_REPO, label_prefix: game });
      expect(config.instance.id).toBe(game);

      const hook = await readFile(join(dir, '.aiur/hooks'), 'utf8');
      expect(hook).toContain('git clone --sparse --filter=blob:none "$THIS_REPOSITORY_URL" .');
      expect(hook).toContain(`git sparse-checkout set games/${game} packages`);

      const prompt = await readFile(join(dir, '.aiur/prompt.md'), 'utf8');
      expect(prompt).toContain(`games/${game}/`);
      expect(prompt).toContain('open a separate');
      for (const other of GAMES.filter((candidate) => candidate !== game)) {
        expect(prompt).not.toContain(`games/${other}/`);
      }
    }
  });

  it('checks each game out sparsely so neither daemon sees the other game folder', async () => {
    const repoPath = await fixtureInstanceRepo();
    const workspace = await mkdtemp(join(tmpdir(), 'ogm-daemon-workspace-'));
    scratch.push(workspace);
    await mkdir(join(workspace, 'checkout'), { recursive: true });

    for (const game of GAMES) {
      await runAfterCreate(renderDaemonFiles({ gameSlug: game }).hooks, workspace, repoPath);
      const checkout = join(workspace, 'checkout');

      // Its own game and the shared roots are checked out; every other game's folder is absent.
      expect((await git(checkout, 'sparse-checkout', 'list')).trim().split('\n').sort()).toEqual(
        [`games/${game}`, 'packages'].sort(),
      );
      expect(await readFile(join(checkout, 'games', game, 'README.md'), 'utf8')).toBe(`${game}\n`);
      expect(await readFile(join(checkout, 'packages', 'shared', 'package.json'), 'utf8')).toContain('@ogm/shared');
      expect(await readFile(join(checkout, 'package.json'), 'utf8')).toContain('"instance"');
      for (const other of GAMES.filter((candidate) => candidate !== game)) {
        await expect(readFile(join(checkout, 'games', other, 'README.md'), 'utf8')).rejects.toThrow();
      }

      // The daemon's branch is named for the ticket and starts from the configured base branch.
      expect((await git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD')).trim()).toBe('aiur/12-castle-run');

      // Re-running for the next game starts from an empty directory, as a new daemon workspace would.
      await rm(checkout, { recursive: true, force: true });
      await mkdir(checkout);
    }
  });
});
