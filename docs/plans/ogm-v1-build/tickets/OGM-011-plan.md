# OGM-011 plan — Better Auth, the age gate, the mail seam and the proxy write-up

## 1. Problem frame

Every account needs an email, a passkey and/or Google, and no password (R1); every sign-up and OAuth start must be preceded by a neutral 18+ screen whose refusal stores nothing (R2). The frontend is on Netlify and the API on a Tailscale hostname, so the session cookie only works if the browser sees one origin (D-ORIGIN). No mail provider exists and none may be bought, so magic links need a sender that costs nothing (D-MAIL). This ticket wires Better Auth into OGM-010's skeleton and leaves the screens to the web lane.

Requirements trace: R1 → Better Auth with `magicLink`, `passkey`, optional Google, `bearer` for token callers; `emailAndPassword` disabled. R2 → `POST /auth/age`, signed cookie, before-hooks on sign-up, magic-link send and social sign-in, `age_band`/`age_attested_at` on the user.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U3 and U4: how a context mounts (`src/auth/routes.ts`, `export const prefix`) and how a principal resolver registers. Copy exactly.
- T06 §4 `vct1` minting in `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T06-voice-and-build-chat.md` line 192: `body = "<prefix>." + base64url(json); token = body + "." + base64url(hmacSha256(secret, body))`. Copy for `ogw1` (ws token) and for the age cookie value.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B9-general-audience-reframe-legal.md` lines 24–34 and 75–95: the age-screen rules (free month/year entry, no "must be 18" wording, cookie against retries, nothing kept). The backend enforces; the copy is OGM-072's.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T11-hosting-and-ops.md` §4 ingress map (line 158): the `_redirects` line shape `/api/*  https://applekid.tailee0e71.ts.net:8443/api/:splat  200`. Copy with `/auth/*` added.

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest; no Playwright here; the API binds `127.0.0.1`; secrets only from `packages/config` names; dependencies ≥1k stars (`better-auth` ~30k, `nodemailer` ~17k; `@better-auth/passkey` is part of the Better Auth org and ships with it, name the exception if the star check is applied per package); PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Better Auth instance, Drizzle adapter, tables

Goal: `auth.handler` serves `/auth/*` on SQLite with the decided methods only.

Files: Create `services/api/src/auth/auth.ts`, `services/api/src/auth/routes.ts`, `packages/db/src/schema/auth.ts`, `packages/db/migrations/<ts>_auth.sql`. Modify `packages/db/src/schema/index.ts` (append `export * from './auth.js'`), `services/api/package.json` (deps `better-auth`, `@better-auth/passkey` pinned to the same minor at install; `nodemailer`), root `.env.example` (names). Test `services/api/test/auth-boot.test.ts`.

Approach: `createAuth({ db, env, mail })` returns `betterAuth({ database: drizzleAdapter(db, { provider: 'sqlite' }), baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET, trustedOrigins: [env.OGM_APP_ORIGIN], emailAndPassword: { enabled: false }, user: { additionalFields: { age_band: { type: 'string' }, age_attested_at: { type: 'string' } } }, socialProviders: google ? { google } : {}, plugins: [magicLink({ sendMagicLink }), passkey({ rpID: hostOf(env.OGM_APP_ORIGIN), rpName: 'Open Game Maker 2000', origin: env.OGM_APP_ORIGIN }), bearer()], hooks: { before: ageGateHook } })`. Generate the schema with `npx @better-auth/cli generate --config services/api/src/auth/auth.ts` into a scratch file, convert to Drizzle `sqliteTable` definitions in `schema/auth.ts`, and write the migration SQL by hand including `mail_outbox` and the two user columns. `routes.ts`: `export const prefix = '/auth'`; routes `/age` (U2), `/ws-token` (U4), then `app.on(['GET','POST'], '/*', c => auth.handler(c.req.raw))`.

Interface sketch:
```ts
export function createAuth(deps: { db: Db; env: AuthEnv; mail: MailSender }): ReturnType<typeof betterAuth>;
// GET/POST /auth/*  Better Auth routes;  POST /auth/age;  POST /auth/ws-token
```

Test scenarios: Given the app with a temp DB, when `GET /auth/ok` (Better Auth's health route; refresh the name at pickup), then 200. Given no `GOOGLE_CLIENT_ID`, when listing providers, then Google is absent and boot succeeds. Given `emailAndPassword` sign-up POST, then 4xx (method disabled).

Execution note: characterization first: boot the real library against `:memory:`/tmp DB before writing hooks, so the generated table names are known.

### U2 — age gate

Goal: no sign-up, magic link or OAuth start without a valid adult cookie; refusals store nothing.

Files: Create `services/api/src/auth/age.ts`. Test `services/api/test/age.test.ts`, `services/api/test/auth-hooks.test.ts`.

Approach: `isAdult(month, year, now)`: adult when `now >= first day of (month, year + 18)`. `POST /auth/age` parses `{ birthMonth: 1..12, birthYear: 1900..now.year }` with Zod; adult → `Set-Cookie: ogm_age=<signed AgeCookie>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`, 204; minor → `Set-Cookie: ogm_age=refused; Max-Age=31536000` and 403 `{ error: 'age_refused' }` with no persistence and a log line that carries only the request id. `verifyAgeCookie(value, secret, now)` → `AgeCookie | null`. The Better Auth `hooks.before` matcher covers `/sign-up/*`, `/sign-in/magic-link`, `/sign-in/social`, `/passkey/register*` (refresh exact paths from the installed version); a missing or invalid cookie throws `APIError('FORBIDDEN', { code: 'AGE_REQUIRED' })`. `databaseHooks.user.create.before` copies `age_band: 'adult'`, `age_attested_at` from the cookie into the user row.

Interface sketch:
```ts
export function isAdult(birthMonth: number, birthYear: number, now: Date): boolean;
export function signAgeCookie(c: AgeCookie, secret: string): string;
export function verifyAgeCookie(v: string, secret: string, now?: number): AgeCookie | null;
```

Test scenarios: Given 2008-12 on 2026-10-31, when posted, then 403, no `user` row, cookie `refused`. Given 2000-05, then 204 and the cookie verifies with `band: 'adult'`. Given birth month equal to the current month 18 years ago, then adult (boundary). Given a magic-link request without the cookie, then 403 `AGE_REQUIRED`; with it, a user is created with `age_band = 'adult'` and `age_attested_at` set. Given a cookie signed with another secret, then refused.

### U3 — `MailSender`, admin inbox, SMTP

Goal: magic links and invitation mails have a free sender by default.

Files: Create `services/api/src/auth/mail.ts`, `mail-admin-inbox.ts`, `mail-smtp.ts`. Test `services/api/test/mail.test.ts`.

Approach: `MailSender` per the ticket. `AdminInboxMailSender(db)` inserts into `mail_outbox` and returns the row id; `listOutbox({ limit })` and `markOpened(id)` are exported for OGM-017's admin route. `SmtpMailSender(url, from)` wraps `nodemailer.createTransport(url)`; `selectMailSender(env, db)` picks SMTP when `SMTP_URL` is set, else the inbox, and logs which one at boot (no values). `sendMagicLink({ email, url })` calls `mail.send` with a plain-text body containing the URL.

Interface sketch:
```ts
export function selectMailSender(env: { SMTP_URL?: string; SMTP_FROM?: string }, db: Db): MailSender;
export function listOutbox(db: Db, opts?: { limit?: number; unopened?: boolean }): MailRow[];
```

Test scenarios: Given no `SMTP_URL`, when a magic link is requested, then one `mail_outbox` row exists with the link. Given `SMTP_URL`, then `nodemailer` transport `sendMail` is called once (mock the transport). Given a send failure, then the request returns 502 `mail_failed` and nothing else changes.

### U4 — principal resolver and ws-token

Goal: cookie and bearer sessions become `user` principals; WebSocket services get a 5-minute proof.

Files: Create `services/api/src/auth/principal.ts`, `services/api/src/auth/ws-token.ts`. Test `services/api/test/principal-session.test.ts`, `services/api/test/ws-token.test.ts`.

Approach: `sessionResolver(auth, db)` calls `auth.api.getSession({ headers })` (works for the cookie and, with the `bearer` plugin, `Authorization: Bearer <session token>`); on a session it loads family membership from OGM-012's `family_members` table when the table exists (`db.select` guarded by a schema-presence check at boot) and returns `{ kind: 'user', userId, familyId, platformRole, capability }`, where `platformRole` is `'maintainer'` when the email is in `OGM_MAINTAINER_EMAILS`, else the membership role mapped (`owner|admin → 'admin'`, else `'none'`), and `capability` from membership (default `'player'`). Register with `registry.principalResolvers.push(sessionResolver)` from `routes.ts` at mount time. `POST /auth/ws-token` requires a user principal and returns `signWsToken({ sub, familyId }, secret, 300)`.

Interface sketch: as the ticket's `signWsToken`/`verifyWsToken`.

Test scenarios: Given a magic-link sign-in completed in the test (follow the link), when `GET /api/v1/zz-test/whoami` (test route from OGM-010's scan test), then the principal is `user` with the session's id, via cookie and via bearer. Given no membership rows, then `familyId: ''`, `capability: 'player'`. Given an email in `OGM_MAINTAINER_EMAILS`, then `platformRole: 'maintainer'`. Given `POST /auth/ws-token` anonymous, then 401; as a user, then a token that `verifyWsToken` accepts and rejects after 301 s.

### U5 — `docs/ops/netlify-proxy.md`

Goal: one page the web and ingress tickets copy from.

Files: Create `docs/ops/netlify-proxy.md`.

Approach: list the two `_redirects` lines (`/api/*` and `/auth/*` → `https://applekid.tailee0e71.ts.net:8443/...:splat 200`), `_headers` note (no cookies cached), `BETTER_AUTH_URL`/`OGM_APP_ORIGIN` = `https://ogm2000.netlify.app`, passkey `rpID` = `ogm2000.netlify.app`, Google authorized redirect URI `https://ogm2000.netlify.app/auth/callback/google` (refresh the callback path from the installed version), the rule "cookies never cross to `ts.net`; sockets use `ws-token`, room grants or the voice token", and the iPhone check steps. Twenty to forty lines.

Test scenarios: none automated; reviewed by the Executor against E11-6.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test
pnpm -r typecheck && pnpm -r lint
curl -s -i -X POST http://127.0.0.1:$OGM_API_PORT/auth/age -H 'content-type: application/json' -d '{"birthMonth":5,"birthYear":2000}' | grep -i set-cookie
curl -s -i -X POST http://127.0.0.1:$OGM_API_PORT/auth/age -H 'content-type: application/json' -d '{"birthMonth":12,"birthYear":2008}' | head -1
```
Paste into `## Local tests`: test counts, the two curl results (204 with `ogm_age=`; 403), the boot log line naming the mail sender, and the migration name applied.

## 5. Deferred to implementation

- Exact Better Auth hook paths and callback URLs: read from the installed version (default: as named above).
- Session cookie lifetime: Better Auth default (7 days) with `updateAge` 1 day.
- Magic-link TTL: 15 minutes.
- Whether the `refused` cookie should be signed: no (it carries no claim).
- `OGM_MAINTAINER_EMAILS` format: comma-separated, lower-cased on compare.

## 6. Scope boundaries

- Screens and the Better Auth browser client: OGM-072. `_redirects` file: OGM-070; ingress script: OGM-006. Families, invitations, policy: OGM-012. Admin mail-outbox route: OGM-017. Room grants: OGM-050; voice token: OGM-085. GitHub connect flow (installation id capture): OGM-012's games context, using this ticket's session only.

## 7. Risks

- Better Auth major/minor drift since A7 (E01-7): default: pin both packages to the same minor and record the versions in the PR body.
- Passkey ceremonies cannot be proven headless: default: unit-test the config values; the real iPhone check is the named human evidence.
- SQLite adapter edge cases (booleans, dates): default: run the library's own generated migration shape and the boot characterization test first.
- The proxy may strip `Set-Cookie` attributes: default: verify in the iPhone check; fallback documented in `netlify-proxy.md` (cookie `Domain` unset, `Secure` on).
