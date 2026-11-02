import { join } from 'node:path';

import { loadEnv } from '@ogm/config';

import { parseRepository } from './platform-repo.js';

const commitSpec = {
  OGM_COMMIT_PORT: { kind: 'port' },
  OGM_COMMIT_SERVICE_TOKEN: { kind: 'secret' },
  OGM_INTERNAL_TOKEN: { kind: 'secret' },
  OGM_DATA_DIR: { kind: 'path' },
  OGM_BLOCKLIST_FILE: { kind: 'path', required: false },
  OGM_API_INTERNAL_URL: { kind: 'url' },
  OGM_PLATFORM_ISSUE_REPO: { kind: 'string' },
  GITHUB_APP_ID: { kind: 'string' },
  GITHUB_APP_PRIVATE_KEY_PATH: { kind: 'path' },
  OGM_GITHUB_WEBHOOK_SECRET: { kind: 'secret', required: false },
  OGM_BUILDER_BOT_LOGIN: { kind: 'string' },
} as const;

export type CommitConfig = {
  port: number;
  serviceToken: string;
  internalToken: string;
  dataDirectory: string;
  blocklistFile: string;
  apiInternalUrl: string;
  platformIssueRepo: { owner: string; name: string };
  githubAppId: string;
  githubPrivateKeyPath: string;
  githubWebhookSecret: string | undefined;
  builderBotLogin: string;
};

export function loadCommitConfig(source?: Record<string, string | undefined>): CommitConfig {
  const values = loadEnv('commit', commitSpec, source);
  return {
    port: values.OGM_COMMIT_PORT,
    serviceToken: values.OGM_COMMIT_SERVICE_TOKEN,
    internalToken: values.OGM_INTERNAL_TOKEN,
    dataDirectory: values.OGM_DATA_DIR,
    blocklistFile: values.OGM_BLOCKLIST_FILE ?? join(values.OGM_DATA_DIR, 'blocklist.txt'),
    apiInternalUrl: values.OGM_API_INTERNAL_URL,
    platformIssueRepo: parseRepository(values.OGM_PLATFORM_ISSUE_REPO),
    githubAppId: values.GITHUB_APP_ID,
    githubPrivateKeyPath: values.GITHUB_APP_PRIVATE_KEY_PATH,
    githubWebhookSecret: values.OGM_GITHUB_WEBHOOK_SECRET,
    builderBotLogin: values.OGM_BUILDER_BOT_LOGIN,
  };
}
