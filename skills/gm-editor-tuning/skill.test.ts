import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { COMMANDS_DIR, checkSkill, loadCommands } from '@ogm/gm-cli';
import { controlDeclSchema, type GameInstance, type GameModule } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

const SKILL = fileURLToPath(new URL('./SKILL.md', import.meta.url));
const OUTCOMES = fileURLToPath(new URL('./references/tune-by-outcome.md', import.meta.url));

const sdkExports = {
  ControlDecl: controlDeclSchema.shape,
  GameModule: { controls: 1 } satisfies Pick<Record<keyof GameModule<unknown, unknown>, 1>, 'controls'>,
  GameInstance: { applyDesign: 1 } satisfies Pick<Record<keyof GameInstance<unknown, unknown>, 1>, 'applyDesign'>,
};

describe('gm-editor-tuning skill', () => {
  it('stays short and teaches the live editor contracts', async () => {
    const text = readFileSync(SKILL, 'utf8');
    const outcomes = readFileSync(OUTCOMES, 'utf8');
    const commands = new Set((await loadCommands(COMMANDS_DIR)).keys());
    const outcomeRows = outcomes.split('\n').filter((line) => /^\| `[^`]+` \|/.test(line));

    expect(text.trimEnd().split('\n').length).toBeLessThanOrEqual(80);
    expect(text).toContain('`src/tunables.ts`');
    expect(text).toContain('`GameModule.controls`');
    expect(text).toContain('`manifest.controls`');
    expect(text).toContain('`ControlDecl`');
    expect(text).toContain('`GameInstance.applyDesign`');
    expect(text).toContain("`'live'`");
    expect(text).toContain("`'restart-scene'`");
    expect(text).toContain('Adapters consume those game-owned values');
    expect(text).toContain('Never ship lil-gui');
    expect(outcomeRows.length).toBeGreaterThanOrEqual(8);
    expect(outcomes).toContain('| `jump feels floaty` | Lower `apexSeconds`. |');
    expect(outcomes).not.toMatch(/\b\d+(?:\.\d+)?\b/);
    expect(checkSkill(SKILL, { commands, sdkExports })).toEqual({ commands: [], sdk: [] });
  }, 30_000);
});
