import { describe, expect, it } from 'vitest';

import { readSettings } from '../src/config.js';

const VALID = {
  OGM_CORE_BUMP_REPOS: 'its-everdred/open-games, acme/games',
  OGM_CORE_BUMP_CORE_REPO: 'its-everdred/open-game-maker',
  GITHUB_APP_ID: '1234',
  GITHUB_APP_INSTALLATION_ID: '5678',
  GITHUB_APP_PRIVATE_KEY_PATH: '/home/<user>/.config/ogm/app.pem',
};

describe('readSettings', () => {
  it('reads the instance list, the core repository and the App credentials', () => {
    const settings = readSettings(VALID);

    expect(settings.repos).toEqual(['its-everdred/open-games', 'acme/games']);
    expect(settings.coreRepo).toBe('its-everdred/open-game-maker');
    expect(settings.coreBranch).toBe('main');
    expect(settings.auth).toEqual({
      appId: '1234',
      installationId: '5678',
      privateKeyPath: '/home/<user>/.config/ogm/app.pem',
    });
  });

  it('defaults the work directory and the core branch', () => {
    const settings = readSettings(VALID);

    expect(settings.coreBranch).toBe('main');
    expect(settings.workDir.endsWith('/.local/state/ogm/core-bump')).toBe(true);
  });

  it('takes an explicit branch and work directory', () => {
    const settings = readSettings({
      ...VALID,
      OGM_CORE_BUMP_CORE_BRANCH: 'release',
      OGM_CORE_BUMP_WORK_DIR: '/srv/core-bump',
    });

    expect(settings.coreBranch).toBe('release');
    expect(settings.workDir).toBe('/srv/core-bump');
  });

  it('refuses an empty instance list', () => {
    expect(() => readSettings({ ...VALID, OGM_CORE_BUMP_REPOS: ' , ' })).toThrow(
      /OGM_CORE_BUMP_REPOS names no instance repository/,
    );
  });

  it('refuses a repository that is not owner/name', () => {
    expect(() => readSettings({ ...VALID, OGM_CORE_BUMP_REPOS: 'open-games' })).toThrow(
      /invalid owner\/repository: open-games/,
    );
  });

  it('refuses a core repository that is not owner/name', () => {
    expect(() => readSettings({ ...VALID, OGM_CORE_BUMP_CORE_REPO: 'nope' })).toThrow(
      /OGM_CORE_BUMP_CORE_REPO is not owner\/repository/,
    );
  });

  it('refuses to run without the App credentials', () => {
    const { GITHUB_APP_ID: _unused, ...withoutApp } = VALID;

    expect(() => readSettings(withoutApp)).toThrow(/GITHUB_APP_ID/);
  });
});
