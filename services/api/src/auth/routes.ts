import { Hono } from 'hono';
import type { Context } from 'hono';

import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { mergeAllowedEmails, parseEmailList } from './access.js';
import { createAuth, type Auth } from './auth.js';
import { loadAuthEnv, type AuthEnv } from './env.js';
import { selectMailSender } from './mail.js';
import { sessionResolver } from './principal.js';
import { createUserDirectory } from './user-directory.js';
import { signWsToken } from './ws-token.js';

export const prefix = '/auth';

type AuthContext = { auth: Auth; env: AuthEnv };
const contexts = new WeakMap<AppDeps, AuthContext>();

export function setup(deps: AppDeps): void {
  const env = loadAuthEnv();
  const mail = selectMailSender(env, deps.sqlite);
  const configuredAllowedEmails = parseEmailList(env.OGM_ALLOWED_EMAILS);
  const maintainers = parseEmailList(env.OGM_MAINTAINER_EMAILS);
  const allowedEmails = mergeAllowedEmails(configuredAllowedEmails, maintainers);
  if (configuredAllowedEmails.size === 0) deps.log({ event: 'auth-allowed-emails-empty', level: 'warn' });
  const auth = createAuth({ db: deps.db, env, mail: mail.sender, allowedEmails, log: deps.log });
  contexts.set(deps, { auth, env });
  deps.registry.mailSender ??= {
    send: async (message) => {
      await mail.sender.send(message);
    },
  };
  deps.registry.userDirectory ??= createUserDirectory(deps.sqlite);
  deps.registry.principalResolvers.push(sessionResolver(auth, deps.sqlite, allowedEmails, maintainers));
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

function configuredProviders(env: AuthEnv): string[] {
  const providers = ['magic-link', 'passkey'];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push('google');
  return providers;
}

export default new Hono<ApiBindings>()
  .get('/providers', (c) => {
    c.header('cache-control', 'no-store');
    return c.json({ providers: configuredProviders(context(c).env) });
  })
  // Cached copies of the old web app still post here during an API-first rollout. Keep it side-effect free.
  .post('/age', (c) => {
    c.header('cache-control', 'no-store');
    return c.body(null, 204);
  })
  .post('/ws-token', (c) => {
    const user = requirePrincipal(c, ['user']);
    c.header('cache-control', 'no-store');
    return c.json(signWsToken({ sub: user.userId, familyId: user.familyId }, context(c).env.OGM_WS_TOKEN_SECRET));
  })
  .on(['GET', 'POST'], '/*', (c) => context(c).auth.handler(c.req.raw));
