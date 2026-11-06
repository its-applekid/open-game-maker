import type { BoundaryVerdict, CommitOp, CommitResult } from '@ogm/contracts';

export type { BoundaryVerdict, CommitOp, CommitResult };

export type Visibility = 'private' | 'public';

export type Repository = {
  owner: string;
  name: string;
  visibility: Visibility;
};

/*
 * One game's home inside the instance repository. `path` is the game's folder (`games/<slug>/`) and stays fixed for the
 * life of the game, so renaming a game never moves its history; `slug` is the current URL slug used in release tags.
 */
export type GameRepository = Repository & { path: string; slug: string };

export type GitHubResponse<T = unknown> = {
  data: T;
  headers?: Record<string, string | undefined>;
  status?: number;
};

export type GitHubRequest = <T = unknown>(
  route: string,
  parameters?: Record<string, unknown>,
) => Promise<GitHubResponse<T>>;

export type GitHubIdentity = {
  name: string;
  email: string;
};

export type AuthenticatedGitHub = {
  accountType: 'Organization' | 'User';
  request: GitHubRequest;
};

export type GitHubApp = {
  forOwner(owner: string): Promise<AuthenticatedGitHub>;
  identity(): Promise<GitHubIdentity>;
};

export type GitHubInstallations = {
  // The account login an installation of the App belongs to, or null when GitHub has no such installation.
  installationLogin(installationId: number): Promise<string | null>;
};

export type OperationName = CommitOp['kind'];
