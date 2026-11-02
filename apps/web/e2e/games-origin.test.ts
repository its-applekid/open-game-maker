// @vitest-environment node
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readGamesOrigin } from '../tools/games-origin.mjs';

async function envDir(contents?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ogm-web-env-'));
  if (contents !== undefined) await writeFile(join(dir, 'web.env'), contents);
  return dir;
}

async function readFrom(contents?: string): Promise<() => string> {
  const dir = await envDir(contents);
  return () => readGamesOrigin(dir);
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
});
