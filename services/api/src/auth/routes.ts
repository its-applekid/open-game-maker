import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';

import type { ApiError } from '@ogm/contracts';

import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import {
  AGE_COOKIE,
  AGE_COOKIE_TTL_SEC,
  AGE_REFUSED,
  AGE_REFUSED_TTL_SEC,
  isAdult,
  readCookie,
  signAgeCookie,
  verifyAgeCookie,
} from './age.js';
import { createAuth, type Auth } from './auth.js';
import { loadAuthEnv, type AuthEnv } from './env.js';
import { selectMailSender } from './mail.js';
import { parseMaintainers, sessionResolver } from './principal.js';
import { clientIp, createRateLimiter } from './rate-limit.js';
import { createUserDirectory } from './user-directory.js';
import { signWsToken } from './ws-token.js';

export const prefix = '/auth';

type AuthContext = { auth: Auth; env: AuthEnv; agePerIp: ReturnType<typeof createRateLimiter> };
const contexts = new WeakMap<AppDeps, AuthContext>();

export function setup(deps: AppDeps): void {
  const env = loadAuthEnv();
  const mail = selectMailSender(env, deps.sqlite);
  const auth = createAuth({ db: deps.db, env, mail: mail.sender, log: deps.log });
  contexts.set(deps, { auth, env, agePerIp: createRateLimiter(10) });
  deps.registry.mailSender ??= {
    send: async (message) => {
      await mail.sender.send(message);
    },
  };
  deps.registry.userDirectory ??= createUserDirectory(deps.sqlite);
  deps.registry.principalResolvers.push(
    sessionResolver(auth, deps.sqlite, parseMaintainers(env.OGM_MAINTAINER_EMAILS)),
  );
  deps.log({
    event: 'auth-ready',
    mailSender: mail.kind,
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  });
}

function context(c: Context<ApiBindings>): AuthContext {
  const found = contexts.get(c.get('deps'));
  if (!found) throw new Error('auth context used before setup');
  return found;
}

export function hasAdultAgeAttestation(c: Context<ApiBindings>): boolean {
  const { env } = context(c);
  return Boolean(verifyAgeCookie(readCookie(c.req.header('cookie'), AGE_COOKIE), env.OGM_AGE_COOKIE_SECRET));
}

const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const AgeBody = z.object({
  birthMonth: z.number().int().min(1).max(12),
  birthYear: z.number().int().min(1900),
});

export default new Hono<ApiBindings>()
  // Nothing about the answer is stored or logged; an under-18 answer leaves only the `refused` marker.
  .post('/age', async (c) => {
    const { env, agePerIp } = context(c);
    if (!agePerIp(clientIp(c.req.raw.headers))) throw new HttpError(429, 'rate_limited');
    if (readCookie(c.req.header('cookie'), AGE_COOKIE) === AGE_REFUSED) throw new HttpError(403, 'age_refused');

    const now = new Date();
    const { birthMonth, birthYear } = await parseBody(c, AgeBody);
    if (birthYear > now.getUTCFullYear()) throw new HttpError(400, 'invalid_request');

    if (!isAdult(birthMonth, birthYear, now)) {
      c.header('set-cookie', cookie(AGE_COOKIE, AGE_REFUSED, AGE_REFUSED_TTL_SEC));
      return c.json({ error: 'age_refused' } satisfies ApiError, 403);
    }
    const value = signAgeCookie(
      { band: 'adult', attestedAt: now.toISOString(), exp: Math.floor(now.getTime() / 1000) + AGE_COOKIE_TTL_SEC },
      env.OGM_AGE_COOKIE_SECRET,
    );
    c.header('set-cookie', cookie(AGE_COOKIE, value, AGE_COOKIE_TTL_SEC));
    return c.body(null, 204);
  })
  .post('/ws-token', (c) => {
    const user = requirePrincipal(c, ['user']);
    c.header('cache-control', 'no-store');
    return c.json(signWsToken({ sub: user.userId, familyId: user.familyId }, context(c).env.OGM_WS_TOKEN_SECRET));
  })
  .on(['GET', 'POST'], '/*', (c) => context(c).auth.handler(c.req.raw));
