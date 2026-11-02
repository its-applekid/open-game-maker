// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readApiOrigin, readGamesOrigin } from '../tools/games-origin.mjs';

async function envDir(contents?: string, rooms?: string, api?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ogm-web-env-'));
  if (contents !== undefined) await writeFile(join(dir, 'web.env'), contents);
  if (rooms !== undefined) await writeFile(join(dir, 'rooms.env'), rooms);
  if (api !== undefined) await writeFile(join(dir, 'api.env'), api);
  return dir;
}

async function readFrom(contents?: string, rooms?: string): Promise<() => string> {
  const dir = await envDir(contents, rooms);
  return () => readGamesOrigin(dir);
}

function runCli(dir: string, tool = 'games-origin.mjs') {
  return spawnSync(process.execPath, [fileURLToPath(new URL(`../tools/${tool}`, import.meta.url))], {
    encoding: 'utf8',
    env: { OGM_ENV_DIR: dir },
  });
}

// deploy.sh must never fall back to the 127.0.0.1 default, which a phone cannot reach.
describe('deploy games origin', () => {
  it('reads the last VITE_GAMES_ORIGIN and nothing else', async () => {
    const read = await readFrom(
      'OTHER=secret\nVITE_GAMES_ORIGIN=https://old.example:1\nVITE_GAMES_ORIGIN="https://games.example:10000/"\n',
    );

    expect(read()).toBe('https://games.example:10000');
  });

  it('refuses a missing file or a blank value', async () => {
    expect(await readFrom()).toThrow(/web\.env is missing/);
    expect(await readFrom('VITE_GAMES_ORIGIN=\n')).toThrow(/not set/);
  });

  it('refuses an http origin or one with a path, which the deployed app cannot frame', async () => {
    expect(await readFrom('VITE_GAMES_ORIGIN=http://127.0.0.1:10000\n')).toThrow(/https origin/);
    expect(await readFrom('VITE_GAMES_ORIGIN=https://games.example/play\n')).toThrow(/https origin/);
    expect(await readFrom('VITE_GAMES_ORIGIN=games.example\n')).toThrow(/not a URL/);
  });

  it('never puts another line of the file into the error', async () => {
    const read = await readFrom('OGM_SECRET=do-not-print\n');

    expect(read).toThrow(/not set/);
    expect(read).not.toThrow(/do-not-print/);
  });

  it('refuses a web.env origin rooms would not accept draft URLs from', async () => {
    const web = 'VITE_GAMES_ORIGIN=https://games.example:10000\n';

    expect(await readFrom(web, 'OGM_GAMES_ORIGIN=https://new.example:10000\n')).toThrow(
      /differs from OGM_GAMES_ORIGIN/,
    );
    expect((await readFrom(web, 'OGM_GAMES_ORIGIN=https://games.example:10000/\n'))()).toBe(
      'https://games.example:10000',
    );
    expect((await readFrom(web, 'OGM_GAMES_ORIGIN=\n'))()).toBe('https://games.example:10000');
  });

  // deploy.sh captures stdout and relies on a non-zero exit to stop before building.
  it('prints only the origin from the command line, and fails loudly without one', async () => {
    const ok = runCli(await envDir('VITE_GAMES_ORIGIN=https://games.example:10000\n'));
    expect([ok.status, ok.stdout, ok.stderr]).toEqual([0, 'https://games.example:10000\n', '']);

    const missing = runCli(await envDir());
    expect([missing.status, missing.stdout]).toEqual([1, '']);
    expect(missing.stderr).toMatch(/^deploy: VITE_GAMES_ORIGIN is not set/);
  });

  // The guard only helps if deploy.sh calls it before building and hands its output to the build.
  it('stops deploy.sh before the build and bakes the origin into it', async () => {
    const script = fileURLToPath(new URL('../tools/deploy.sh', import.meta.url));
    const run = spawnSync('bash', [script, '--dry-run'], {
      encoding: 'utf8',
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, OGM_ENV_DIR: await envDir() },
    });

    expect([run.status, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toMatch(/^deploy: VITE_GAMES_ORIGIN is not set/);
    expect(readFileSync(script, 'utf8')).toContain(
      'VITE_GAMES_ORIGIN="$GAMES_ORIGIN" pnpm --dir "$ROOT" --filter @ogm/web build',
    );
  });
});

// The /api and /auth proxies are written at deploy time so the repo never names the host (#317).
describe('deploy API origin', () => {
  const games = 'VITE_GAMES_ORIGIN=https://games.example:10000\n';

  it('refuses a missing, http or pathed VITE_API_ORIGIN, which would ship an app that cannot sign in', async () => {
    for (const [contents, error] of [
      [games, /VITE_API_ORIGIN is not set/],
      [`${games}VITE_API_ORIGIN=http://api.example:8443\n`, /https origin/],
      [`${games}VITE_API_ORIGIN=https://api.example:8443/api\n`, /https origin/],
    ] as const) {
      const dir = await envDir(contents);
      expect(() => readApiOrigin(dir)).toThrow(error);
    }
  });

  it('refuses a web.env origin the API does not serve auth on', async () => {
    const web = `${games}VITE_API_ORIGIN=https://api.example:8443\n`;

    expect(() => readApiOrigin('/nonexistent')).toThrow(/web\.env is missing/);
    const stale = await envDir(web, undefined, 'OGM_PUBLIC_ORIGIN=https://old.example:8443\n');
    expect(() => readApiOrigin(stale)).toThrow(/differs from OGM_PUBLIC_ORIGIN/);
    const same = await envDir(web, undefined, 'OGM_PUBLIC_ORIGIN=https://api.example:8443/\n');
    expect(readApiOrigin(same)).toBe('https://api.example:8443');
  });

  it('prints the whole _redirects file from the command line, and fails loudly without an origin', async () => {
    const ok = runCli(await envDir(`${games}VITE_API_ORIGIN=https://api.example:8443\n`), 'redirects.mjs');
    expect([ok.status, ok.stderr]).toEqual([0, '']);
    expect(ok.stdout).toBe(
      '/api/*  https://api.example:8443/api/:splat  200\n/auth/*  https://api.example:8443/auth/:splat  200\n/*  /index.html  200\n',
    );

    const missing = runCli(await envDir(games), 'redirects.mjs');
    expect([missing.status, missing.stdout]).toEqual([1, '']);
    expect(missing.stderr).toMatch(/^deploy: VITE_API_ORIGIN is not set/);
  });

  it('stops deploy.sh before the build when the API origin is missing', async () => {
    const script = fileURLToPath(new URL('../tools/deploy.sh', import.meta.url));
    const run = spawnSync('bash', [script, '--dry-run'], {
      encoding: 'utf8',
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, OGM_ENV_DIR: await envDir(games) },
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^deploy: VITE_API_ORIGIN is not set/m);
  });
});
