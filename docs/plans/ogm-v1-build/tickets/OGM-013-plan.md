# OGM-013 plan — admission, budgets, allowance, spend-cap mirror

## 1. Problem frame

Admission is the only place money is committed, and it must be code, not judgment (CLAUDE.md rule 5; E01-12). A request becomes a job only if a family slot is free and the reservation fits today's allowance; otherwise the creator gets four offers. The hard cap goes to aiur as a per-ticket spend cap so the agent is stopped inside aiur, and OGM reconciles afterwards. Queued-at-reset jobs start themselves. Everything is integer micro-dollars in a family-local day.

Requirements trace: R10 → `allowances`, `family_budget_settings.resetZone`, `nextReset`, friendly unit fields stored (display is elsewhere). R11 → slots, size-class reservation, 1× pause via aiur's cap, hard cap mirrored, platform cap visible. R12 → 402 with `offers`, `start: 'at_reset'`, scheduler, `job.started`. R13 → `recordUsage`/`releaseReservation` seams and terminal release (OGM-033 drives the polling).

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T01-backend-core.md` lines 180–196 (the HTTP contract) and E01-12 (rules). The route is a transcription of that block.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B8-aiur-integration-budgets-bugs.md` lines 108–134 ("Game Maker owns" vs "aiur is reused for"; accounting rules). Copy the split: OGM owns slots, reservation, queue, stop decision; aiur owns per-ticket turns/duration/retries and the cap trip.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T02-aiur-integration.md` lines 182–198 (`AiurClient`) and E02-4 (cap after filing, 409 when exhausted).
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/tickets/OGM-010-plan.md` U5 (`AppEvents`), U1 (schema + migration), U3 (context mounting).

Repository conventions (state in the PR): pnpm workspace; `build`/`test`/`typecheck`/`lint`; Vitest with fake timers for the scheduler; API binds `127.0.0.1`; secrets only from `packages/config` names (`AIUR_*` tokens are OGM-034's per-daemon env, reached through the `AiurClient` instance the builder hands this code); no new dependency (no date library: `Intl` is enough); PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — tables, seed, migration

Goal: the rows the contract names exist.

Files: Create `packages/db/src/schema/jobs.ts`, `packages/db/src/schema/budget.ts`, `packages/db/migrations/<ts>_jobs_budget.sql`. Modify `packages/db/src/schema/index.ts`.

Approach: `jobs` columns = `Job` fields in snake_case with `plan` and `reservation` as JSON text, indexes on `(family_id, state)`, `(game_id, created_at)`, unique `(creator_id, idempotency_key)`; `family_budget_settings(family_id PK, reset_zone, unit_label, micro_usd_per_unit, platform_cap_micro_usd, slots_new_game, slots_edit, hard_cap_multiplier)`; `allowances(family_id, user_id, daily_micro_usd, PRIMARY KEY(family_id,user_id))`; `budget_ledger(id, family_id, user_id, job_id, kind reservation|release|usage|adjustment, amount_micro_usd, aiur_run_id, at, day_key TEXT)` where `day_key` is `YYYY-MM-DD` in the family zone at write time (so "today" is a plain equality); `size_classes(kind, size_class, p50_micro_usd, p80_micro_usd, samples, PRIMARY KEY(kind,size_class))` with the twelve seed rows (three kinds × four classes; repair rows = one third).

Test scenarios: Given the migration, then the twelve seed rows exist and `repair/large.p80 = 3000000`.

### U2 — state machine

Goal: a pure, exhaustively tested transition table.

Files: Create `services/api/src/jobs/state.ts`. Test `services/api/test/jobs-state.test.ts`.

Approach: `const TRANSITIONS: Record<JobState, Partial<Record<JobEvent, JobState>>>` with events `admit`, `file`, `run`, `pause`, `resume`, `finish`, `fail`, `cancel`; `transition(state, event)` returns the next state or throws `HttpError(409, 'invalid_transition', `${state}→${event}`)`. `isTerminal(state)`, `holdsSlot(state)` (`admitted|filed|running|paused_budget`).

Interface sketch:
```ts
export type JobEvent = 'admit'|'file'|'run'|'pause'|'resume'|'finish'|'fail'|'cancel';
export function transition(state: JobState, event: JobEvent): JobState;
```

Test scenarios: one `it` per cell of the 8×8 table; the allowed set is exactly `queued→admit→admitted`, `queued→cancel`, `admitted→file`, `admitted→cancel`, `admitted→fail`, `filed→run`, `filed→cancel`, `filed→fail`, `running→pause|finish|fail|cancel`, `paused_budget→resume|cancel|fail`.

Execution note: test-first.

### U3 — reset time and allowance arithmetic

Goal: "today" and "remaining" are exact for any zone.

Files: Create `services/api/src/budget/reset.ts`, `services/api/src/budget/allowance.ts`, `services/api/src/budget/ledger.ts`, `services/api/src/budget/settings.ts`. Test `services/api/test/reset.test.ts`, `services/api/test/allowance.test.ts`.

Approach: `dayKey(now, zone)` via `Intl.DateTimeFormat('en-CA', { timeZone: zone, year, month, day })`; `nextReset(now, zone)`: find the first instant after `now` whose `dayKey` differs, by stepping from `now` to the next UTC hour boundaries and bisecting to the minute (bounded loop, no library), returned as ISO. `getSettings(familyId)` returns stored or defaults (never writes). `remaining(familyId, userId, now)` = `daily(userId)` − Σ ledger `reservation` − Σ `usage` where `usage` rows exceed the job's reservation (per job: `max(0, usage − reservation)` summed) for `day_key = today`, floored at 0 for display; `familyDayTotal(familyId, now)` = Σ reservations + excess usage across members; `platformCapReached(familyId, add)` = `familyDayTotal + add > settings.platformCapMicroUsd`. `ledger.ts`: `reserve(job)`, `release(job, unused)`, `usage(job, amount, runId)`, `adjustment(familyId, userId, amount, note)` each one insert with `day_key`.

Interface sketch:
```ts
export function nextReset(now: Date, zone: string): Date;
export function remaining(db, familyId: string, userId: string, now: Date): { remainingMicroUsd: number; dailyMicroUsd: number; resetsAt: string };
```

Test scenarios: Given `2026-11-01T06:59:00Z` and `America/Los_Angeles`, then `nextReset` is `2026-11-01T07:00:00Z`; given the DST change night (`2026-11-01` 01:30 PT), then the next reset is still the next local midnight. Given daily 5000000 and reservations 3000000 today and 4000000 yesterday, then remaining 2000000. Given usage 3500000 on a 3000000 reservation, then remaining drops by 500000 more. Given an unset allowance, then the default from env.

### U4 — admission route

Goal: T01 §4 `POST /api/v1/jobs` exactly.

Files: Create `services/api/src/jobs/admission.ts`, `services/api/src/jobs/repo.ts` (queries), `services/api/src/jobs/routes.ts`. Test `services/api/test/admission.test.ts`.

Approach: `admit(db, events, request: CreateJobRequest, actor: Actor, now)` inside `sqlite.transaction(() => …)` with `BEGIN IMMEDIATE`: (1) `resolveGame` → 404; `authorize(actor, 'job.create', { gameId, ownerId, familyId })` → 403 (repairs are admitted by OGM-015 with `actor` = the game owner); (2) `branchId !== 'main'` → 409 `branch_not_main`; (3) idempotency lookup → return the stored 202 body; (4) size class from `kind`+`complexity` (ticket rule) → `size_classes` row → `reservation = { amountMicroUsd: p80, sizeClass, confidence: samples >= 20 ? 'high' : samples >= 5 ? 'medium' : 'low' }`; (5) platform cap → 402 `platform_cap_reached`; (6) `start === 'now'` and `reservation > remaining` → 402 `allowance_exceeded` with `offers` (all four; `ask_admin` omitted when the caller is the only admin); `start === 'at_reset'` → check against tomorrow's full daily allowance, else 402 with offers `['trim','split']`; (7) slot: `slot = kind === 'new_game' ? 'new_game' : 'edit'`; count `holdsSlot` jobs in the family for that slot; free → `admitted`, else `queued` with `position` = count of `queued` jobs for that slot + 1; `at_reset` always `queued` with `startAt = nextReset`; (8) insert the job, `ledger.reserve`, `events.emit('job.changed')`; `hardCapMicroUsd = round(p80 × hardCapMultiplier)`. Routes: `POST /` → 202/402; `GET /?gameId=` and `GET /:id` under `game.play`-or-owner read; `PATCH /:id` (queued only, plan edits) owner; `POST /:id/cancel` (queued → cancelled, release) owner; `POST /:id/raise-cap` → `admin.budget.set` → U5.

Interface sketch:
```ts
export function admit(deps: { db; events; now?: () => Date }, req: CreateJobRequest, actor: Actor): CreateJobAccepted;   // throws HttpError(402, …, AllowanceExceeded)
```

Test scenarios: AE1 both branches (ticket). Given three running edits, when a fourth feature is requested, then `queued`, `position: 1`, no reservation shortage. Given a running `new_game`, when a second is requested, then `queued`. Given a `repair`, then slot `edit`. Given the same `idempotencyKey` twice, then the same `jobId` and one ledger row. Given `start: 'at_reset'` and daily 5000000 vs p80 9000000, then 402 with `['trim','split']`. Given a player actor, then 403. Given two concurrent admissions for the last slot (run sequentially inside one test against the same DB), then one is `admitted` and one `queued`.

### U5 — spend-cap mirror and siblings' seams

Goal: the aiur cap equals the job's hard cap before `agent:todo` can be applied.

Files: Create `services/api/src/jobs/spend-cap.ts`. Test `services/api/test/spend-cap.test.ts`.

Approach: `markFiled(deps, jobId, { repo, issueNumber }, aiur: AiurClient)`: update `aiur_repo`, `aiur_issue_number`; `await aiur.setSpendCap(String(issueNumber), toUsdString(hardCapMicroUsd))` where `toUsdString(9000000) === "9.000000"`; on success store `aiur_spend_cap_micro_usd`, `transition('file')`, emit; on failure leave `admitted` and rethrow `HttpError(502, 'spend_cap_failed')`. `raiseCap(deps, jobId, amountMicroUsd, aiur)`: adds an `adjustment` ledger row for the delta on the creator's day, sets `hard_cap_micro_usd`, calls `setSpendCap`; when aiur answers 409 `spend_cap_exhausted` (E02-4: an exhausted cap cannot be edited) it keeps `pausedReason: 'budget_exhausted'` and returns 409 `cap_exhausted_upstream` for OGM-033 to resolve; on success it runs `transition('resume')` when the job was `paused_budget`. Seams: `markRunning`, `markPaused(reason)`, `markTerminal(state)` (release unused: `reservation − min(usage, reservation)`), `recordUsage(jobId, microUsd, runId)` (upsert `usage_micro_usd` on the row and one ledger row per `(job, runId)` delta), `releaseReservation(jobId)`.

Interface sketch:
```ts
export function toUsdString(microUsd: number): string;   // "9.000000"
export async function markFiled(deps, jobId: string, ticket: { repo: string; issueNumber: number }, aiur: Pick<AiurClient,'setSpendCap'>): Promise<Job>;
```

Test scenarios: Given an `admitted` job and a fake client, when `markFiled`, then `setSpendCap('142', '9.000000')` was called and the row is `filed` with the cap stored. Given the fake throws, then the row stays `admitted` with `aiur_issue_number` set and `aiur_spend_cap_micro_usd` null. Given `markTerminal('done')` with usage 2500000 on reservation 4000000, then a `release` row of 1500000. Given `recordUsage` twice for the same run with 1000000 then 1500000, then ledger rows 1000000 and 500000.

### U6 — scheduler

Goal: queued jobs start without a human.

Files: Create `services/api/src/jobs/scheduler.ts`. Modify `services/api/src/main.ts` (one `startScheduler(deps)` call). Test `services/api/test/scheduler.test.ts`.

Approach: `tick(deps, now)`: (a) for each family with `queued` jobs: `at_reset` jobs with `startAt <= now` become eligible; (b) for each slot, while free slots remain, take the oldest eligible queued job → `transition('admit')`, emit `job.changed` and `job.started` (`userIds: [creatorId]`); `startScheduler` runs `tick` every 60 s with an in-flight guard; exported `tick` for tests. OGM-031 subscribes to `job.changed` with `state: 'admitted'` to file.

Test scenarios: Given a fake clock at `resetsAt − 1 s`, when `tick`, then nothing; at `resetsAt`, then the job is `admitted` and `job.started` emitted once. Given two queued edits and one free slot, then the older starts. Given a tick that throws midway, then the next tick still runs.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- jobs budget
pnpm -r typecheck && pnpm -r lint
curl -s -X POST http://127.0.0.1:$OGM_API_PORT/api/v1/jobs -H "cookie: $SESSION" -H 'content-type: application/json' -d @packages/contracts/fixtures/jobs/create-job.request.json
```
Paste into `## Local tests`: the transition-table count, the AE1 outputs (402 body and 202 body), the scheduler test names, and the `toUsdString` cases.

## 5. Deferred to implementation

- Whether `admitted` jobs that never get filed within 10 minutes are failed by the scheduler: default yes, `fail` with `pausedReason: null` and a `release` row, so a dead filer cannot hold a slot.
- `ask_admin` omission rule: omit when the family has no admin other than the caller.
- Position semantics for mixed `now`/`at_reset` queues: `at_reset` jobs are excluded from `position` counts until eligible.
- Day-key timezone source: `family_budget_settings.reset_zone`, defaulting to `OGM_RESET_ZONE_DEFAULT`.

## 6. Scope boundaries

- Issue filing, labels, `agent:todo`, `control todo`: OGM-031. Lifecycle events → stages, `budget-exhausted` detection: OGM-032. Running cancel, pause/resume, usage polling: OGM-033. Estimate from a summary, `budget/status`, briefing push: OGM-018. Admin settings and allowance routes: OGM-017. Repair classification: OGM-015. UI offers: OGM-074.

## 7. Risks

- aiur's cap may not trip on subscription runs if `api_equivalent.coverage` is partial (E02-4): default: the cap is still set; OGM-033's reconciliation compares `/usage` totals and cancels at the hard cap as the backstop.
- Allowance vs reservation confusion in display: default: creators only ever see the friendly unit via OGM-018/074; this ticket never formats dollars.
- Seed numbers are guesses: default: low confidence until ≥5 samples; OGM-018 refines; admins can edit `size_classes` later (not V1 UI).
- DST and zone edge cases in `nextReset`: default: the bisection approach with tests on the DST nights; if `Intl` lacks a zone name, fall back to UTC and log once.
