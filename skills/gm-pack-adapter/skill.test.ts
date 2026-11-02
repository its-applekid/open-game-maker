import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineFeature, FixedClock } from '@gm/sdk/core';
import { COMMANDS_DIR, loadCommands } from '@ogm/gm-cli';
import { describe, expect, it } from 'vitest';

const SKILLS = dirname(dirname(fileURLToPath(import.meta.url)));
const skillNames = ['gm-pack-adapter', 'gm-set-smallscaleint', 'gm-set-kaykit', 'gm-set-limezu-modern'] as const;
const commandNames = ['assets info', 'assets search', 'assets sheet', 'docs pattern', 'new', 'skills sync'] as const;

function skillText(name: (typeof skillNames)[number]): string {
  return readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
}

function missingCommands(text: string, commands: readonly string[]): string[] {
  return commands.filter((command) => !text.includes(`gm ${command}`));
}

describe('pack layer skills', () => {
  it('stay short and name only registered gm commands', async () => {
    const registry = await loadCommands(COMMANDS_DIR);
    const text = skillNames.map(skillText).join('\n');

    expect(skillText('gm-pack-adapter').trimEnd().split('\n').length).toBeLessThanOrEqual(60);
    for (const name of skillNames.filter((name) => name.startsWith('gm-set-'))) {
      expect(skillText(name).trimEnd().split('\n').length).toBeLessThanOrEqual(60);
    }
    for (const command of commandNames) expect(registry.has(command)).toBe(true);
    expect(missingCommands(text, commandNames)).toEqual([]);
    const commandFixture = commandNames.map((command) => `gm ${command}`).join('\n');
    expect(missingCommands(commandFixture.replace('gm assets info', 'gm assets inspect'), commandNames)).toContain(
      'assets info',
    );
  }, 20_000);

  it('keeps named SDK identifiers live', () => {
    expect(typeof FixedClock).toBe('function');
    expect(typeof defineFeature).toBe('function');
    expect(skillText('gm-pack-adapter')).toContain('`FixedClock`');
    expect(skillText('gm-pack-adapter')).toContain('`defineFeature`');
  });
});
