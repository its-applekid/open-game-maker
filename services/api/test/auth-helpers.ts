import type { Hono } from 'hono';

import type { ApiBindings } from '../src/app/types.js';

export const APP_ORIGIN = 'https://ogm2000.netlify.app';
export const AGE_SECRET = 'age-cookie-secret-for-tests-0123456789';
export const WS_SECRET = 'ws-token-secret-for-tests-0123456789';

type App = Hono<ApiBindings>;

export function cookiePair(response: Response, name: string): string | undefined {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    if (pair.startsWith(`${name}=`)) return pair;
  }
  return undefined;
}

export async function postAge(app: App, body: unknown, headers: Record<string, string> = {}) {
  return app.request('/auth/age', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export async function adultCookie(app: App): Promise<string> {
  const pair = cookiePair(await postAge(app, { birthMonth: 5, birthYear: 2000 }), 'ogm_age');
  if (!pair) throw new Error('no ogm_age cookie');
  return pair;
}

export async function requestMagicLink(app: App, email: string, cookie?: string, headers: Record<string, string> = {}) {
  return app.request('/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify({ email }),
  });
}

// Follows the emailed link the way a browser would, on the API's own path.
export async function followLink(app: App, text: string, cookie?: string) {
  const match = /https:\/\/\S+/.exec(text);
  if (!match) throw new Error('no link in mail text');
  const url = new URL(match[0]);
  return app.request(`${url.pathname}${url.search}`, { headers: cookie ? { cookie } : {} });
}

export const SESSION_COOKIE = '__Secure-better-auth.session_token';

// Age screen, magic link, follow it: returns the session cookie pair and the bearer token.
export async function signIn(app: App, outbox: () => { text: string }[], email: string) {
  const age = await adultCookie(app);
  const sent = await requestMagicLink(app, email, age);
  if (sent.status !== 200) throw new Error(`magic link ${sent.status}`);
  const verified = await followLink(app, outbox().at(-1)!.text, age);
  const session = cookiePair(verified, SESSION_COOKIE);
  const token = verified.headers.get('set-auth-token');
  if (!session || !token) throw new Error('no session');
  return { age, session, token };
}
