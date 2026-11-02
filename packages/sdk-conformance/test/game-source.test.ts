import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadGame, loadPrevious, writeRunRecord } from '../src/game-source.js';

const template = fileURLToPath(new URL('../../../templates/game-2d', import.meta.url));

describe('game source', () => {
  it('reads controls, design and entity ids from the template module, and records them as a --previous', async () => {
    const work = mkdtempSync(join(tmpdir(), 'gm-sdk-source-'));
    const game = await loadGame(template, work);
    expect(game.manifest.id).toBe('game-2d');
    expect(game.controls.map((control) => control.id)).toEqual(['player.speed', 'level.width']);
    expect(game.entityIds).toContain('platform_01K8ZTEMP00000000000000003');

    const staleDesign = join(work, 'design', 'removed.json');
    mkdirSync(join(work, 'design'));
    writeFileSync(staleDesign, JSON.stringify({ entities: { removed: {} } }));
    await writeRunRecord(work, game);
    expect(existsSync(staleDesign)).toBe(false);
    const previous = await loadPrevious(work);
    expect(previous).toEqual({
      controlIds: ['player.speed', 'level.width'],
      entityIds: game.entityIds,
      save: undefined,
    });
  }, 60_000);
});
