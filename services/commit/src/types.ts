import type { BoundaryVerdict, CommitOp, CommitResult } from '@ogm/contracts';

export type { BoundaryVerdict, CommitOp, CommitResult };

export type Visibility = 'private' | 'public';

export type Repository = {
  owner: string;
  name: string;
  visibility: Visibility;
};

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

export type OperationName = CommitOp['kind'];
