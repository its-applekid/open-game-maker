import { join } from 'node:path';

import type { Insets } from '@ogm/contracts/input';

import type { Check, GameText, TargetHit, ViewportSize } from '../types.js';
import { fail, pass, withSession } from './util.js';

export const STILL_VIEWPORTS: { name: string; size: ViewportSize }[] = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'ipad', size: { width: 1024, height: 768 } },
];
/** Status bar and home indicator; OGM-090 may pass device values later. */
export const SAFE_INSETS: Insets = { top: 24, right: 0, bottom: 20, left: 0 };
const SCAN_GRID = 24;

/** Ids of the players `renderGameToText` reports, wherever the game keeps them. */
export function playerIds(text: GameText): string[] {
  const state = text.state as { players?: unknown } | null;
  const lists = [text.players, state && typeof state === 'object' ? state.players : undefined];
  const ids = new Set<string>();
  for (const list of lists) {
    const items = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : [];
    for (const item of items) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return [...ids];
}

/** The centre of each player's picked cells, and whether it sits inside the safe rect. */
export function locatePlayers(
  hits: TargetHit[],
  players: string[],
  size: ViewportSize,
  safe: Insets,
): { id: string; nx: number; ny: number; inside: boolean }[] {
  const located = [];
  for (const id of players) {
    const mine = hits.filter((hit) => hit.id === id);
    if (mine.length === 0) continue;
    const nx = mine.reduce((sum, hit) => sum + hit.nx, 0) / mine.length;
    const ny = mine.reduce((sum, hit) => sum + hit.ny, 0) / mine.length;
    const inside =
      nx >= safe.left / size.width &&
      nx <= 1 - safe.right / size.width &&
      ny >= safe.top / size.height &&
      ny <= 1 - safe.bottom / size.height;
    located.push({ id, nx, ny, inside });
  }
  return located;
}

/** A4 §10.3 (7): desktop 16:9 and iPad 4:3 stills are not blank and the players sit inside the safe area. */
export const c07Stills: Check = {
  id: 'C7',
  name: 'stills-safe-area',
  async run(ctx) {
    const stills: string[] = [];
    const notes: string[] = [];
    for (const { name, size } of STILL_VIEWPORTS) {
      const problem = await withSession(ctx, { viewport: size, safe: SAFE_INSETS }, async (session) => {
        await session.advanceTime(500);
        const path = join(ctx.outDir, `still-${name}.png`);
        const { colours } = await session.still(path);
        stills.push(path);
        if (colours < 2) return `${name} still is a single colour`;
        const players = playerIds(await session.text());
        const located = locatePlayers(await session.scan(SCAN_GRID), players, size, SAFE_INSETS);
        const outside = located.find((player) => !player.inside);
        if (outside) {
          return `${name}: player ${outside.id} at (${outside.nx.toFixed(2)}, ${outside.ny.toFixed(2)}) is outside the safe area`;
        }
        notes.push(`${name} ${colours} colours, ${located.length}/${players.length} players located in the safe area`);
        return null;
      });
      if (problem) return fail(problem, stills);
    }
    return pass(notes.join('; '), stills);
  },
};
