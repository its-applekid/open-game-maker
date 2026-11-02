import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { COMMANDS_DIR, checkSkill, loadCommands } from '@ogm/gm-cli';
import { InputFrameSchema, hudModelSchema, type MultiplayerHooks } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

const SKILL = fileURLToPath(new URL('./SKILL.md', import.meta.url));
const RECIPE = fileURLToPath(new URL('./references/convert-single-to-multiplayer.md', import.meta.url));
const hooks = {
  spawn: true,
  despawn: true,
  snapshot: true,
  applySnapshot: true,
  hud: true,
} satisfies Record<keyof MultiplayerHooks, true>;
const sdkExports = { InputFrame: InputFrameSchema.shape, HudModel: hudModelSchema, MultiplayerHooks: hooks };

/* T07 §4.4, verbatim: the skill is the only place agents read these rules, so a paraphrase is a regression. */
const RULES = [
  'Input never mutates the world directly: it becomes an `InputFrame` consumed by `applyInput(playerIndex, frame)` in the fixed step.',
  'All per-player state lives in `players: Map<playerIndex, PlayerState>`; no singleton `player`.',
  'Entity ids are host-minted, globally unique strings; never array positions or per-session counters.',
  'Spawn points are design data (`design/spawns.json`), at least `maxPlayers` of them.',
  'The host is authoritative; peers render snapshots and send inputs only; game logic never assumes a server.',
  '`serializeSnapshot()/applySnapshot()` cover everything visible; transient effects are derived, not synced.',
  'HUD reads `players.get(localPlayerIndex)`; camera rig follows the local avatar.',
  '`tick(seconds)` and `render_game_to_text()` work with `players.length ≥ 2`.',
];

describe('gm-multiplayer-ready skill', () => {
  it('stays within 120 lines and carries the eight rules verbatim', () => {
    const text = readFileSync(SKILL, 'utf8');
    const flat = text.replace(/\n {3}/g, ' ');

    expect(text.trimEnd().split('\n').length).toBeLessThanOrEqual(120);
    RULES.forEach((rule, index) => expect(flat).toContain(`${index + 1}. ${rule}`));
    expect(text).not.toMatch(/server is authoritative/i);
  });

  it('names only registered gm commands and real contract names', async () => {
    const commands = new Set((await loadCommands(COMMANDS_DIR)).keys());

    expect(checkSkill(SKILL, { commands, sdkExports })).toEqual({ commands: [], sdk: [] });
    expect(checkSkill(RECIPE, { commands, sdkExports })).toEqual({ commands: [], sdk: [] });
  }, 30_000);
});
