import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { serve } from '@hono/node-server';
import { renderDaemonFiles } from '@ogm/game-repo-template';
import { describe, expect, it } from 'vitest';

import { publishStaged } from '../../src/builds/publish.js';
import { builtFiles, completeRun, gamesHost, ids, jobState, SECRET, TICKET, world } from './fixtures.js';

// aiur daemons run hooks with plain git; drop an agent workspace's git guard from PATH.
const HOOK_PATH = (env.PATH ?? '')
  .split(':')
  .filter((dir) => !dir.includes('/.aiur-runtime/'))
  .join(':');

// The `before_remove` block of the rendered hooks file, unindented.
function beforeRemove(): string {
  const [, block = ''] = renderDaemonFiles().hooks.split('before_remove: |\n');
  return block.replace(/^ {2}/gmu, '');
}

// A workspace as the agent leaves it: a committed game repo whose sandboxed `gm build` wrote dist/.
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'ogm-hook-build-ws-'));
  const built = builtFiles();
  mkdirSync(join(dir, 'dist'));
  cpSync(join(built, 'index.html'), join(dir, 'dist', 'index.html'));
  cpSync(join(built, 'assets'), join(dir, 'dist', 'assets'), { recursive: true });
  cpSync(join(built, 'manifest.json'), join(dir, 'manifest.json'));
  cpSync(join(built, 'design'), join(dir, 'design'), { recursive: true });
  writeFileSync(join(dir, '.gitignore'), 'dist/\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'aiur/12');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'double jump');
  return { dir, sha: git('rev-parse', 'HEAD') };
}

async function runHook(cwd: string, api: string) {
  const secretFile = join(mkdtempSync(join(tmpdir(), 'ogm-hook-secret-')), 'hook-secret');
  writeFileSync(secretFile, SECRET);
  const child = spawn('bash', ['-c', beforeRemove()], {
    cwd,
    env: {
      PATH: HOOK_PATH,
      HOME: cwd,
      AIUR_HOOK_TICKET_IDENTIFIER: TICKET,
      OGM_HOOK_SECRET_FILE: secretFile,
      OGM_INTERNAL_URL: api,
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { status, stderr };
}

async function serveApi(app: ReturnType<typeof world>['app']) {
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('before_remove hook to a playable build', () => {
  it('uploads the merged workspace build, which the API publishes and the games host serves', async () => {
    const { deps, app } = world();
    const api = await serveApi(app);
    const { dir, sha } = workspace();
    try {
      const hook = await runHook(dir, api.base);
      expect(hook.stderr).not.toMatch(/curl|tar|error/i);
      expect(hook.status).toBe(0);
      expect(jobState(deps)).toBe('running');

      // The feed then reports the merge; main.ts hands the job to the publisher.
      completeRun(deps);
      const outcome = await publishStaged(deps, ids.job);
      expect(outcome).toMatchObject({ state: 'done' });
      const buildId = outcome?.state === 'done' ? outcome.buildId : '';
      const row = deps.sqlite
        .prepare<[string], { git_sha: string; status: string }>('SELECT git_sha, status FROM builds WHERE id = ?')
        .get(buildId);
      expect(row).toEqual({ git_sha: sha, status: 'tested' });

      const host = await gamesHost(deps.config.gamesRoot);
      try {
        const page = await fetch(`${host.base}/g/${ids.game}/${buildId}/`);
        expect(page.status).toBe(200);
        expect(await page.text()).toContain('<title>Fixture</title>');
      } finally {
        await host.close();
      }
    } finally {
      await api.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never uploads a dist that is a link out of the workspace', async () => {
    const { deps, app } = world();
    const api = await serveApi(app);
    const { dir } = workspace();
    const outside = builtFiles();
    rmSync(join(dir, 'dist'), { recursive: true });
    execFileSync('ln', ['-s', outside, join(dir, 'dist')]);
    try {
      expect((await runHook(dir, api.base)).status).toBe(0);
      completeRun(deps);
      expect(await publishStaged(deps, ids.job)).toBeNull();
      expect(jobState(deps)).toBe('running');
    } finally {
      await api.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
