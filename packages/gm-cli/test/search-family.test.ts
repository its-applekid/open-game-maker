import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gm, library, tempDir } from './helpers.js';

const ORC = 't1:kenney-mini-dungeon/character-orc@2.0';
const DRUMS = 't1:sidetrax-pack-60-battle/war-drums@v1';

/** A game repo whose lockfile records `family`, plus an events file. */
function game(family: string): { cwd: string; env: Record<string, string>; events: string } {
  const cwd = tempDir('gm-game-');
  writeFileSync(join(cwd, 'assets.lock.json'), JSON.stringify({ version: 1, family, pov: 'topdown', assets: [] }));
  const events = join(cwd, 'events.jsonl');
  return { cwd, env: { OGM_ASSETS_ROOT: library(), GM_EVENTS_FILE: events }, events };
}

const eventsIn = (file: string) =>
  readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { event: string; payload: Record<string, unknown> });

const rows = (out: string[]) => out.map((line) => line.split('  ')[0]);

describe('gm assets search in a game repo (R55 family default)', () => {
  it("hides another family's cards, keeps style-neutral ones, and logs nothing", async () => {
    const { cwd, env, events } = game('pixel-art');
    const orc = await gm(['assets', 'search', 'orc'], { cwd, env });
    expect(orc.code).toBe(0);
    expect(orc.out).toEqual([]);
    const drums = await gm(['assets', 'search', 'drums', '--use', 'vision-input'], { cwd, env });
    expect(rows(drums.out)).toContain(DRUMS);
    expect(eventsIn(events).map((line) => line.event)).toEqual(['assets.search', 'assets.search']);
  });

  it('--any-family --reason lifts the filter and writes one assets.family_exception with the reason', async () => {
    const { cwd, env, events } = game('pixel-art');
    const result = await gm(['assets', 'search', 'orc', '--any-family', '--reason', 'x'], { cwd, env });
    expect(rows(result.out)[0]).toBe(ORC);
    const exceptions = eventsIn(events).filter((line) => line.event === 'assets.family_exception');
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].payload).toEqual({ family: 'pixel-art', reason: 'x', query: 'orc' });
  });

  it('refuses --any-family without a reason', async () => {
    const { cwd, env } = game('pixel-art');
    const result = await gm(['assets', 'search', 'orc', '--any-family'], { cwd, env });
    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('--reason');
  });

  it('--family of another family is a lineup that needs a logged reason; the game family itself needs none', async () => {
    const { cwd, env, events } = game('pixel-art');
    const refused = await gm(['assets', 'search', 'orc', '--family', 'chunky-low-poly'], { cwd, env });
    expect(refused.code).toBe(2);
    expect(refused.err[0]).toContain('--reason');

    const lineup = await gm(['assets', 'search', 'orc', '--family', 'chunky-low-poly', '--reason', 'lineup'], {
      cwd,
      env,
    });
    expect(rows(lineup.out)[0]).toBe(ORC);
    const same = await gm(['assets', 'search', 'tile', '--family', 'pixel-art'], { cwd, env });
    expect(same.code).toBe(0);
    const exceptions = eventsIn(events).filter((line) => line.event === 'assets.family_exception');
    expect(exceptions.map((line) => line.payload)).toEqual([{ family: 'pixel-art', reason: 'lineup', query: 'orc' }]);
  });

  it('refuses a lockfile that is not JSON or has no family instead of searching every family', async () => {
    const { cwd, env } = game('pixel-art');
    writeFileSync(join(cwd, 'assets.lock.json'), JSON.stringify({ version: 1, pov: 'topdown', assets: [] }));
    const missing = await gm(['assets', 'search', 'orc'], { cwd, env });
    expect(missing.code).toBe(2);
    expect(missing.err[0]).toContain('no style family');
    writeFileSync(join(cwd, 'assets.lock.json'), '{ not json');
    expect((await gm(['assets', 'search', 'orc'], { cwd, env })).code).toBe(2);
  });

  it('applies no default without a lockfile', async () => {
    const events = join(tempDir(), 'events.jsonl');
    const env = { OGM_ASSETS_ROOT: library(), GM_EVENTS_FILE: events };
    const result = await gm(['assets', 'search', 'orc'], { env });
    expect(rows(result.out)[0]).toBe(ORC);
    const withFlag = await gm(['assets', 'search', 'orc', '--any-family', '--reason', 'x'], { env });
    expect(rows(withFlag.out)[0]).toBe(ORC);
    expect(eventsIn(events).map((line) => line.event)).toEqual(['assets.search', 'assets.search']);
  });
});
