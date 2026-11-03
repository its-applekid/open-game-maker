import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createAudio, songSchema, type BusName, type CueMetrics, type GmAudio } from '@gm/sdk/audio';
import { COMMANDS_DIR, checkSkill, loadCommands } from '@ogm/gm-cli';
import { getTransport } from 'tone';
import { describe, expect, it } from 'vitest';

const SKILL = fileURLToPath(new URL('./SKILL.md', import.meta.url));
const PRESETS = fileURLToPath(new URL('./references/zzfx-presets.md', import.meta.url));

const audioMethods = {
  context: 1,
  buses: 1,
  unlock: 1,
  status: 1,
  onStatus: 1,
  play: 1,
  playOneOf: 1,
  music: 1,
  zzfx: 1,
  song: 1,
  stop: 1,
  applySettings: 1,
  renderCue: 1,
  relay: 1,
  dispose: 1,
} satisfies Record<keyof GmAudio, 1>;
const sdkExports = {
  audio: { createAudio, songSchema },
  GmAudio: audioMethods,
  BusName: { music: 1, sfx: 1, amb: 1, voice: 1 } satisfies Record<BusName, 1>,
  CueMetrics: { peakDb: 1, rmsDb: 1 } satisfies Record<keyof CueMetrics, 1>,
  Tone: { getTransport },
};

describe('gm-audio skill', () => {
  it('stays short and teaches only live audio commands and contracts', async () => {
    const text = readFileSync(SKILL, 'utf8');
    const commands = new Set((await loadCommands(COMMANDS_DIR)).keys());
    const match = readFileSync(PRESETS, 'utf8').match(/```json\n([\s\S]+?)\n```/);
    const presets = JSON.parse(match?.[1] ?? 'null') as unknown;
    const presetValues = Object.values(presets as Record<string, unknown>);

    expect(text.trimEnd().split('\n').length).toBeLessThanOrEqual(80);
    expect(text).toContain('sdk.audio.createAudio({ rng })');
    expect(text).toContain('music|sfx|amb|voice');
    expect(text).toContain('pointerup` or `touchend');
    expect(text).toContain('vol: 0.45');
    expect(text).toContain('getTransport()');
    expect(text).toContain('`audio.relay`');
    expect(text).toContain('sound as `unchecked`');
    expect(checkSkill(SKILL, { commands, sdkExports })).toEqual({ commands: [], sdk: [] });
    expect(presets).toEqual(
      expect.objectContaining({
        confirm: expect.any(Array),
        pickup: expect.any(Array),
        jump: expect.any(Array),
        impact: expect.any(Array),
        explosion: expect.any(Array),
        powerUp: expect.any(Array),
      }),
    );
    expect(presetValues.length).toBeGreaterThanOrEqual(6);
    expect(presetValues.length).toBeLessThanOrEqual(10);
    expect(
      presetValues.every(
        (preset) => Array.isArray(preset) && preset.length > 0 && preset.every((value) => typeof value === 'number'),
      ),
    ).toBe(true);
  }, 30_000);
});
