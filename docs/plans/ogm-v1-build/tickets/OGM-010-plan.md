# OGM-010 plan — API skeleton and the backend contract files

## 1. Problem frame

The repository at 9508c1c has no TypeScript, no server and no database (E01-1, E12-1). Eleven tickets need to write backend code in parallel within days, so the first backend merge must give them a process that boots, a database they can migrate, a routing convention that never needs a shared edit, an authentication seam they can rely on before auth exists, and the exact Zod shapes of the jobs, budget, analytics, reports and notifications APIs. This ticket builds that spine and nothing product-shaped.

Requirements trace: R120 → `@ogm/api` and `@ogm/db` are workspace packages with `build`/`test`/`typecheck`/`lint`, tested with Vitest, green under `ci / required`. R121 → one contract file per family in `packages/contracts`, Zod first, fixtures checked in, JSON Schema emitted, barrel append-only.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/README.md` and `fixtures/*.v1.json`: one golden fixture per surface, additive changes only, `v2` beside `v1` for breaking changes. Copy the fixture-per-shape discipline and the `scripts/check-fixture-types.mjs` idea (fixtures must parse with the schema in CI).
- `/home/orangekid/github/aiur/packages/streamdeck/package.json` and `vitest.config.ts`: the `build`/`lint`/`test`/`typecheck` script set and `test/**/*.test.ts` layout. Copy the script names (drop the 100 % coverage thresholds).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs`: load every file in a fixtures directory and validate it against its schema, printing `ok`/`FAIL` per file. Copy the loop shape for the contracts test.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/ogm-drive-sync.service`: the unit OGM-002 will derive `ogm-api.service` from (`ExecStart=… node services/api/dist/main.js`, `UMask=0077`, `NoNewPrivileges=yes`); this plan only has to make `main.js` run under it.
- T06 §4 `vct1` token minting (`body = "vct1." + base64url(json); token = body + "." + base64url(hmacSha256(secret, body))`): copy for the job token with prefix `gmj1`.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright is not used here; the service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars (hono, @hono/node-server, zod, drizzle-orm, drizzle-kit, better-sqlite3 all qualify); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — `@ogm/db`: open, pragmas, migrate, schema barrel

Goal: one function opens the SQLite file correctly and applies timestamped migrations idempotently.

Files: Create `packages/db/package.json` (`@ogm/db`, deps `drizzle-orm`, `better-sqlite3`; dev `drizzle-kit`, `@types/better-sqlite3`, versions pinned at install), `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`, `packages/db/src/open.ts`, `packages/db/src/migrate.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/schema/app-meta.ts`, `packages/db/migrations/20261101000000_app_meta.sql`. Test `packages/db/test/open.test.ts`, `packages/db/test/migrate.test.ts`.

Approach: `openDb(path: string)` constructs `new Database(path)` (better-sqlite3), runs `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, `PRAGMA synchronous=NORMAL`, and returns `{ sqlite, db: drizzle(sqlite, { schema }) }`. `migrate({ sqlite, dir })` creates `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)` if absent, reads `migrations/*.sql` sorted by name, skips those listed under key `migration:<name>`, runs each inside a transaction, records it. Schema barrel exports every `schema/<context>.ts` (siblings append one line each). `drizzle.config.ts` points `schema` at `src/schema/index.ts` and `out` at `migrations/` so `pnpm --filter @ogm/db generate --name <name>` produces the next timestamped file; agents may hand-write SQL when generation is unavailable. Package scripts: `build`, `test`, `typecheck`, `lint`, `migrate` (CLI over `$OGM_DATA_DIR/ogm.sqlite3`), `generate`.

Interface sketch:
```ts
export function openDb(path: string): { sqlite: Database; db: BetterSQLite3Database<typeof schema> };
export function migrate(input: { sqlite: Database; dir?: string }): { applied: string[] };
export const schema: { appMeta: SQLiteTable /* + sibling tables appended */ };
```

Test scenarios: Given a temp file path, when `openDb` runs, then `PRAGMA journal_mode` returns `wal` (an in-memory DB returns `memory`, so the test uses a tmp file). Given a fresh DB, when `migrate` runs twice, then the second call applies `[]` and `app_meta` holds one `migration:` row. Given a migration file with a syntax error, when `migrate` runs, then it throws naming the file and nothing is recorded. Integration: `pnpm --filter @ogm/db migrate` against `$OGM_DATA_DIR` creates `ogm.sqlite3` with mode 0600.

Execution note: write `migrate.test.ts` first; it fails until `migrate.ts` exists.

### U2 — `@ogm/api` app factory, health, errors, validation

Goal: a Hono app that boots on loopback and answers `/healthz` in T11's shape.

Files: Create `services/api/package.json` (`@ogm/api`, deps `hono`, `@hono/node-server`, `zod`, `@ogm/db`, `@ogm/contracts`, `@ogm/config`; dev `vitest`, `typescript`, `tsx`), `services/api/tsconfig.json`, `services/api/vitest.config.ts`, `services/api/src/main.ts`, `services/api/src/app/app.ts`, `services/api/src/app/env.ts`, `services/api/src/app/errors.ts`, `services/api/src/app/validate.ts`, `services/api/src/health/routes.ts`. Test `services/api/test/health.test.ts`, `services/api/test/errors.test.ts`.

Approach: `createApp(deps: { db; env; events; registry })` returns `{ app: Hono, deps }`; `main.ts` loads env through `@ogm/config` (`loadEnv(['OGM_API_PORT','OGM_DATA_DIR','OGM_INTERNAL_TOKEN','OGM_JOB_TOKEN_SECRET'])`, exact function name refreshed from OGM-003 at pickup), opens the DB, runs `migrate`, calls `scanRoutes` (U3), then `serve({ fetch: app.fetch, hostname: '127.0.0.1', port })`. `errors.ts` installs `app.onError` producing `ApiError` JSON (`{ error: 'internal' }` with the request id, stack to the log only) and a `HttpError(status, code, message?)` class every context throws. `validate.ts` exports `parseBody(c, schema)` and `parseQuery(c, schema)` returning the typed value or throwing `HttpError(400, 'invalid_request', issues)`. Request id middleware sets `x-request-id`. `/healthz` returns `{ ok: true, service: 'api', version: env.OGM_GIT_SHA ?? 'dev', uptimeSec }`.

Interface sketch:
```ts
export function createApp(deps: AppDeps): { app: Hono<{ Variables: { principal: Principal; requestId: string } }>; deps: AppDeps };
export class HttpError extends Error { constructor(public status: number, public code: string, message?: string, public details?: unknown) }
```

Test scenarios: Given the app, when `GET /healthz`, then 200 and the body parses with a local Zod copy of T11's shape. Given a route throwing `HttpError(402, 'allowance_exceeded')`, when called, then the body is `{ error: 'allowance_exceeded', … }` and the status 402. Given an unknown throw, when called, then 500 `{ error: 'internal' }` and the message is not in the body. Given `parseBody` with `CreateJobRequest` and `complexity: 9`, then 400 with the Zod issue path.

### U3 — directory-scanned routes

Goal: a context mounts by existing, not by editing a registry (D-WRITE-SURFACES).

Files: Create `services/api/src/app/routes-scan.ts`. Test `services/api/test/routes-scan.test.ts`.

Approach: `scanRoutes(app, { root: new URL('../', import.meta.url) })` lists `src/*/routes.{ts,js}` (dist uses `.js`), dynamic-imports each, and expects `export default` to be a `Hono` instance, with an optional `export const prefix = '/api/v1/<name>'`; default prefix is `/api/v1/<dirname>` except `health` (mounted at `/`) and `auth` (mounted at `/auth`, OGM-011) and `internal` contexts (a context may export `prefix = '/internal/<name>'`). Mount order is alphabetical, logged once at boot as `mounted /api/v1/jobs ← src/jobs/routes.ts`. Anything else under `src/<context>/` is ignored.

Interface sketch:
```ts
export async function scanRoutes(app: Hono, opts?: { root?: URL; only?: string[] }): Promise<{ mounted: { prefix: string; file: string }[] }>;
// services/api/src/<context>/routes.ts
export const prefix = '/api/v1/<context>';   // optional
export default new Hono();
```

Test scenarios: Given a temp context dir with `routes.ts` exporting a Hono with `GET /ping`, when scanned, then `GET /api/v1/<ctx>/ping` is 200. Given a context without `routes.ts`, then it is not mounted. Given `export const prefix = '/internal/x'`, then it mounts there. Given a `routes.ts` whose default export is not a Hono, then boot fails naming the file.

### U4 — principal seam, service and job tokens, resolver registry

Goal: routes can ask "who is calling" before OGM-011/012 exist, failing closed.

Files: Create `services/api/src/app/principal.ts`, `services/api/src/app/job-token.ts`, `services/api/src/app/registry.ts`. Test `services/api/test/principal.test.ts`, `services/api/test/job-token.test.ts`.

Approach: middleware `principalMiddleware` runs resolvers in order and sets `c.var.principal`: (1) `Authorization: Bearer <OGM_INTERNAL_TOKEN>` with header `X-Ogm-Service: intake|voice-host|commit|builder|rooms` → `service`; (2) `Bearer gmj1.…` → `verifyJobToken` → `job`; (3) every resolver registered through `registry.principalResolvers` (OGM-011 adds the session/bearer-session resolver); else `anonymous`. `requirePrincipal(kinds)` helper throws 401. `job-token.ts`: `signJobToken(claims, secret)` and `verifyJobToken(token, secret, now)` with `timingSafeEqual`; default `exp = now + 48h`. `registry.ts`: `{ principalResolvers: Resolver[]; gameResolver: ((gameId) => Promise<{ familyId; ownerId; visibility } | null>) | null }`; `resolveGame` returns `null` until OGM-012 registers, and callers treat `null` as 403 `game_unresolved`.

Interface sketch:
```ts
export type Resolver = (c: Context) => Promise<Principal | null>;
export function signJobToken(claims: Omit<JobTokenClaims,'exp'> & { exp?: number }, secret: string): string;
export function verifyJobToken(token: string, secret: string, now?: number): JobTokenClaims | null;
export function requirePrincipal<K extends Principal['kind']>(c: Context, kinds: K[]): Extract<Principal, { kind: K }>;
```

Test scenarios: Given the internal token and `X-Ogm-Service: intake`, then `{ kind: 'service', service: 'intake' }`. Given the internal token with an unknown service name, then 401. Given a signed job token, then claims round-trip; given `exp` in the past, `null`; given one flipped character in the MAC, `null`. Given no header, then `anonymous` and `requirePrincipal(['user'])` throws 401. Given a registered resolver returning a user, then it wins over anonymous.

### U5 — typed in-process event bus

Goal: notifications and voice briefing react to job and budget changes without import cycles.

Files: Create `services/api/src/app/events.ts`. Test `services/api/test/events.test.ts`.

Approach: `createAppEvents()` wraps Node's `EventEmitter` with the typed `AppEventMap` from the ticket (`notify`, `job.changed`, `budget.changed`); `on`, `off`, `emit` are typed; listeners that throw are caught and logged (one bad subscriber never breaks an emitter); `emit` returns `void` synchronously. Exposed on `AppDeps.events`.

Interface sketch:
```ts
export type AppEventMap = { notify: NotificationTrigger; 'job.changed': { jobId: string; gameId: string; familyId: string; state: JobState }; 'budget.changed': { familyId: string; userId: string } };
export interface AppEvents { on<K extends keyof AppEventMap>(k: K, fn: (e: AppEventMap[K]) => void): () => void; emit<K extends keyof AppEventMap>(k: K, e: AppEventMap[K]): void }
```

Test scenarios: Given a subscriber, when `emit('notify', trigger)`, then it receives the trigger. Given a throwing subscriber and a second subscriber, when emitted, then the second still runs. Given `off()` from `on`'s return, then no further delivery.

### U6 — the six contract files and fixtures

Goal: the exact shapes in the ticket exist as Zod, with fixtures proving every request/response.

Files: Create `packages/contracts/src/api.ts`, `jobs.ts`, `budget.ts`, `analytics.ts`, `reports.ts`, `notifications.ts`; fixtures `packages/contracts/fixtures/jobs/{create-job.request,create-job.accepted,create-job.402,job.json}`, `fixtures/budget/{status,estimate.request,estimate,settings}.json`, `fixtures/analytics/{ingest.request,ingest.response,timeline,rollup}.json`, `fixtures/reports/{create.request,create.response}.json`, `fixtures/notifications/{notification,subscription,trigger.build-done,trigger.job-started,trigger.intake-report}.json`, `fixtures/api/error.json`. Modify `packages/contracts/src/index.ts` (append six `export * from './<family>.js'` lines). Test `packages/contracts/test/backend-fixtures.test.ts` plus the negatives.

Approach: transcribe the ticket's TypeScript verbatim; each file exports schemas and `export type X = z.infer<typeof X>`. Add `fixtures/<family>/<name>.negative.json` cases: `meta` with a `prompt` key, `amountMicroUsd: 1.5`, `jobId: "j_short"`, `kind: "scope"`. Run OGM-004's emit script (name refreshed at pickup, e.g. `pnpm --filter @ogm/contracts emit`) to write `schemas/<family>.v1.schema.json`; commit the output. The `IssueWriter` interface is a `.ts` interface only (no Zod).

Interface sketch: as quoted in the ticket's Contract section (authoritative).

Test scenarios: Given every positive fixture, when parsed with its schema, then ok. Given every negative fixture, then parse fails. Given `CreateJobRequest` without `start`, then it defaults to `'now'`. Given `ActivityMeta` with an unknown key, then `.strict()` rejects it.

### U7 — entrypoint, scripts, docs line

Goal: `pnpm --filter @ogm/api start` runs the built server; `dev` runs `tsx`.

Files: Modify `services/api/package.json` scripts (`build: tsc -b`, `start: node dist/main.js`, `dev: tsx src/main.ts`, `test: vitest run`, `typecheck: tsc -b --noEmit`, `lint: eslint .`), Create `services/api/README.md` (ten lines: env names, how a context mounts, how a sibling adds a table). Modify root `.env.example` (append four names).

Test scenarios: Given the built package and an env file, when `node dist/main.js` starts, then `curl 127.0.0.1:$OGM_API_PORT/healthz` is 200 and `ss -ltn` shows only `127.0.0.1`.

## 4. Verification

```
pnpm install
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/contracts test
pnpm --filter @ogm/db test
pnpm --filter @ogm/api test
pnpm -r build
OGM_API_PORT=48080 OGM_DATA_DIR=/tmp/ogm-010 OGM_INTERNAL_TOKEN=x OGM_JOB_TOKEN_SECRET=y node services/api/dist/main.js &
curl -s http://127.0.0.1:48080/healthz; ss -ltn | grep 48080
```
Paste into `## Local tests`: the test counts per package, the `healthz` body, the `ss` line showing `127.0.0.1:48080`, and the `migrate` output (`applied: [20261101000000_app_meta]` then `applied: []`).

## 5. Deferred to implementation

- Zod major version: use whatever OGM-004 pinned in `packages/contracts` (default: the same import, `zod`).
- Config loader call shape: refresh from `packages/config` at pickup (default: a `loadEnv(names)` that throws listing missing names).
- JSON Schema emit command name: refresh from OGM-004's `package.json` (default: `pnpm --filter @ogm/contracts emit`).
- `better-sqlite3` vs `node:sqlite`: `better-sqlite3` (D-DB; T01 §6 risk 7).
- Whether `dist` is committed: no; CI builds.
- Request logging format: one JSON line per request with method, path, status, ms, request id; no bodies.

## 6. Scope boundaries

- No auth routes, cookies or sessions: OGM-011. No `authorize()` or families: OGM-012. No job, budget, analytics, report, notification or admin routes: OGM-013 to OGM-018. No unit or env files: OGM-002, OGM-003. No contracts tooling or barrel creation: OGM-004. No `commit.ts`, `chat.ts`, `voice.ts`, design-log or room contracts: OGM-035, OGM-080, OGM-085, OGM-040, OGM-050.

## 7. Risks

- `better-sqlite3` native build needs network at install (allowed for tickets); default: pin the version whose prebuilt binary resolves on Node 24.
- Route scan with `tsx` in dev vs `dist` in prod resolves different extensions; default: scan both `.ts` and `.js` and test both paths.
- Contract drift once consumers start: default: additive edits only; any change to a quoted shape goes through the Executor and is reflected in this ticket's consumers before merge.
- Phase-4 tickets will race on `packages/contracts/src/index.ts` and `packages/db/src/schema/index.ts`; default: one line per family/context, conflicts resolved by re-adding the line (D-WRITE-SURFACES).
