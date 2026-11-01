import { loadEnv } from '@ogm/config';

import { parseRepository } from './platform-repo.js';

const commitSpec = {
  OGM_COMMIT_PORT: { kind: 'port' },
  OGM_COMMIT_SERVICE_TOKEN: { kind: 'secret' },
  OGM_DATA_DIR: { kind: 'path' },
  OGM_API_INTERNAL_URL: { kind: 'url' },
  OGM_PLATFORM_ISSUE_REPO: { kind: 'string' },
  GITHUB_APP_ID: { kind: 'string' },
  GITHUB_APP_PRIVATE_KEY_PATH: { kind: 'path' },
  OGM_BUILDER_BOT_LOGIN: { kind: 'string' },
} as const;

export type CommitConfig = {
  port: number;
  serviceToken: string;
  dataDirectory: string;
  apiInternalUrl: string;
  platformIssueRepo: { owner: string; name: string };
  githubAppId: string;
  githubPrivateKeyPath: string;
  builderBotLogin: string;
};

export function loadCommitConfig(): CommitConfig {
  const values = loadEnv('commit', commitSpec);
  return {
    port: values.OGM_COMMIT_PORT,
    serviceToken: values.OGM_COMMIT_SERVICE_TOKEN,
    dataDirectory: values.OGM_DATA_DIR,
    apiInternalUrl: values.OGM_API_INTERNAL_URL,
    platformIssueRepo: parseRepository(values.OGM_PLATFORM_ISSUE_REPO),
    githubAppId: values.GITHUB_APP_ID,
    githubPrivateKeyPath: values.GITHUB_APP_PRIVATE_KEY_PATH,
    builderBotLogin: values.OGM_BUILDER_BOT_LOGIN,
  };
}
