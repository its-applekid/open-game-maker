import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { profileHash, renderCodexProfile } from '../../src/policy/profile.js';
import { workedInput } from './fixtures.js';

describe('renderCodexProfile', () => {
  it('emits one deny rule for each credential root using the supported Codex syntax', () => {
    const profile = renderCodexProfile(workedInput);

    for (const path of [
      `${homedir()}/.config/gh`,
      `${homedir()}/.aiur/github-budget`,
      `${homedir()}/.codex/auth.json`,
      `${homedir()}/.claude`,
      `${homedir()}/.claude-2`,
      `${homedir()}/.config/ogm`,
      `${homedir()}/.config/netlify`,
      `${homedir()}/.ssh`,
      `${homedir()}/.aiur/.env`,
      '/home/orangekid/games/open-game-maker-2000/assets-local',
      '/home/orangekid/.local/share/ogm/daemons/other-game/workspaces',
    ]) {
      expect(profile.match(new RegExp(`${escapeRegex(JSON.stringify(path))} = "deny"`, 'g'))).toHaveLength(1);
    }

    expect(profile).toContain('default_permissions = "gamebuilder"');
    expect(profile).toContain('extends = ":workspace"');
    expect(profile).toContain('":slash_tmp" = "deny"');
    expect(profile).not.toContain('deny_read =');
    expect(profile).not.toContain('secret_file =');
  });

  it('keeps secret-named caller env vars out of sandboxed commands', () => {
    const profile = renderCodexProfile(workedInput);

    expect(profile).toContain('[shell_environment_policy]\ninherit = "core"\nignore_default_excludes = false\n');
  });

  it('omits concrete deny roots that would cover the daemon workspace', () => {
    const profile = renderCodexProfile({
      ...workedInput,
      denyReadRoots: [workedInput.workspaceRoot, `${workedInput.workspaceRoot}/private`],
    });

    expect(profile).not.toContain(JSON.stringify(workedInput.workspaceRoot));
    expect(profile).not.toContain(JSON.stringify(`${workedInput.workspaceRoot}/private`));
  });

  it('rejects a deny glob that also matches the active workspace', () => {
    expect(() =>
      renderCodexProfile({
        ...workedInput,
        denyReadRoots: ['/home/orangekid/.local/share/ogm/daemons/*/workspaces'],
      }),
    ).toThrow('denyReadRoots globs must not match workspaceRoot; enumerate other workspaces');
  });

  it('produces a stable SHA-256 hash', () => {
    const first = renderCodexProfile(workedInput);
    const second = renderCodexProfile(workedInput);

    expect(profileHash(first)).toBe(profileHash(second));
    expect(profileHash(first)).toMatch(/^[a-f0-9]{64}$/);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
