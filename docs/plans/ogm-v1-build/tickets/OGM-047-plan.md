# OGM-047 plan — Achievements and creator analytics

## 1. Problem frame

Two small, closed subsystems that players touch on every published session: permanent, idempotent achievement awards validated against a per-release catalog, and pseudonymous first-party gameplay events rolled up nightly into the creator's numbers. Both must ignore drafts, store no free text, and need no model call. The SDK side is four analytics calls and two achievement calls over the existing bridge `event` envelope.

Requirements trace: R96 → achievements permanent, keyed by slug from `achievements.json`, idempotent, never awarded in drafts; creator analytics first-party with pseudonymous ids, daily rollups, 90-day raw retention, drafts excluded.

## 2. Patterns to follow

- `services/api/src/analytics/*` (OGM-014, refresh): ingestion with allow-listed `meta`; copy the validation style for `props` and the rate limit middleware.
- `services/api/src/design/store.ts` (OGM-041): `BEGIN IMMEDIATE` writes; the award insert uses Drizzle's `onConflictDoNothing()` with `changes` read back.
- `packages/sdk/src/core/*` (OGM-022): bridge send helper and the `build: 'draft'|'test'|'published'` value from `hello`; copy the module and test harness shape.
- `docs/research/v0.3/A5-releases-saves-achievements-analytics-rewind.md` §4.3 (SQL, tests list) and §5.2–5.5 (vocabulary, derived metrics, minimisation), verified at 9508c1c; encode §4.3's five tests and §5.2's derived metrics as tests.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest; API binds `127.0.0.1`; secrets via `packages/config` only (none new; salts live in the database); no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Schema and migrations

Goal: six tables in two migrations.

Files: Create `packages/db/src/schema/achievements.ts`, `packages/db/src/schema/creator-analytics.ts` (+ barrel lines); migrations `<ts>_achievements.sql`, `<ts>_creator_analytics.sql`.

Approach: tables as listed in the ticket; `achievement_awards.source` check in (`client`,`room`,`admin`); `achievement_audit (id, user_id, game_id, key, action, by_user_id, at)`; `creator_analytics_events.props` text with a length check ≤ 1024; index `(game_id, ts)` and `(game_id, env, release_id)`; `creator_analytics_daily` upsert key as in the ticket.

Test scenarios:
- Given migration, then tables exist; a second award with the same PK is ignored by `ON CONFLICT DO NOTHING`.

### U2 — Catalog, lint, awards, progress

Goal: registration with lint; idempotent award and monotonic progress.

Files: Create `services/api/src/achievements/{catalog,lint,store}.ts`; Test `achievements.store.test.ts`, `lint.test.ts`.

Approach: `lintCatalog(prev: AchievementDef[] | null, next: AchievementDef[])`: keys unique, slug pattern `^[a-z0-9-]{1,64}$`; every key in `prev` must be in `next` (possibly `retired: true`); a key retired in `prev` cannot appear un-retired in `next`; title/description/icon changes allowed. `registerCatalog(db, gameId, releaseId, defs)`: lint against the latest registered catalog; upsert `achievement_defs` (`first_release_id` kept, `retired_release_id` set when `retired`); store the release's key list in `achievement_catalogs (game_id, release_id, keys JSON)` (add to U1). `award(db, {userId, gameId, key, releaseId, source})`: catalog for `releaseId` must exist (`NotPublished`), key present and not retired (`UnknownKey`/`Retired`); insert on conflict do nothing; `newlyAwarded = changes === 1`. `progress`: upsert `value = max(old, new)`; if `value >= target` → `award`. `copyCatalog(db, fromGameId, toGameId, releaseId)` for OGM-048 (defs only, `first_release_id` = the fork's first release id when it exists, else null). `revoke` with an audit row.

Interface sketch:
```ts
export function registerCatalog(db, gameId: string, releaseId: string, defs: AchievementDef[]): void;   // throws LintError[]
export function award(db, a: { userId; gameId; key; releaseId; source: 'client'|'room'|'admin' }): { newlyAwarded: boolean };
export function progress(db, p: { userId; gameId; key; value: number; releaseId }): { value: number; newlyAwarded: boolean };
export function copyCatalog(db, fromGameId: string, toGameId: string, releaseId: string): number;
```

Test scenarios:
- Given a catalog with `first-dungeon`, when awarded 1,000 times via `Promise.all`, then one row and one `newlyAwarded:true` (sqlite serialises; the test asserts the count).
- Given `releaseId` with no catalog, then `NotPublished` and zero rows.
- Given a retired key, then `Retired`; given an unknown key, then `UnknownKey`.
- Given progress 3 then 5 on target 5, then `{value:5, newlyAwarded:true}`; then 4 → value stays 5.
- Given `prev` has `shrines` and `next` lacks it without `retired`, then `LintError`; with `retired:true`, then ok; a later catalog re-adding `shrines` un-retired → `LintError`.
- Given `copyCatalog`, then defs copied and zero awards/progress rows for the new game.

Execution note: test-first on idempotency and lint.

### U3 — Achievement routes

Goal: award, progress, catalog read, admin revoke.

Files: Create `services/api/src/achievements/routes.ts`; Test `achievements.routes.test.ts`.

Approach: policy `game.play` for award/progress/read (user from session); `admin` platform role for `DELETE …/awards/:userId/:key`. Rate limit 30 award calls/min per user per game (reuse OGM-010's limiter if present). `GET …/achievements` returns catalog entries with `earned`, `awardedAt`, `progress`, and `title/description: '???'` for hidden unearned keys.

Test scenarios:
- Given the worked data, then the three responses match; a hidden unearned key reads `???`.
- Given a non-admin on `DELETE`, then 403.

### U4 — Event ingestion and pseudonymisation

Goal: events stored with server-stamped pseudonyms and strict shapes.

Files: Create `services/api/src/creator-analytics/{routes,ingest,pseudonym}.ts`; Test `ingest.test.ts`, `pseudonym.test.ts`.

Approach: `pseudonym.ts`: `saltFor(db, gameId)` (create on first use, 32 random bytes, `rotated_at`); `pseudoUserId = hex(HMAC-SHA256(salt, userId))`. `ingest(db, userId, gameId, events)`: per event validate with `AnalyticsEventSchema.omit({pseudoUserId, gameId})` plus the allow-list for `props` keys `{device, input, tier, release}` and `name` in the fixed vocabulary (`session_start`, `session_end`, `active_heartbeat`, `game_load_failed`, `error`, `bug_report`, `update_offered`, `update_accepted`, `save`, `load`, `attempt_start`, `attempt_end`, `marker`, `complete`); reject individually (`rejected` count with reasons); cap 200 per request (413); stamp `pseudoUserId`, insert in one transaction. Rate limit 5 requests/min per session.

Interface sketch: `POST /api/v1/games/:g/play-events {events} → 202 {accepted, rejected, reasons?}`.

Test scenarios:
- Given the same user in two games, then different `pseudoUserId`s; the same user twice in one game → equal.
- Given `props: {note:'hello'}`, then that event is rejected with `props_key`.
- Given `name: 'chat_text'`, then rejected with `name`.
- Given 201 events, then 413.

### U5 — Rollup, retention, salt rotation

Goal: the nightly script computing A5's derived metrics, deleting raw rows older than 90 days, rotating salts.

Files: Create `services/api/src/creator-analytics/rollup.ts` (exports `rollup(db, day)` and a CLI `main`); add `"rollup": "node dist/creator-analytics/rollup.js"` to `services/api/package.json`; Test `rollup.test.ts` with a fixture day.

Approach: for each `(game, day, release)` over `env='published'`: `plays` = sessions (`session_start` count), `players` = distinct pseudonyms, `attempts`/`clears` per scope (`attempt_start` / `attempt_end outcome=complete`), `medianActiveSec` from `active_heartbeat` counts ×30 per session, `completionRate` = players with `complete` ÷ players, `dropOff` = furthest `marker` per non-completing player (stored as counts per marker), `stuck` = scopes with ≥ 5 fails by one pseudonym or > 10 active minutes since the last marker, `versionAdoption` = sessions by release. `testRuns` = count of `env='draft'` sessions (one metric, the creator's own). Upsert into `creator_analytics_daily`. Then delete raw rows with `ts < now - 90 days`; rotate salts whose `rotated_at` is older than 30 days. Idempotent per day. `--dry-run` prints counts.

Test scenarios:
- Given the fixture day (3 sessions, 2 players, 5 fails on `level-3` by one player, one `complete`), then `plays 3`, `players 2`, `clearRate(level-3) 0`, `stuck` lists `level-3`, `completionRate 0.5`.
- Given raw rows at 91 days, then deleted; daily rows remain.
- Given a rerun for the same day, then identical rows (upsert).
- Given a salt older than 30 days, then rotated and new events use it.

### U6 — Creator query routes

Goal: four read endpoints over the daily table.

Files: Create `services/api/src/creator-analytics/query.ts`; Modify `routes.ts`; Test `query.test.ts`.

Approach: `overview`, `funnel` (markers in declared order from the manifest if available, else by first-seen), `attempts` (per scope), `releases` (adoption); `from`/`to` default last 30 days; policy `game.edit` (the creator) or admin; `env='published'` only; `testRuns` surfaced in `overview`.

Test scenarios:
- Given rollup rows for two days, then `overview` sums plays and recomputes rates from sums (not averages of rates).
- Given a non-creator, then 403.

### U7 — SDK modules

Goal: `@gm/sdk/achievements` and `@gm/sdk/analytics`.

Files: Create `packages/sdk/src/achievements.ts`, `packages/sdk/src/analytics.ts`; export from the SDK index; Test `packages/sdk/test/achievements.test.ts`, `analytics.test.ts`.

Approach: both take the core's `bridge` and `buildKind` (from `hello`). `achievements.award(key)`: dedupe in a `Set`; if `buildKind !== 'published'` → call `onTestToast(key)` and return; else send `event {kind:'achievement', payload:{op:'award', key}}` once. `progress(key, n)`: keep local max; send `{op:'progress', key, value}` when it rises. `analytics.attemptStart(scope)` records the open attempt; `attemptEnd(scope, outcome, markerId?)` requires an open attempt (warn and drop otherwise); `marker(id)`; `complete()`; each sends `event {kind:'analytics', payload:{name, scope?, marker?, outcome?}}`; `ts`, `sessionId`, `branchId`, `releaseId`, `env` are stamped by the host (OGM-075) which knows them. The host forwards achievement payloads through OGM-046's `Outbox` (import when merged).

Interface sketch:
```ts
export function createAchievements(bridge, buildKind, hooks?: { onTestToast?(key: string): void }): { award(key: string): void; progress(key: string, n: number): void };
export function createAnalytics(bridge): { attemptStart(scope: string): void; attemptEnd(scope: string, outcome: 'complete'|'fail'|'quit', markerId?: string): void; marker(id: string): void; complete(): void };
```

Test scenarios:
- Given `published` and `award` called 60 times in a loop, then one envelope.
- Given `draft`, then zero envelopes and one `onTestToast('first-dungeon')`.
- Given `attemptEnd` without `attemptStart`, then no envelope and a warning.
- Given `progress(k, 3)` then `progress(k, 2)`, then one envelope with value 3.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- achievements
pnpm --filter @ogm/api test -- creator-analytics
pnpm --filter @gm/sdk test -- achievements analytics
pnpm --filter @ogm/api build && pnpm --filter @ogm/api rollup --dry-run
pnpm -r typecheck && pnpm lint
```
Paste the Vitest summaries (name the 1,000-award and fixture-day rollup tests), the dry-run output, and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Where `achievements.json` is read at publish: default OGM-045 reads `<artifactPath>/achievements.json` and calls `registerCatalog`; this ticket ships the function and a test.
- Rate limiter: default reuse OGM-010's; else a 20-line token bucket in `services/api/src/achievements/limit.ts`.
- Marker order for the funnel: default manifest-declared if OGM-020 has `markers`, else first-seen.
- Salt rotation cadence: default 30 days.

## 6. Scope boundaries

- No dashboard UI (OGM-079), no toast UI (OGM-075), no host forwarding (OGM-075/OGM-028).
- No build analytics or aiur join (OGM-014).
- No room-authoritative awards, friends' views, unlock percentages (post-V1).
- No systemd timer unit (OGM-002/OGM-008 ops add `ogm-rollup.timer` calling the script).

## 7. Risks

- Catalog registration depends on OGM-045's publish path: default the function exists here with tests; OGM-045 wires one call.
- Over-collection by accident: default a closed `name` vocabulary and a closed `props` allow-list enforced per event.
- Rollup cost on this host: default nightly single pass under the ops timer with `nice`; measured on the fixture.
