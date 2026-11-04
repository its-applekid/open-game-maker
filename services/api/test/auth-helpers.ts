import type { Hono } from 'hono';

import type { ApiBindings } from '../src/app/types.js';

export const APP_ORIGIN = 'https://makeopen.games';
export const WS_SECRET = 'ws-token-secret-for-tests-0123456789';

type App = Hono<ApiBindings>;

export function cookiePair(response: Response, name: string): string | undefined {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    if (pair.startsWith(`${name}=`)) return pair;
  }
  return undefined;
}

export async function requestMagicLink(app: App, email: string, headers: Record<string, string> = {}) {
  return app.request('/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, ...headers },
    body: JSON.stringify({ email }),
  });
}

// Follows the emailed link the way a browser would, on the API's own path.
export async function followLink(app: App, text: string) {
  const match = /https:\/\/\S+/.exec(text);
  if (!match) throw new Error('no link in mail text');
  const url = new URL(match[0]);
  return app.request(`${url.pathname}${url.search}`);
}

export const SESSION_COOKIE = '__Secure-better-auth.session_token';

// Magic link, then follow it: returns the session cookie pair and the bearer token.
export async function signIn(app: App, outbox: () => { text: string }[], email: string) {
  const sent = await requestMagicLink(app, email);
  if (sent.status !== 200) throw new Error(`magic link ${sent.status}`);
  const verified = await followLink(app, outbox().at(-1)!.text);
  const session = cookiePair(verified, SESSION_COOKIE);
  const token = verified.headers.get('set-auth-token');
  if (!session || !token) throw new Error('no session');
  return { session, token };
}
