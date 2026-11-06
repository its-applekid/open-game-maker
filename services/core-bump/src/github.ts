import { readFile } from 'node:fs/promises';

import { createAppAuth } from '@octokit/auth-app';

const API = 'https://api.github.com';
const HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'ogm-core-bump',
};

export class GitHubError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

export type PullRequestRef = { readonly number: number; readonly url: string };

export type CommitIdentity = { readonly name: string; readonly email: string };

/** Reads the commit a core branch is on. The core repository is public, so no token is needed. */
export type CoreRemote = {
  headSha(repo: string, branch: string): Promise<string>;
};

/** The operations the job needs on an instance repository, through the GitHub App installed on it. */
export type InstanceGitHub = {
  defaultBranch(repo: string): Promise<string>;
  /** The contents of `path`, or null when the file is not in the repository. */
  readFile(repo: string, path: string, ref: string): Promise<string | null>;
  /** The open pull request whose head branch starts with `prefix`, or null. */
  openPullWithPrefix(repo: string, prefix: string): Promise<PullRequestRef | null>;
  createPull(input: { repo: string; head: string; base: string; title: string; body: string }): Promise<PullRequestRef>;
  /** The login and commit identity of the App's bot user. */
  botIdentity(): Promise<CommitIdentity>;
  /** A short-lived installation token the local clone and push authenticate with. */
  installationToken(): Promise<string>;
};

type Fetch = typeof fetch;

async function json(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function failure(response: Response, what: string): GitHubError {
  return new GitHubError(`${what} failed with ${response.status}`, response.status);
}

export function anonymousCoreRemote(fetchImpl: Fetch = fetch): CoreRemote {
  return {
    async headSha(repo, branch) {
      const response = await fetchImpl(`${API}/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
        headers: HEADERS,
      });
      if (!response.ok) throw failure(response, `read ${repo} ${branch}`);
      const body = (await json(response)) as { sha?: unknown } | null;
      if (typeof body?.sha !== 'string') throw new GitHubError(`read ${repo} ${branch} returned no commit`, 200);
      return body.sha;
    },
  };
}

export type InstallationAuth = {
  appId: string;
  installationId: string;
  privateKeyPath: string;
};

async function mintInstallationToken(auth: InstallationAuth): Promise<string> {
  const privateKey = await readFile(auth.privateKeyPath, 'utf8');
  const appAuthentication = createAppAuth({ appId: auth.appId, privateKey });
  const installation = await appAuthentication({
    type: 'installation',
    installationId: Number(auth.installationId),
  });
  return installation.token;
}

export async function installationGitHub(auth: InstallationAuth, fetchImpl: Fetch = fetch): Promise<InstanceGitHub> {
  const token = await mintInstallationToken(auth);
  const call = async (method: string, path: string, what: string, body?: unknown): Promise<unknown> => {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { ...HEADERS, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw failure(response, what);
    return json(response);
  };

  return {
    async defaultBranch(repo) {
      const body = (await call('GET', `/repos/${repo}`, `read ${repo}`)) as { default_branch?: unknown } | null;
      if (typeof body?.default_branch !== 'string') {
        throw new GitHubError(`read ${repo} returned no default branch`, 200);
      }
      return body.default_branch;
    },

    async readFile(repo, path, ref) {
      try {
        const body = (await call(
          'GET',
          `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
          `read ${repo}/${path}`,
        )) as { content?: unknown; encoding?: unknown } | null;
        if (typeof body?.content !== 'string' || body.encoding !== 'base64') {
          throw new GitHubError(`${repo}/${path} is not a base64 file`, 200);
        }
        return Buffer.from(body.content, 'base64').toString('utf8');
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) return null;
        throw error;
      }
    },

    async openPullWithPrefix(repo, prefix) {
      const body = (await call('GET', `/repos/${repo}/pulls?state=open&per_page=100`, `list ${repo} pulls`)) as
        { head?: { ref?: unknown }; number?: unknown; html_url?: unknown }[] | null;
      if (!Array.isArray(body)) throw new GitHubError(`list ${repo} pulls returned no list`, 200);
      const match = body.find((pull) => typeof pull.head?.ref === 'string' && pull.head.ref.startsWith(prefix));
      return match === undefined
        ? null
        : { number: Number(match.number), url: typeof match.html_url === 'string' ? match.html_url : '' };
    },

    async createPull({ repo, head, base, title, body: text }) {
      const body = (await call('POST', `/repos/${repo}/pulls`, `open a pull request in ${repo}`, {
        head,
        base,
        title,
        body: text,
      })) as { number?: unknown; html_url?: unknown } | null;
      if (body?.number === undefined || typeof body.number !== 'number') {
        throw new GitHubError(`open a pull request in ${repo} returned no number`, 200);
      }
      return { number: body.number, url: typeof body.html_url === 'string' ? body.html_url : '' };
    },

    async botIdentity() {
      const body = (await call('GET', '/user', 'read the App bot user')) as { login?: unknown } | null;
      if (typeof body?.login !== 'string') throw new GitHubError('read the App bot user returned no login', 200);
      return { name: body.login, email: `${body.login}@users.noreply.github.com` };
    },

    async installationToken() {
      return token;
    },
  };
}
