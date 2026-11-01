# OGM-014 plan — activity ingestion, aiur phase join, timeline and roll-ups

## 1. Problem frame

Admins need to see what a build spent its time on (asset pipeline, level building, gameplay code, …) next to aiur's phases and cost, per build and rolled up, without any prompt or source text being kept (R66, C2 §1). aiur cannot carry custom events, so OGM records activities at the source and joins by `jobId` and aiur run id. This ticket is the server side: strict ingest, a phase table for the aiur lane to fill, and two reads.

Requirements trace: R66 → nine-activity taxonomy enforced by `Activity`; events recorded at source via job tokens and sessions; join by `jobId`/`aiurRunId`; `timeline` merges phases and activities with cost and retries; `rollups` per game and member; `.strict()` meta means no prompt or source text.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C2-v1-scope-additions.md` lines 66–98: the taxonomy, "record at the source", the join rule and the admin view list. The `timeline` response mirrors item 4.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T02-aiur-integration.md` E02-5 (progress `events[] {type, phase, transition, at}`): `aiur_phase_events` stores exactly those fields so OGM-032 can copy them through.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U4 (`registry.gameResolver`, job-token principal) and U6 (fixtures as tests).
- aiur's privacy rule in `/home/orangekid/github/aiur/src/lib/aiur/run_telemetry/lifecycle.ex` lines 1–8 (categories, timings, counts only): copy the stance, not the code.

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest; API binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — tables and migration

Goal: two tables with the indexes the reads need.

Files: Create `packages/db/src/schema/analytics.ts`, `packages/db/migrations/<ts>_analytics.sql`. Modify `packages/db/src/schema/index.ts`.

Approach: `activity_events(id, ts, received_at, family_id, game_id, job_id NULL, aiur_run_id NULL, attempt_id NULL, actor, activity, boundary, source, meta_json, principal_kind, principal_id)` with `CHECK(activity IN (…nine…))`, indexes `(job_id, ts)`, `(game_id, ts)`, `(family_id, ts)`; `aiur_phase_events(job_id, phase, transition NULL, at, source, UNIQUE(job_id, phase, at))`.

Test scenarios: Given the migration, then an insert with `activity = 'thinking'` fails the CHECK.

### U2 — ingest

Goal: per-event validation and authorization, one transaction per batch.

Files: Create `services/api/src/analytics/ingest.ts`, `services/api/src/analytics/routes.ts`. Test `services/api/test/analytics-ingest.test.ts`.

Approach: `POST /` (prefix `/api/v1/analytics`): `requirePrincipal(c, ['job','user'])`; parse the body with `IngestRequest` but using `safeParse` per element so one bad event yields a `rejected[]` entry instead of a 400 (the envelope `events` array itself must parse, else 400). For each event: job principal → `gameId === token.gameId` else `game_mismatch`; `jobId ??= token.jobId`, `familyId = token.familyId`; user principal → `actor === 'human'` else `actor_not_human`; `jobId` must be absent else `job_not_allowed`; `resolveGame(gameId)` → `null` → 403 for the whole batch (`game_unresolved`), family mismatch → `cross_family` per event; `ts` window check; `meta.command` rule for `gm_cli`; dedupe inside the batch on `(jobId ?? gameId, ts, activity, boundary, source)`. Insert accepted rows in one transaction; return `IngestResponse`. Log one line `{ accepted, rejected, principal: kind }`.

Interface sketch:
```ts
export function ingest(deps: { db; registry }, principal: Principal, body: unknown, now: Date): IngestResponse;   // throws HttpError(400|401|403)
```

Test scenarios: Given the worked fixture with a job token, then `{ accepted: 2, rejected: [] }` and two rows with `job_id` from the token. Given a third event with `meta.prompt`, then rejected index 2 with the Zod message. Given game B's event under game A's token, then `game_mismatch`. Given a user principal and `actor: 'agent'`, then `actor_not_human`. Given no game resolver registered, then 403. Given `ts` 8 days old, then `ts_out_of_range`. Given two identical events, then `accepted: 1`.

Execution note: test-first from the fixtures.

### U3 — phase recorder

Goal: OGM-032 has one function to call.

Files: Create `services/api/src/analytics/phases.ts`. Test `services/api/test/analytics-timeline.test.ts` (shared).

Approach: `recordAiurPhase(db, e)` inserts with `INSERT OR IGNORE` on the unique key; validates `phase` with `AiurPhase`; `listPhases(db, jobId)` ordered by `at`.

Test scenarios: Given the same `(jobId, phase, at)` twice, then one row. Given `phase: 'ship'`, then throws.

### U4 — timeline

Goal: one build's phases and activities in order.

Files: Create `services/api/src/analytics/timeline.ts`. Test `services/api/test/analytics-timeline.test.ts`.

Approach: `buildTimeline(db, jobId)`: phases from U3; activities: load events for the job ordered by `ts`; keep a map keyed `(activity, actor, source)` of open starts; `start` opens (a second `start` for the same key closes the previous with `endedAt = ts` of the new one and opens again), `end` closes the open one (an `end` without a start becomes a `point` with `startedAt = endedAt = ts`), `point` is a zero-length activity; unmatched starts stay open (`endedAt: null`). `usageMicroUsd` and `retries` come from the `jobs` row when `schema.jobs` exists (feature-detect the Drizzle table at module load), else `null`; `retries` = count of `aiur_phase_events` with `transition = 'rework'` when known, else `null`. Route `GET /builds/:jobId/timeline` → admin read of the family that owns the job (family from the job's events; 404 when no events and no job).

Interface sketch:
```ts
export function buildTimeline(db, jobId: string, now: Date): BuildTimeline;
```

Test scenarios: Given `start` at 10:00 and `end` at 10:05 for `playtesting/agent/gm_cli`, then one activity with `endedAt` 10:05. Given two `start`s then one `end`, then two activities, the first closed at the second's `ts`. Given an `end` with no `start`, then a zero-length activity. Given phases `work` at 09:55 and `review` at 10:10, then `aiur.phases` has both in order. Given no `jobs` table, then `usageMicroUsd: null`.

### U5 — roll-ups and retention

Goal: per-game and per-member sums; raw events expire.

Files: Create `services/api/src/analytics/rollup.ts`, `services/api/src/analytics/retention.ts`. Modify `services/api/src/main.ts` (one `startAnalyticsRetention(deps)` call). Test `services/api/test/analytics-rollup.test.ts`.

Approach: `rollup(db, { scope, id, from, to, familyId })`: `game` → events where `game_id = id`; `member` → events whose `job_id` belongs to jobs with `creator_id = id` (when `jobs` exists) plus events with `principal_kind = 'user' AND principal_id = id`; group by `activity`: `count` = closed activities (from the same pairing as U4, computed per job) and `durationMs` summed; `builds` = distinct `job_id`; `usageMicroUsd` = Σ `jobs.usage_micro_usd` when known else `null`. Route `GET /rollups` with Zod query `{ scope, id, from, to }`, defaults `to = now`, `from = to − 30 d`, max span 366 d; family scope enforced via `resolveGame` for `game` and via the admin's own family for `member`. `retention.ts`: daily `DELETE FROM activity_events WHERE ts < now − OGM_ANALYTICS_RETENTION_DAYS`.

Interface sketch:
```ts
export function rollup(db, q: { scope: 'game'|'member'; id: string; from: Date; to: Date; familyId: string }): Rollup;
```

Test scenarios: Given two jobs in game A and one in game B, when `scope: 'game', id: A`, then `builds: 2` and only A's activities. Given a member with one job and one editor event, then both count under `member`. Given an admin of family X reading game Y, then 403. Given events 91 days old, when retention runs, then they are gone and newer ones stay.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- analytics
pnpm -r typecheck && pnpm -r lint
curl -s -X POST http://127.0.0.1:$OGM_API_PORT/api/v1/analytics/events -H "authorization: Bearer $JOB_TOKEN" -H 'content-type: application/json' -d @packages/contracts/fixtures/analytics/ingest.request.json
```
Paste into `## Local tests`: test counts, the fixture's `{ accepted: 2, rejected: [] }`, the negative fixture's `rejected` entry, and one timeline JSON (abbreviated).

## 5. Deferred to implementation

- Whether `member` roll-ups include `human` editor events without a job: yes (they are the creator's hand edits).
- Materializing daily roll-ups: not in V1 (compute on read; <100k rows expected).
- `meta.command` regex strictness: `^gm(\s|$)` by default; widen only with a listed reason.
- Pairing key for activities: `(activity, actor, source)`; `jobId` scoping is implicit.

## 6. Scope boundaries

- Emitters (gm CLI, skills, editor, SDK): OGM-060/090/091/075/022. Shipping `$GM_EVENTS_FILE`: OGM-036/090. aiur feed and projection: OGM-032. Usage reconciliation: OGM-033. Admin screens: OGM-079. Creator/player analytics with pseudonymous ids and nightly roll-ups: OGM-047.

## 7. Risks

- Pairing heuristics misreport when agents forget `end` markers: default: open activities are shown as open (`endedAt: null`) and excluded from `durationMs`, never guessed.
- The `jobs` table may not exist at merge time (phase 5): default: feature-detect and return `null` for cost/retries; add a test for both branches.
- Event volume from `gm` commands in tight loops: default: batch cap 500 and the 7-day window; a per-token rate limit (600 events/min) with 429.
