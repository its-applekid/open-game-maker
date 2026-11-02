import { describe, expect, it } from 'vitest';

import { loadCommitConfig } from '../src/config.js';
import { parseRepository } from '../src/platform-repo.js';

describe('parseRepository', () => {
  it('accepts one fixed owner/repository pair', () => {
    expect(parseRepository('its-everdred/open-game-maker-2000')).toEqual({
      owner: 'its-everdred',
      name: 'open-game-maker-2000',
    });
  });

  it.each(['repo', 'owner/repo/extra', '/repo', 'owner/../repo', 'owner/..'])('rejects %s', (value) => {
    expect(() => parseRepository(value)).toThrow('OGM_PLATFORM_ISSUE_REPO');
  });
});

describe('loadCommitConfig', () => {
  const base = {
    OGM_COMMIT_PORT: '4301',
    OGM_COMMIT_SERVICE_TOKEN: 'c'.repeat(32),
    OGM_INTERNAL_TOKEN: 'i'.repeat(32),
    OGM_DATA_DIR: '/var/lib/ogm',
    OGM_API_INTERNAL_URL: 'http://127.0.0.1:4300',
    OGM_PLATFORM_ISSUE_REPO: 'platform/issues',
    GITHUB_APP_ID: '123',
    GITHUB_APP_PRIVATE_KEY_PATH: '/run/ogm/app.pem',
    OGM_BUILDER_BOT_LOGIN: 'ogm-builder',
  };

  it('defaults the blocklist under the data directory and leaves webhooks optional', () => {
    expect(loadCommitConfig(base)).toMatchObject({
      internalToken: 'i'.repeat(32),
      blocklistFile: '/var/lib/ogm/blocklist.txt',
      githubWebhookSecret: undefined,
    });
  });

  it('accepts explicit blocklist and webhook settings', () => {
    expect(loadCommitConfig({
      ...base,
      OGM_BLOCKLIST_FILE: '/srv/ogm/blocked.txt',
      OGM_GITHUB_WEBHOOK_SECRET: 'w'.repeat(32),
    })).toMatchObject({
      blocklistFile: '/srv/ogm/blocked.txt',
      githubWebhookSecret: 'w'.repeat(32),
    });
  });
});
