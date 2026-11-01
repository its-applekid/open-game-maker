import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SKILLS = fileURLToPath(new URL('../../../skills/', import.meta.url));

function lines(name: string): string[] {
  return readFileSync(`${SKILLS}/${name}/SKILL.md`, 'utf8').trimEnd().split('\n');
}

describe('gm skill pack', () => {
  it('keeps gm-core short, sandbox-safe, and routed to every first-party skill', () => {
    const core = lines('gm-core');
    const text = core.join('\n');
    const firstParty = readdirSync(SKILLS)
      .filter((name) => name.startsWith('gm-'))
      .sort();

    expect(core.length).toBeLessThanOrEqual(120);
    for (const name of firstParty) expect(text).toContain(`| ${name} |`);
    for (const activity of [
      'asset_pipeline',
      'level_and_map_building',
      'gameplay_code',
      'animation_and_vfx',
      'audio',
      'ui_and_hud',
      'playtesting_and_verification',
      'deploy_and_release',
      'writing',
    ]) {
      expect(text).toContain(activity);
    }
    expect(text).toContain('gm check');
    expect(text).toContain('gm test');
    expect(text).toContain('gm run');
    expect(text).toContain('gm chat post');
    expect(text).toContain('<!-- gm-activity: <activity> start -->');
    expect(text).toContain('<!-- gm-activity: <activity> end -->');
    expect(text).not.toMatch(/assets-local|scripts\/assets|meta-improve|claude\.ai|sprite-forge|landing-page/i);
  });

  it('keeps gm-build short and makes offline installation the only install path', () => {
    const build = lines('gm-build');
    const text = build.join('\n');

    expect(build.length).toBeLessThanOrEqual(60);
    expect(text).toContain('pnpm install --offline --frozen-lockfile');
    expect(text).toContain('gm build');
    expect(text).toContain('ERR_PNPM_NO_OFFLINE_META');
    expect(text).toContain('package name, exact version, and reason');
    expect(text).toContain('Never run `npm install` or `pnpm add`');
  });
});
