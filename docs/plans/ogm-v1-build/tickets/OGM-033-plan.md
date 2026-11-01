# OGM-033 plan — Job controls and usage reconciliation

## 1. Problem frame

A creator presses Stop, Pause, or answers a question; an admin wants to know what a build has cost so far; the allowance must get its reservation back when the job ends. aiur provides the primitives (confirmed cancel, pause/resume, operator messages, the decisions API, a per-ticket usage read with exact decimals and per-run sessions, E02-5/7), OGM-013 owns the money rules, and this ticket is the thin, well-tested glue: five routes and one reconciler. Nothing here decides thresholds; everything here is deterministic code (CLAUDE.md rule 5).

**Requirements trace**
- R13 → `reconcileJob` imports aiur's usage by `run_id` into `usage_samples` and the job total; reservations and slots are released on terminal states exactly once.
- R27 → cancel/pause/resume/message/decide are the control side of the creator's job view; the resulting stages come from OGM-032's projection.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur_web/controllers/ticket_cancel_api_controller.ex:10-48` — the four process statuses and error codes the cancel route branches on.
- `/home/orangekid/github/aiur/src/lib/aiur_web/controllers/observability_api_controller.ex:178-242` — `message_id` makes a retry safe; the route passes the chat message id through.
- `/home/orangekid/github/aiur/src/lib/aiur_web/api/usage/ticket_usage.ex:154-199` — `totals.provider_reported`, `totals.api_equivalent.{amount,coverage}`, `sessions[].run_id`; money is a decimal string per currency.
- `/home/orangekid/github/aiur/src/lib/aiur_web/routes/decisions.ex:5-19` — `decide` needs the supervisor bearer plus the `api_write` headers (OGM-030's client sets them).
- OGM-013 `services/api/src/jobs/routes.ts` and `services/api/src/budget/*` — the route style, `authorize` usage and the `applyUsage`/`releaseReservation` entry points to call.
- OGM-032 `services/api/src/jobs/projection.ts` — `job.stage.changed` and `usage.changed` emitter names.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Money helpers and schema
- Goal: exact micro-dollar conversion and the samples table.
- Files: Create `services/api/src/budget/micro.ts` (if OGM-013 did not already export `usdToMicro`; if it did, import and skip), `packages/db/migrations/<ts>_usage_samples.sql`, `packages/db/src/schema/usage-samples.ts`. Test `services/api/test/budget/micro.test.ts`.
- Approach: `usdToMicro("12.345678")` → `12345678n` via string split, pad fraction to 6, reject >6 digits or non-numeric; `microToUsd(n)` → fixed 6-fraction string. Table: `usage_samples(job_id, run_id, repo, issue, provider_reported_micro INTEGER, api_equivalent_micro INTEGER, coverage_status TEXT, observed_at TEXT, PRIMARY KEY(job_id, run_id))`; `ALTER TABLE jobs ADD COLUMN usage_coverage TEXT, released_at TEXT` (if OGM-013 has no `released_at`).
- Interface sketch: `export function usdToMicro(s: string): bigint; export function microToUsd(n: bigint): string;`
- Test scenarios:
  - Given `"0.734512"` then `734512n`.
  - Given `"1"` then `1000000n`.
  - Given `"0.1234567"` then throws.
  - Given `"abc"` then throws.

### U2 — Controls router
- Goal: five routes, policy first, one aiur call each, clear status codes.
- Files: Create `services/api/src/jobs/controls.ts`; Modify `services/api/src/jobs/routes.ts` (one mount line, OGM-013's file, called out in the PR). Test `services/api/test/jobs/controls.test.ts`.
- Approach: `controlsRoutes = new Hono()`; shared `loadJobAndClient(c)`: job by id (404), `authorize(actor, action, {gameId, ownerId, familyId})` (403), `daemonFor(job.aiurRepo)` (may be null). Routes:
  - `POST /:id/cancel`: if `!client` or job stage is `queued_ogm|waiting_capacity` and no issue → mark `cancelled`, release (U4 handles via event), 200. Else `for attempt in 1..3`: `r = client.cancel(issue)`; `exited` → job `cancelled`, 200 `{stage:'cancelled'}`; `AiurHttpError agent_not_running` → `issues.setStateLabel(repo, n, 'cancelled')`, job `cancelled`, 200; `still_running|kill_failed|generation_changed` → wait 3 s; after 3 → 503 `{code:'cancel_unconfirmed', status}` + `alerts.admin('cancel unconfirmed', jobId)`.
  - `POST /:id/pause` / `resume`: client call; 409 from aiur (`auto_resume_pending`, `globally_paused`, …) → 409 with the code; on success set `jobs.pausedReason = 'creator'` / clear.
  - `POST /:id/message` body `{text, messageId}` (zod: text 1–4,000 chars, messageId `^[A-Za-z0-9._:-]{1,128}$`): `client.message(issue, text, messageId)` → 202 `{request_id}`; 409 `message_id_conflict` passthrough.
  - `POST /:id/decide` body `{checkpointId, option?, response?}`: load `checkpoints` row (404; 409 if not `open`); `client.decide(decisionId, {option, response, expected_version: row.version, idempotency_key: \`${decisionId}:${row.version}\`})`; on success row `answered`, 200; `AiurConfigError` (no supervisor token) → 503 `checkpoints_unavailable`.
- Interface sketch: `export const controlsRoutes: Hono<ApiEnv>;` routes as above; responses `{ stage: JobStage }` for cancel/pause/resume.
- Route and status table:

  | route | aiur call | 200 | 4xx | 5xx |
  |---|---|---|---|---|
  | `POST /jobs/:id/cancel` | `cancel` | `exited` or label swap → `{stage:'cancelled'}` | 403 policy, 404 job | 503 `cancel_unconfirmed` after 3 tries |
  | `POST /jobs/:id/pause` | `pause` | `{stage:'paused'}` | 409 aiur code passthrough | 503 daemon down |
  | `POST /jobs/:id/resume` | `resume` | `{stage}` from projection | 409 passthrough | 503 |
  | `POST /jobs/:id/message` | `message(text, messageId)` | 202 `{request_id}` | 409 `message_id_conflict`, 422 body | 503 |
  | `POST /jobs/:id/decide` | `decide` (supervisor) | `{checkpointId, status:'answered'}` | 404 checkpoint, 409 not open | 503 `checkpoints_unavailable` |
- Test scenarios:
  - Given a non-owner then 403 and no client call.
  - Given `cancel` → `exited` then 200 and `cancelled`.
  - Given `still_running` thrice then 503 and the job unchanged.
  - Given `agent_not_running` then `setStateLabel` called and 200.
  - Given no daemon and a queued job then 200 `cancelled` with no label call.
  - Given `message` with `messageId` then the client receives it.
  - Given `decide` on an `answered` checkpoint then 409.
  - Given no supervisor token then 503.

### U3 — Usage reconciler
- Goal: `usage_samples` and the job total track aiur; OGM-013 decides what to do with the number.
- Files: Create `services/api/src/budget/aiur-usage.ts`. Test `services/api/test/budget/aiur-usage.test.ts` with OGM-030's usage fixture.
- Approach: `reconcileJob(jobId)`: job + client (skip when no daemon); `u = client.usage(issue)`; on `usage_not_found` (not dispatched yet) return; on `usage_unavailable` return (retry next tick); `total = usdToMicro(u.totals.api_equivalent.amount.USD ?? "0")`; for each `s of u.sessions` upsert `(jobId, s.run_id)` with `usdToMicro(s.api_equivalent.amount.USD)`, `usdToMicro(s.provider_reported.USD ?? "0")`, `s.api_equivalent.coverage.status`; `jobs.usageMicroUsd = max(current, total)`; `usageCoverage = u.totals.api_equivalent.coverage.status`; `aiurRunId = last session's run_id`; `pessimistic = coverage === 'complete' ? total : max(total, job.reservationMicroUsd)`; `await budget.applyUsage(job, {usageMicroUsd: total, pessimisticMicroUsd: pessimistic, coverage})`. `startReconciler({db, fleet, clock})`: `setInterval(60 s)` over jobs with stage in `building|final_tests|fixing|paused|waiting_provider|ready`; `events.on('usage.changed', ({jobId}) => reconcileJob(jobId))`; `events.on('job.stage.changed', ({jobId, to}) => isTerminal(to) && reconcileJob(jobId))`.
- Interface sketch: `export async function reconcileJob(jobId: string, deps): Promise<{ usageMicroUsd: bigint; coverage: string } | { skipped: string }>; export function startReconciler(deps): { stop(): void }`.
- Worked reconciliation (OGM-030's usage fixture, reservation `3_000_000` µ$):

  | input | `usage_samples` row | job columns |
  |---|---|---|
  | `sessions[0].run_id r_8f3c`, `api_equivalent.amount.USD "0.734512"` | `(j_01J, r_8f3c, 734512, 0, complete)` | `usageMicroUsd 734512`, `aiurRunId r_8f3c`, `usageCoverage complete` |
  | second read, total `"0.650000"` (ledger compaction) | unchanged | `usageMicroUsd 734512` (never lowered) |
  | read with `coverage.status "partial"`, total `"1.100000"` | updated | `applyUsage` gets `pessimisticMicroUsd 3_000_000` |
- Test scenarios:
  - Given the fixture then one sample row per session and the job total `734512n`.
  - Given a later read with a lower total then the job total is unchanged.
  - Given `coverage.status: 'partial'` and reservation `3_000_000n` then `applyUsage` receives `pessimisticMicroUsd: 3_000_000n`.
  - Given `usage_unavailable` then no write and no throw.
  - Given `usage_not_found` then `skipped`.

### U4 — Terminal release
- Goal: reservation and slot back exactly once.
- Files: Modify `services/api/src/budget/aiur-usage.ts` (add `onTerminal`). Test in `aiur-usage.test.ts`.
- Approach: `events.on('job.stage.changed', async ({jobId, to}) => { if (!TERMINAL.has(to)) return; in a transaction: `UPDATE jobs SET released_at = now WHERE id = ? AND released_at IS NULL` → if 1 row changed: `budget.releaseReservation(jobId)`, `slots.release(jobId)`; else return })`. `TERMINAL = done|failed|cancelled|out_of_budget` (for `out_of_budget` the reservation is released but the slot is held until the admin decides; OGM-013 exposes `slots.hold(jobId)` if it distinguishes; default release both and let the admin's "continue" re-admit).
- Interface sketch: internal.
- Worked terminal sequence for one job:

  | t | event | `released_at` before | action |
  |---|---|---|---|
  | 0 | `job.stage.changed building→final_tests` | null | none (not terminal) |
  | 1 | `job.stage.changed final_tests→done` | null | set `released_at`; `releaseReservation`; `slots.release` |
  | 2 | `job.stage.changed done→done` (duplicate replay) | set | none |
  | 3 | reconciler final `reconcileJob` | set | usage written; no release |
- Test scenarios:
  - Given the event twice then `releaseReservation` once.
  - Given `to: 'building'` then nothing.

## 4. Verification

```
pnpm --filter @ogm/api test
pnpm --filter @ogm/db test
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: Vitest counts; the cancel-ordering test output; the one-line diff of `jobs/routes.ts`.

## 5. Deferred to implementation

- Cancel retry cadence: default 3 attempts, 3 s apart (aiur's own cancel waits for exit before answering; the retries cover `generation_changed`).
- Whether `out_of_budget` releases the edit slot: default yes (the admin's "continue" re-admits through OGM-013).
- Whether `pause` also pauses the reconciler: default no; usage can still land after a pause.
- `usdToMicro` location: default `services/api/src/budget/micro.ts` unless OGM-013 already exports one.

## 6. Scope boundaries

- Thresholds, 1× pause, hard cap, offers, platform cap (OGM-013). Chat store and UI (OGM-076/080). Checkpoint cards, media pairing, `gm checkpoint` (OGM-081/082). Projection (OGM-032). Filing (OGM-031). Admin cost views (OGM-014).

## 7. Risks

- `coverage.status` never `complete` on subscription routes (E02-4 [I]) → the pessimistic path keeps the allowance honest; the display shows "about".
- Supervisor token or `decisions.supervisor_allowed_kinds` not configured in the daemon config → `decide` 503; OGM-037 renders `supervisor_allowed_kinds: [decision.requested]` and OGM-034 passes `AIUR_SUPERVISOR_TOKEN` in the daemon env; note the dependency in the PR if either is missing at pickup.
- Double release when both the event and the interval fire → the `released_at` guard.
