import { randomUUID } from 'node:crypto';

import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { bearer, magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { schema, type Db } from '@ogm/db';

import { AGE_COOKIE, readCookie, verifyAgeCookie } from './age.js';
import type { AuthEnv } from './env.js';
import type { MailSender } from './mail.js';
import { clientIp, createRateLimiter } from './rate-limit.js';

export const MAGIC_LINK_TTL_SEC = 15 * 60;
type AuthLogLevel = 'debug' | 'info' | 'warn' | 'error';

export function createAuthLogger(log: (line: Record<string, unknown>) => void) {
  return {
    log: (level: AuthLogLevel, ...unsafe: unknown[]) => {
      void unsafe;
      log({ event: 'better-auth', level });
    },
  };
}

// Endpoints that start a sign-up or attach a credential: each needs a valid `ogm_age` cookie.
const AGE_GATED_PATHS = new Set([
  '/sign-in/magic-link',
  '/sign-in/social',
  '/link-social',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
]);

const ageRequired = () => new APIError('FORBIDDEN', { message: 'age attestation required', code: 'AGE_REQUIRED' });

function ageCookieFrom(headers: Headers | undefined, secret: string) {
  return verifyAgeCookie(readCookie(headers?.get('cookie'), AGE_COOKIE), secret);
}

// The two surfaces the API uses; the full inferred type drags in WebAuthn types this package cannot name.
export interface Auth {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(input: {
      headers: Headers;
    }): Promise<{ user: { id: string; email: string }; session: { id: string } } | null>;
  };
}

export function createAuth(deps: {
  db: Db;
  env: AuthEnv;
  mail: MailSender;
  log: (line: Record<string, unknown>) => void;
}): Auth {
  const { db, env, mail, log } = deps;
  const appOrigin = new URL(env.OGM_APP_ORIGIN).origin;
  const magicLinkPerIp = createRateLimiter(10);
  const magicLinkPerEmail = createRateLimiter(10);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {};

  return betterAuth({
    appName: 'Open Game Maker 2000',
    baseURL: appOrigin,
    basePath: '/auth',
    secret: env.OGM_SESSION_SECRET,
    trustedOrigins: [appOrigin],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
      },
    }),
    emailAndPassword: { enabled: false },
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    user: {
      additionalFields: {
        ageBand: { type: 'string', required: false, input: false },
        ageAttestedAt: { type: 'string', required: false, input: false },
      },
    },
    socialProviders: google,
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SEC,
        sendMagicLink: async ({ email, url, token }) => {
          try {
            await mail.send({
              to: email,
              subject: 'Your Open Game Maker 2000 sign-in link',
              text: `Open this link to sign in (it works once, for 15 minutes):\n\n${url}\n`,
            });
          } catch {
            db.delete(schema.verification)
              .where(eq(schema.verification.identifier, `magic-link:${token}`))
              .run();
            throw new APIError('BAD_GATEWAY', { message: 'mail failed', code: 'MAIL_FAILED' });
          }
        },
      }),
      passkey({ rpID: new URL(appOrigin).hostname, rpName: 'Open Game Maker 2000', origin: appOrigin }),
      bearer(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!AGE_GATED_PATHS.has(ctx.path)) return;
        if (!ageCookieFrom(ctx.headers, env.OGM_AGE_COOKIE_SECRET)) throw ageRequired();
        if (ctx.path === '/sign-in/magic-link') {
          const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase();
          if (!magicLinkPerIp(clientIp(ctx.headers ?? new Headers())) || !magicLinkPerEmail(email)) {
            throw new APIError('TOO_MANY_REQUESTS', { message: 'too many sign-in links', code: 'RATE_LIMITED' });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Every account creation (magic-link verify, Google callback) carries the attestation.
          before: async (user, ctx) => {
            const age = ageCookieFrom(ctx?.headers ?? ctx?.request?.headers, env.OGM_AGE_COOKIE_SECRET);
            if (!age) throw ageRequired();
            return { data: { ...user, ageBand: age.band, ageAttestedAt: age.attestedAt } };
          },
        },
      },
    },
    advanced: {
      database: { generateId: ({ model }) => (model === 'user' ? `u_${randomUUID()}` : randomUUID()) },
    },
    telemetry: { enabled: false },
    // Better Auth interpolates request values into messages, so only retain the stable severity.
    logger: createAuthLogger(log),
  });
}
