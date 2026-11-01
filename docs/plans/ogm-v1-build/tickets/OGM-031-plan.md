# OGM-031 plan — Job intake to aiur

## 1. Problem frame

Admission (OGM-013) decides that a job may run and reserves money; aiur then needs a GitHub issue with the right markers and labels, a spend cap on that issue, `agent:todo` applied by an allowed login, and a nudge so the daemon does not wait for its idle poll (E02-8, E02-4). The sequence must be idempotent across crashes and retries because every step is a remote write, and the identity that applies `agent:todo` cannot be the daemon's own bot (aiur rule). This ticket is that sequence and the one GitHub writer the builder package owns.

**Requirements trace**
- R26 → every job is one or more aiur tickets in the creator's repo with `complexity:N` and `feature:gm-<jobId>`, the spend cap set before `agent:todo`, nudged with `control todo`; idempotent on the `gm-job`/`gm-ticket` markers.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/github/issue_creation.ex` — a pure issue write with injectable transport and `outcome_unknown` handling; copy the shape into `issues.ts`.
- `/home/orangekid/github/aiur/src/lib/aiur_web/api/spend_cap_controller.ex:43-52` — error codes to branch on (`ticket_not_found`, `spend_cap_exhausted`, `invalid_amount`).
- `/home/orangekid/github/aiur/src/lib/aiur/control_call/allowlist.ex:179-180` — `todo(ids, only: true)` is the nudge; OGM-030's `nudgeTodo` wraps it.
- `/home/orangekid/github/aiur/website/docs-app/apis/github-auth.md:7-9` — who may trigger work; the intake login must be in `allowed_users` (OGM-037 renders it).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B8-aiur-integration-budgets-bugs.md:70-76` — body fields, markers, label order, idempotency key.
- T01 §4 `POST /api/v1/jobs` — the `plan` object the renderer reads (`title, summary, scope.included/excluded, tickets[].{key, skills, dependsOn, acceptanceCriteria}`).

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — GitHub issues writer
- Goal: the only module in `@ogm/builder` that writes to GitHub, testable without the network.
- Files: Create `services/builder/src/github/issues.ts`. Test `services/builder/test/github/issues.test.ts`.
- Approach: `createIssuesClient({token, request?})` using `octokit`'s `request` with the PAT; methods: `create(repo, {title, body, labels})` → `{number, url}` (201) or `OutcomeUnknownError` on a 2xx without `number`; `findByMarkers(repo, jobId, key)` → `GET /repos/:o/:r/issues?labels=feature:gm-<jobId>&state=all&per_page=100`, filter bodies containing `gm-job:<jobId> gm-ticket:<key>`; `ensureLabel(repo, name, color, description)` (`POST /labels`, 422 already_exists ignored); `addLabel(repo, n, name)` (`POST /issues/:n/labels`); `removeLabel`; `setStateLabel(repo, n, state)` = remove every `agent:<state>` label present, add `agent:<state>` (states from aiur `labels.ex:25`); `labels(repo, n)`. Retry 5xx and 403 rate-limit with `Retry-After`/backoff ×3. Never log the token; redact `authorization` from errors.
- Interface sketch:
  ```ts
  export type IssuesClient = {
    create(repo: string, issue: { title: string; body: string; labels: string[] }): Promise<{ number: number; url: string }>;
    findByMarkers(repo: string, jobId: string, key: string): Promise<{ number: number; labels: string[] } | null>;
    ensureLabel(repo: string, name: string, color?: string, description?: string): Promise<void>;
    addLabel(repo: string, n: number, name: string): Promise<void>;
    removeLabel(repo: string, n: number, name: string): Promise<void>;
    setStateLabel(repo: string, n: number, state: 'todo'|'cancelled'|'paused'): Promise<void>;
  };
  ```
- Test scenarios:
  - Given a 201 then `{number, url}`.
  - Given a 202 without `number` then `OutcomeUnknownError`.
  - Given two issues with the feature label, one with the marker then `findByMarkers` returns it.
  - Given `ensureLabel` and a 422 `already_exists` then resolves.
  - Given a 403 with `Retry-After: 1` then one retry after 1 s.

### U2 — Body renderer and signature
- Goal: deterministic, transcript-free issue text with the markers.
- Files: Create `services/builder/src/intake/render.ts`. Test `services/builder/test/intake/render.test.ts`, fixture `test/fixtures/issue-body.md`.
- Rendered fixture (`test/fixtures/issue-body.md`; the marker line is last, the signature covers everything above it):
  ```markdown
  The player can jump again once in the air.

  ## Scope
  - included: jump buffer, coyote time, a second jump with a shorter arc
  - excluded: wall jump

  ## Acceptance
  - `gm test` green; the promise test `promises/double-jump.spec.ts` passes
  - a still after `gm run` posted to the build chat

  ## Load skills
  - gm-core
  - gm-verify
  - gm-genre-platformer

  <!-- gm-job:j_01JBQ5X7 gm-ticket:t1 gm-sig:3b9f2c1e -->
  ```
- Approach: `renderIssue({jobId, ticket, plan, skillPack})`: title = `ticket.title ?? plan.title` trimmed to 120 chars; body sections in the verbatim order; `## Load skills` = `ticket.skills ∩ skillPack.names` with `gm-core` and `gm-verify` always first; `dependsOn` keys resolved to issue numbers when already filed → `Blocked by #n` lines; `gm-sig = sha256(body without the marker line)`; marker appended as the last line. Reject any plan field containing an email-like token or more than 4,000 chars (the API validated the plan; this is defense in depth).
- Interface sketch: `export function renderIssue(i: RenderIssueInput): { title: string; body: string; sig: string; labels: string[] }` where `labels = [\`complexity:${ticket.complexity}\`, \`feature:gm-${jobId}\`]` (no `agent:todo`; it is applied later).
- Test scenarios:
  - Given the worked plan then body equals the fixture and `labels` has exactly two entries.
  - Given a skill not in the pack then it is dropped.
  - Given a summary with `name@example.com` then throws.
  - Given the same input twice then equal `sig`.

### U3 — The filing sequence
- Goal: `fileJob(jobId)` that is safe to call any number of times.
- Files: Create `services/builder/src/intake/file-job.ts`, `services/builder/src/intake/index.ts`, `services/builder/src/intake/types.ts`; Modify `services/builder/src/index.ts` (append). Create `packages/db/migrations/<ts>_job_tickets.sql`, `packages/db/src/schema/job-tickets.ts`. Test `services/builder/test/intake/file-job.test.ts`.
- Approach: steps, each checking state before acting:
  1. Load job; require `state === 'admitted'` (else return `{skipped: reason}`).
  2. `ensure = await fleet.ensureDaemon(job.repo, job.kind)`; `waiting_capacity` → return `{deferred: 'capacity'}` (OGM-013's "waiting for robot capacity" stage comes from the job staying `admitted` with `stageText` set by OGM-032's `queued_ogm` word; set `job.waitReason = 'capacity'`).
  3. `pre = await preflight(daemon.checkoutPath, codexHome, inputFor(daemon))`; `{ok:false}` → `job.state = 'failed'`, `failReason = 'preflight'`, store reasons, emit alert, return.
  4. `issues.ensureLabel(repo, \`feature:gm-${jobId}\`, '0e8a16', 'OGM job')`.
  5. For each `plan.tickets[]` in dependency order: `row = job_tickets[jobId,key]`; if none: `existing = findByMarkers` → reuse or `create`; insert row. Then `cap = client.setSpendCap(n, usd)` unless `row.capSetAt`; on `ticket_not_found` wait 5 s and retry twice (aiur may not have polled the new issue), then abort leaving `admitted`; on `spend_cap_exhausted` → `paused_budget`. Then `addLabel(n, 'agent:todo')` unless present (check `labels()`); mark `row.todoAt`.
  6. `client.nudgeTodo(numbers)`; failures are logged only (the poll will pick it up).
  7. `job.state = 'filed'`, `aiurRepo`, `aiurIssueNumber = numbers[0]`, `aiurIssueNumbers`.
  Wrap each DB write in its own transaction so a crash leaves a resumable record. Register: `events.on('job.admitted', ({jobId}) => fileJob(jobId))` and a 60 s sweep `SELECT id FROM jobs WHERE state='admitted' AND admitted_at < now-60s`.
- Interface sketch:
  ```ts
  export type FileResult = { filed: true; issues: number[] } | { deferred: 'capacity' } | { skipped: string } | { failed: 'preflight'|'github'|'aiur'; reasons: string[] };
  export function createIntake(deps: { db; fleet; issues: IssuesClient; preflight; clock; env }): { fileJob(jobId: string): Promise<FileResult>; start(): void; stop(): void };
  ```
- Test scenarios:
  - Given an admitted job with two tickets then calls in order create#1, create#2, cap#1, todo#1, cap#2, todo#2, nudge([1,2]) and state `filed` (cap before todo per ticket is the invariant under test; the exact interleave across tickets may be cap-all-then-todo-all, assert the per-ticket order).
  - Given a second call then no create and no cap.
  - Given a crash after create#1 (row present, no `capSetAt`) then cap#1 → todo#1 → … only.
  - Given `setSpendCap` 404 three times then state stays `admitted` and no `agent:todo`.
  - Given `ensureDaemon → waiting_capacity` then nothing filed.
  - Given preflight `{ok:false}` then `failed` with reasons and no GitHub call.
  - Given `nudgeTodo` throws then state is still `filed`.
- Execution note: write the ordering test first with a call recorder; it is the money-safety property.
- Worked resumption table (what `fileJob` does on re-entry, given the `job_tickets` row for one ticket):

  | row state | GitHub state | next action |
  |---|---|---|
  | no row | no issue with marker | create, insert row |
  | no row | issue with marker exists (crash after create) | reuse number, insert row |
  | row, `capSetAt` null | issue exists | `setSpendCap`, set `capSetAt` |
  | row, `capSetAt` set, `todoAt` null | `agent:todo` absent | `addLabel('agent:todo')`, set `todoAt` |
  | row, `todoAt` set | any | skip to nudge |
  | all rows `todoAt` set | any | `nudgeTodo(all)`, job `filed` |

## 4. Verification

```
pnpm --filter @ogm/builder test
pnpm --filter @ogm/db test
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: Vitest counts; the recorded call order from the happy-path test; the rendered fixture's marker line (job id is a fixture value).

## 5. Deferred to implementation

- Whether to file dependent tickets up front or lazily when the blocker merges: default up front with a `Blocked by #n` line (aiur's optimistic queue handles blockers; native blocked-by edges deferred).
- `complexity` for a ticket without one: default the job's `complexity`.
- Sweep interval: default 60 s; config name `OGM_INTAKE_SWEEP_SECONDS`.
- How the admission event is delivered (`EventEmitter` vs a DB poll): default both, as above.

## 6. Scope boundaries

- Admission, reservations, offers, queue-at-reset (OGM-013). Repo and labels at provisioning (OGM-035/036). Daemon start (OGM-034). Projection (OGM-032). Cancel, pause, usage (OGM-033). Repair diagnostics (OGM-096). The platform repo's own `aiur init` (Executor, not this product).

## 7. Risks

- aiur refuses `agent:todo` from the intake login (not in `allowed_users` because OGM-037 rendered a different login) — default: preflight compares `allowed_users` with `OGM_INTAKE_BOT_LOGIN` and fails closed before filing.
- The intake PAT can write to every repo the machine user is a collaborator on — accepted: it is a collaborator on game repos only, never the platform repo (D-SECRETS).
- `ticket_not_found` on the cap because the daemon has not polled the new issue yet — default: 2 retries 5 s apart; the nudge is sent after, so this is the only latency added.
- Two tickets in one job share one reservation — default: cap each at the full reservation (aiur caps per ticket; OGM-033 reconciles the sum against the reservation and pauses at 1×).
