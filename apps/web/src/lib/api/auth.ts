import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

import { api, ApiError } from './client';

const visibilityKey = 'ogm.repoVisibility';
export const AUTH_REQUEST_TIMEOUT_MS = 15_000;

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/auth',
  fetchOptions: { customFetchImpl: authFetch },
  plugins: [passkeyClient(), magicLinkClient()],
});

export type Session = typeof authClient.$Infer.Session;
export type RepoVisibility = 'public' | 'private';
export type AuthCapabilities = { providers: string[] };

export function useSession() {
  return authClient.useSession();
}

export async function getAuthCapabilities(): Promise<AuthCapabilities> {
  const response = await authFetch('/auth/providers');
  const body = (await readResponse(response)) as AuthCapabilities | undefined;
  if (!response.ok) throw new ApiError(response.status, body);
  return body ?? { providers: [] };
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(new DOMException('Request timed out.', 'TimeoutError')),
    AUTH_REQUEST_TIMEOUT_MS,
  );
  const abort = () => controller.abort(init.signal?.reason);

  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });

  try {
    return await fetch(input, { ...init, credentials: 'include', signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}

export async function signOut(): Promise<void> {
  const result = await authClient.signOut();
  if (result.error) throw result.error;
  navigate('/');
}

export type GitHubStatus = { connected: boolean; login?: string };

export function getGitHubStatus(): Promise<GitHubStatus> {
  return api<GitHubStatus>('/github/connection');
}

// The API resolves the login from the installation id GitHub appended to the App's setup URL.
export function connectGitHubInstallation(installationId: string): Promise<GitHubStatus> {
  return api<GitHubStatus>('/github/connect', { method: 'POST', json: { installationId } });
}

const installStateKey = 'ogm.githubInstallState';

// GitHub returns `state` unchanged to the App's setup URL (/connect/github). It carries `next` plus a nonce
// only this tab knows, so a crafted callback link cannot connect someone else's installation.
export function gitHubInstallUrl(next: string, slug = import.meta.env.VITE_GITHUB_APP_SLUG): string | null {
  if (!slug) return null;
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(installStateKey, nonce);
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set('state', `${nonce}:${next}`);
  return url.href;
}

// The `next` of an install this tab started, or null for a callback it did not start. Single use.
export function readGitHubInstallState(state: string | null): string | null {
  const nonce = sessionStorage.getItem(installStateKey);
  const separator = state?.indexOf(':') ?? -1;
  if (!state || !nonce || separator < 0 || state.slice(0, separator) !== nonce) return null;
  sessionStorage.removeItem(installStateKey);
  return state.slice(separator + 1);
}

export function getRepoVisibilityDefault(): RepoVisibility {
  return localStorage.getItem(visibilityKey) === 'public' ? 'public' : 'private';
}

export function setRepoVisibilityDefault(value: RepoVisibility): void {
  localStorage.setItem(visibilityKey, value);
}

export function safeNext(value: string | null, fallback: string): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return fallback;
  const target = new URL(value, window.location.origin);
  return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text === '') return undefined;
  return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
}
