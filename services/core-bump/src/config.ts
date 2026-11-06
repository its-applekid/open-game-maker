import { loadEnv } from '@ogm/config';

import type { InstallationAuth } from './github.js';

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const SPEC = {
  OGM_CORE_BUMP_REPOS: { kind: 'string' },
  OGM_CORE_BUMP_CORE_REPO: { kind: 'string' },
  OGM_CORE_BUMP_CORE_BRANCH: { kind: 'string', default: 'main' },
  OGM_CORE_BUMP_WORK_DIR: { kind: 'path', default: '~/.local/state/ogm/core-bump' },
  GITHUB_APP_ID: { kind: 'string' },
  GITHUB_APP_INSTALLATION_ID: { kind: 'string' },
  GITHUB_APP_PRIVATE_KEY_PATH: { kind: 'path' },
} as const;

export type Settings = {
  readonly repos: readonly string[];
  readonly coreRepo: string;
  readonly coreBranch: string;
  readonly workDir: string;
  readonly auth: InstallationAuth;
};

function repositoryList(raw: string): string[] {
  const repos = raw
    .split(',')
    .map((repo) => repo.trim())
    .filter((repo) => repo.length > 0);
  if (repos.length === 0) throw new Error('OGM_CORE_BUMP_REPOS names no instance repository');
  for (const repo of repos) {
    if (!REPO.test(repo)) throw new Error(`OGM_CORE_BUMP_REPOS has an invalid owner/repository: ${repo}`);
  }
  return [...new Set(repos)];
}

export function readSettings(source?: Record<string, string | undefined>): Settings {
  const env = loadEnv('core-bump', SPEC, source);
  const coreRepo = String(env.OGM_CORE_BUMP_CORE_REPO);
  if (!REPO.test(coreRepo)) throw new Error('OGM_CORE_BUMP_CORE_REPO is not owner/repository');

  return {
    repos: repositoryList(String(env.OGM_CORE_BUMP_REPOS)),
    coreRepo,
    coreBranch: String(env.OGM_CORE_BUMP_CORE_BRANCH),
    workDir: String(env.OGM_CORE_BUMP_WORK_DIR),
    auth: {
      appId: String(env.GITHUB_APP_ID),
      installationId: String(env.GITHUB_APP_INSTALLATION_ID),
      privateKeyPath: String(env.GITHUB_APP_PRIVATE_KEY_PATH),
    },
  };
}
