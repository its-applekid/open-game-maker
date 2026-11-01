import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

import { ApiError } from './client';

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

export async function requireAge(next: string): Promise<void> {
  navigate(`/age?next=${encodeURIComponent(next)}`);
}

export async function signOut(): Promise<void> {
  const result = await authClient.signOut();
  if (result.error) throw result.error;
  navigate('/');
}

export async function getGitHubStatus(): Promise<{ connected: boolean; login?: string }> {
  const result = await authClient.listAccounts();
  if (result.error) throw result.error;
  const github = result.data?.find((account) => {
    const provider = 'providerId' in account ? account.providerId : (account as { provider?: string }).provider;
    return provider === 'github';
  });
  return github ? { connected: true, login: github.accountId } : { connected: false };
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

export function isAgeRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    body?: { code?: string; error?: string };
  };
  const status = candidate.status ?? candidate.statusCode;
  const code = candidate.code ?? candidate.body?.code ?? candidate.body?.error;
  return status === 403 && code?.toLowerCase() === 'age_required';
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
