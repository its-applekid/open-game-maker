# OGM-032 plan — aiur event ingestion and job projection

## 1. Problem frame

The creator never sees aiur; they see "Building", "Running final tests", "Ready to try", "Out of budget" (R27). Those words are a deterministic function of what aiur reports: lifecycle records on its event feed, the tracker state label on the issue, the agent's own progress estimate, and the spend-cap trip (E02-4/5/6/7). aiur also holds direction checkpoints as Commands that are not exported on the feed (E06-15), so they are polled. This ticket builds the consumer (one feed per running daemon, cursor-persisted, with polling fallbacks), the pure projection with its word table, and the rows the rest of the product reads. It writes no chat messages and answers nothing.

**Requirements trace**
- R27 → `projectStage` maps lifecycle and labels to the fixed creator words; `applyAiurEvent` keeps the job row current from the feed and the polls; `budget-exhausted` becomes "Out of budget" for an admin decision; failures are friendly.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/events/catalog/ticket_entries.ex:167-205` — the four exported topic families and their attribute enums; the zod schemas in OGM-030 encode them.
- `/home/orangekid/github/aiur/src/lib/aiur_web/events_channel.ex:60-120` — replay pages of 500, `reset` when the subscriber is >2000 behind, heartbeat; the consumer's cursor logic mirrors `push_page`.
- `/home/orangekid/github/aiur/src/lib/aiur/github/labels.ex:25-26` — state and reason-modifier label suffixes the projection reads from `issue.labels`.
- `/home/orangekid/github/aiur/src/lib/aiur_web/api/usage_progress.ex:56-66` — `phase` and `progress` fields for the 30 s poll.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B8-aiur-integration-budgets-bugs.md:79-93` — the original creator-word table (superseded by T02 §4's but the same words).
- OGM-030 `packages/aiur-client/src/events.ts` — `subscribeEvents` signature and the `reset`/`error` callbacks; consume, do not reimplement.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Schema
- Goal: rows for events, cursors and checkpoints; projection columns on jobs.
- Files: Create `packages/db/migrations/<YYYYMMDDHHMM>_aiur_events.sql`, `packages/db/src/schema/aiur-events.ts`. Test `packages/db/test/migrations.test.ts` (the existing migration runner test from OGM-010; add a case that the new migration applies on an empty DB).
- Approach: `aiur_events(daemon_slug TEXT, seq INTEGER, topic TEXT, ticket TEXT, job_id TEXT NULL, payload TEXT /* JSON */, observed_at TEXT, PRIMARY KEY(daemon_slug, seq))`; `aiur_cursors(daemon_slug PK, last_seq, epoch, updated_at)`; `checkpoints(decision_id PK, job_id, daemon_slug, version, question, options TEXT /* JSON [{id,label}] */, recommend, status CHECK IN ('open','answered','moot'), opened_at, answered_at)`; `ALTER TABLE jobs ADD COLUMN stage TEXT DEFAULT 'queued_ogm'`, `stage_text`, `phase`, `progress_percent INTEGER`, `last_event_seq INTEGER`, `aiur_run_id TEXT`. Index `aiur_events(job_id, seq)`.
- Interface sketch: Drizzle tables `aiurEvents`, `aiurCursors`, `checkpoints`; `jobs` columns appended in `packages/db/src/schema/jobs.ts`? No: that file is OGM-013's; the ALTER lives in the migration and the Drizzle columns are added in a sibling file `packages/db/src/schema/jobs-projection.ts` merged via `extend` if the schema package exposes one, else a one-line edit in `jobs.ts` called out in the PR.
- Test scenarios: Given an empty DB when migrations run then the three tables exist and `jobs.stage` defaults to `queued_ogm`.

### U2 — Pure projection
- Goal: one total function and one word table, tested row by row.
- Files: Create `services/api/src/jobs/projection.ts`. Test `services/api/test/jobs/projection.test.ts`.
- Approach: `projectStage(i)`: (1) `ogmState` in `done|failed|cancelled` → that stage; `paused_budget` → `out_of_budget`; `queued` → `queued_ogm` ("Waiting for a free slot"); (2) `spendCapReached || trackerState === 'budget-exhausted'` → `out_of_budget` ("Out of budget"); (3) `trackerState`: `ci-wait` → `final_tests` ("Running final tests"); `rework` → `fixing` ("Fixing a problem"); `human-review` → `ready` ("Ready to try"); `merging|done` → `done` ("Done"); `error` → `failed` ("Something went wrong"); `cancelled|canceled` → `cancelled` ("Stopped"); (4) reason labels: `paused-decision` → `paused` ("Waiting for your answer"); `paused-usage-limit` → `waiting_provider` ("Waiting for robot capacity"); `paused-agent` → `paused` ("Paused"); (5) `lifecycle`: `queued|retrying|waiting` → `waiting_capacity` ("Waiting for robot capacity"); `allocated|running` → `building` ("Building"); `paused` → `paused`; `completed` → keep `trackerState` result or `final_tests`; `cancelled` → `cancelled`; `replaced` → `building`; (6) nothing matched → `{stage: i.previous ?? 'waiting_capacity', text: previousText}`. `WORDS: Record<JobStage, string>` is the single source of the strings; `OGM-076` imports it from `@ogm/contracts/jobs` (append `JobStage` and `WORDS` there in this ticket, one file `packages/contracts/src/job-stage.ts` + one barrel line).
- Interface sketch: as in the ticket; plus `export const JOB_STAGE_WORDS: Record<JobStage, string>`.
- Test scenarios (`describe.each` over a table): the verbatim mapping rows; `ogmState: 'done'` with `lifecycle: 'running'` → `done`; `spendCapReached` with `trackerState: 'in-progress'` → `out_of_budget`; `trackerState: 'error'` → text `Something went wrong`, never containing `reason`; `reasonLabels: ['agent:paused-decision']` → `paused` "Waiting for your answer"; `{}` → `waiting_capacity`.
- Execution note: test-first; the table is the spec.
- The word table (`JOB_STAGE_WORDS`), which OGM-076/079 display verbatim:

  | stage | text | from |
  |---|---|---|
  | `queued_ogm` | Waiting for a free slot | `ogmState: queued` |
  | `waiting_capacity` | Waiting for robot capacity | lifecycle `queued`, `retrying`, `waiting` |
  | `waiting_provider` | Waiting for robot capacity | reason label `paused-usage-limit` |
  | `building` | Building | lifecycle `allocated`, `running`, `replaced`; tracker `in-progress` |
  | `final_tests` | Running final tests | tracker `ci-wait` |
  | `fixing` | Fixing a problem | tracker `rework` |
  | `ready` | Ready to try | tracker `human-review` |
  | `paused` | Paused / Waiting for your answer | lifecycle `paused`; reason `paused-agent` / `paused-decision` |
  | `out_of_budget` | Out of budget | `spend_cap_reached`, tracker `budget-exhausted`, `ogmState: paused_budget` |
  | `done` | Done | tracker `merging`, `done`; `ogmState: done` |
  | `failed` | Something went wrong | tracker `error`; `ogmState: failed` |
  | `cancelled` | Stopped | tracker `cancelled`; `cancel.result exited`; `ogmState: cancelled` |

### U3 — Apply and persist
- Goal: idempotent, ordered application of records into rows plus a domain event.
- Files: Modify `services/api/src/jobs/projection.ts` (add `applyAiurEvent`, `applyIssueSnapshot`, `applyProgress`). Test `services/api/test/jobs/apply.test.ts` with an in-memory SQLite.
- Approach: `applyAiurEvent(db, daemonSlug, record)`: in one transaction: `INSERT OR IGNORE aiur_events`; if ignored return; resolve `job` by `(aiurRepo = daemon.repo, aiurIssueNumber = topic ticket)`; derive `ProjectionInput` from the job row + payload (`lifecycle`, `spend_cap_state === 'budget_exhausted'`, `process_status`); for `agent.progress.phase` set `phase`; for `agent.progress` set `progress_percent`; `usage.changed` → emit `usage.changed` domain event with `{jobId, ticket}` (OGM-033 reads `/usage`); `cancel.result` with `process_status: 'exited'` → `cancelled`; compute `projectStage`; update job (`stage, stage_text, phase, progress_percent, last_event_seq`); update cursor; after commit `events.emit('job.stage.changed', {jobId, from, to})` only if changed. `applyIssueSnapshot(db, job, issue)` maps `issue.labels` to `trackerState`/`reasonLabels`, sets `aiur_run_id` when present, same projection. `applyProgress(db, job, progress)` sets `phase`/`progress_percent` only.
- Interface sketch: `export async function applyAiurEvent(db, daemonSlug: string, record: EventRecord): Promise<{ applied: boolean; stage?: JobStage }>`.
- Worked sequence for one job (issue 142, daemon `everdred-games-castle-run`), records in `seq` order and the row after each:

  | seq | topic | payload | stage after |
  |---|---|---|---|
  | 810 | `ticket.142.lifecycle.changed` | `{lifecycle:"queued"}` | `waiting_capacity` |
  | 812 | `ticket.142.lifecycle.changed` | `{lifecycle:"running"}` | `building` |
  | 815 | `ticket.142.agent.progress.phase` | `{phase:"work"}` | `building`, `phase: work` |
  | 820 | `ticket.142.agent.progress` | `{percent: 40}` | `building`, `progress_percent: 40` |
  | 831 | poll `issue()` labels `agent:ci-wait` | — | `final_tests` |
  | 840 | `ticket.142.usage.spend_cap_reached` | `{spend_cap_state:"budget_exhausted"}` | `out_of_budget` (emit) |
  | 841 | `ticket.142.lifecycle.changed` | `{lifecycle:"completed"}` | `out_of_budget` (precedence holds) |
- Test scenarios:
  - Given the same record twice then one row and one emit.
  - Given records seq 5 and 4 applied in that order then both stored and the job reflects seq 5's state after both.
  - Given a ticket with no job then the event is stored with `job_id NULL` and nothing emitted.
  - Given `spend_cap_reached` then stage `out_of_budget` and emit.

### U4 — Feed consumers and pollers
- Goal: one subscription per running daemon, cursors persisted, polls for what the feed lacks.
- Files: Create `services/builder/src/events/{index.ts,consumer.ts,pollers.ts,decisions.ts,types.ts}`; Modify `services/builder/src/index.ts` (append). Test `services/builder/test/events/{consumer,pollers,decisions}.test.ts`.
- Approach: `startFeedConsumers({fleet, db, apply, clock})`: every 10 s reconcile: for each `fleet.listDaemons('running')` without a consumer → `subscribeEvents(client, {after: cursor.last_seq ?? 0, patterns, onRecord: r => apply(daemon.slug, r), onReset: m => {setCursor(m.head_seq); for job of activeJobs(daemon) apply issue snapshot}, onError: alert, signal})`; for each consumer whose daemon is no longer running → abort. `pollers.ts`: per active job (`stage` not terminal) `progress()` every 30 s → `applyProgress`; `issue()` every 60 s → `applyIssueSnapshot`; both skip when the daemon is not running. `decisions.ts`: per daemon with any job in `building|paused|fixing` every 15 s `client.decisions()`; for each Command whose `requester`/`origin` names a ticket with a job: upsert `checkpoints` (`open`), with `options` from `questions[0].options` (`id=label` strings parsed), `recommend` from `suggested`; Commands no longer open → `answered` (or `moot` if the job is terminal); emit `checkpoint.opened|answered`.
- Interface sketch: `export function startFeedConsumers(deps): { stop(): Promise<void> }`.
- Join payload per daemon (`subscribeEvents` options): `{ after: 811, patterns: ["ticket.*.lifecycle.changed", "ticket.*.usage.*", "ticket.*.cancel.result", "ticket.*.agent.progress*"] }`; the daemon answers with records `seq > 811` then live pushes.
- Issue snapshot → `ProjectionInput` (from `GET /api/v1/:issue` `labels`, prefix `agent:`):

  | label(s) on the issue | `trackerState` | `reasonLabels` |
  |---|---|---|
  | `agent:todo` | `todo` | `[]` |
  | `agent:in-progress`, `agent:paused-decision` | `in-progress` | `['paused-decision']` |
  | `agent:ci-wait`, `agent:ci-red` | `ci-wait` | `['ci-red']` |
  | `agent:human-review` | `human-review` | `[]` |
  | `agent:budget-exhausted` | `budget-exhausted` | `[]` |
  | two state labels at once | the one aiur lists first in `state_labels` order | all modifiers |
- Test scenarios:
  - Given one running daemon then one subscribe with `after` = stored cursor.
  - Given the daemon list drops it then the consumer aborts.
  - Given `reset {head_seq: 900}` then cursor 900 and one `issue()` per active job.
  - Given a `decisions()` page with one open Command for ticket 142 then one `checkpoints` row `open`.
  - Given the next page without it then `answered`.

## 4. Verification

```
pnpm --filter @ogm/api test
pnpm --filter @ogm/builder test
pnpm --filter @ogm/db test
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: Vitest counts per file; the projection table size (rows covered); the migration apply line.

## 5. Deferred to implementation

- Whether `usage.changed` payloads carry an amount (E02-6 lists `position, generation` only): default no; OGM-033 reads `/usage` on that event.
- How a Command names its ticket (`requester`, `origin`, or a `ticket` field in `command.v2.schema.json`): default read `/home/orangekid/github/aiur/packages/aiur-contracts/schemas/command.v2.schema.json` at pickup and map the first field that carries the identifier.
- Poll intervals: defaults 30 s / 60 s / 15 s; all three in `packages/config` names with those defaults.
- Where `events.emit` lives: default OGM-010's in-process `EventEmitter` (if none, add `services/api/src/events.ts` with a typed emitter, one file).

## 6. Scope boundaries

- No filing (OGM-031), no controls or ledger math (OGM-033), no chat cards or `/decide` (OGM-082), no notifications (OGM-016), no admin timeline (OGM-014), no daemon start (OGM-034), no webhook receiver (deferred).

## 7. Risks

- The feed replays from 0 on a fresh cursor and a long-lived daemon → default `after: head_seq - 2000` on first subscribe plus one `issue()` snapshot per active job.
- Commands schema fields drift → the mapping reads the schema file at pickup and the test fixture is captured from a real `decisions()` page (OGM-030 spike or OGM-100).
- Two API processes (none planned) would double-apply → the primary key makes it idempotent anyway.
- `progress` is a self-estimate (E02-5) → shown as "about n %" by OGM-076; never used for admission.
