// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readGamesOrigin } from '../tools/games-origin.mjs';

async function envDir(contents?: string, rooms?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ogm-web-env-'));
  if (contents !== undefined) await writeFile(join(dir, 'web.env'), contents);
  if (rooms !== undefined) await writeFile(join(dir, 'rooms.env'), rooms);
  return dir;
}

async function readFrom(contents?: string, rooms?: string): Promise<() => string> {
  const dir = await envDir(contents, rooms);
  return () => readGamesOrigin(dir);
}

function runCli(dir: string) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../tools/games-origin.mjs', import.meta.url))], {
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
});
