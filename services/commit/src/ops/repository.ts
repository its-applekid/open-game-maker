import { GitHubRequestError } from '../github-request.js';
import type { AuthenticatedGitHub } from '../types.js';

export async function createPrivateRepository(github: AuthenticatedGitHub, owner: string, name: string): Promise<void> {
  const route = github.accountType === 'Organization' ? 'POST /orgs/{org}/repos' : 'POST /user/repos';
  await github.request(route, {
    ...(github.accountType === 'Organization' ? { org: owner } : {}),
    name,
    private: true,
    auto_init: false,
    has_issues: true,
  });
}

export async function ensurePrivateRepository(
  github: AuthenticatedGitHub,
  owner: string,
  name: string,
): Promise<'created' | 'existing'> {
  try {
    await createPrivateRepository(github, owner, name);
    return 'created';
  } catch (error) {
    if (!(error instanceof GitHubRequestError) || error.status !== 422) throw error;
    await github.request('GET /repos/{owner}/{repo}', { owner, repo: name });
    return 'existing';
  }
}
