# OGM-082 — Direction checkpoints bridge: implementation plan

## 1. Problem frame

A worker's direction checkpoint is an aiur Command plus 2–5 previews already in the build chat. OGM must show the Command as a card with those previews, let the creator answer with one tap, deliver the answer to aiur so the worker's normal Command delivery continues, and tell `gm checkpoint wait` (inside the no-network sandbox) through an inbox file. aiur exposes Commands only through a supervisor-token HTTP API and no feed event, so this is a poller.

Requirements trace: **R23** (2–5 quick options as a `choice` post; pause only dependent work) → `checkpoint.open` rows become cards; answers go to `/decide`; non-blocking by default (the worker set `blocking`); the ≤3/≤1 budget is counted and shown.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/voice_converse/host/command_source.ex` — lists decisions for one ticket, keeps `open|deferred`, maps to `{id, version, question, options}`; copy that filter into `correlate.ts`.
- `/home/orangekid/github/aiur/website/docs-app/reference/cli-decisions.md` rows `aiur command DECISION-ID --option ID` and `aiur executor-answer … --expected-version --idempotency-key --rationale` — the semantics the `/decide` body mirrors (version guard, idempotency, rationale).
- `/home/orangekid/github/aiur/packages/aiur-contracts/fixtures/command.v2.json` + `schemas/command.v2.schema.json` — the fixture the fake aiur server replays and the Zod schema for the fields used (`decision_id`, `version`, `question`, `questions`, `short_label`, `route_state`).
- `/home/orangekid/github/aiur/packages/aiur-contracts/examples/webhook-receiver.ts` — small typed module with an injectable store; copy for `decide.ts`.
- OGM-080 `services/api/src/build-chat/outbox.ts` — the handler shape to copy for `checkpoints/outbox.ts`.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. aiur client: decisions (additive)

Goal: typed `list` and `decide` with the supervisor token.
Files:
- Create `packages/aiur-client/src/decisions.ts`, Modify `packages/aiur-client/src/index.ts` (export).
- Test `packages/aiur-client/test/decisions.test.ts`.
Approach: `listDecisions(daemon, { ticket, limit=50, cursor? })` → `GET /api/v1/decisions?ticket=&limit=` with `Authorization: Bearer <supervisorToken>`; `decide(daemon, id, body)` → `POST /api/v1/decisions/:id/decide` with the bearer plus `Origin: <baseUrl>` and `X-Aiur-Request: 1` (E02-3); Zod-parse the page `{ decisions: Command[], pagination }` loosely (`passthrough()`), typing only the fields used; map 409 to `DecisionConflict` with the `winner` body.
Interface sketch:
```ts
export type DecideBody = { option_id: string; expected_version: number; idempotency_key: string; rationale: string };
export async function listDecisions(d: AiurDaemon, q: { ticket: string; limit?: number }): Promise<{ decisions: AiurCommand[] }>;
export async function decide(d: AiurDaemon, id: string, body: DecideBody): Promise<{ status: string; dispatch_status: string }>;
```
Test scenarios:
- Given a fake server, when listing, then the request carries the supervisor bearer and `ticket=142`.
- When deciding, then headers include `Origin` and `X-Aiur-Request`.
- Given 409, then `DecisionConflict` with the winner's option.

### U2. Outbox handler and card rows

Goal: `checkpoint.open` lines become `kind:"checkpoint"` rows.
Files:
- Create `services/api/src/checkpoints/outbox.ts`, `services/api/src/checkpoints/budget.ts`.
- Test `__tests__/outbox.test.ts`.
Approach: handler `{ type: "checkpoint.open", handle }` parses `CheckpointOpenPayload` (copied from OGM-081), verifies each `media_id` exists as a row in the same job (else drop that media id, keep the option), inserts `{ id: line.id, actor:"agent", kind:"checkpoint", text: question, checkpoint: { decision_id:"", question, options, recommend, status:"open" } }` with an internal `checkpoint_id` kept in `checkpoint_json` (`cp_…`) and `blocking`; publishes. `budget.ts`: `used(jobId)` = count of checkpoint rows not `moot`; `max(job.kind)` = 3 for `new_game`, else 1.
Test scenarios:
- Given a line with two options and one valid media id, then a row with both options and `status:"open"`.
- Given a media id from another job, then it is dropped and logged.
- Given three rows for a `new_game` job, then `used:3,max:3`.

### U3. Poller and correlation

Goal: link Commands to cards, mirror native Commands, detect resolution.
Files:
- Create `services/api/src/checkpoints/poller.ts`, `services/api/src/checkpoints/correlate.ts`.
- Test `__tests__/poller.test.ts`.
Approach: every `OGM_CHECKPOINT_POLL_MS` (5 s) for each daemon record with running tickets (jobs in `filed|running|paused_budget`), `listDecisions`. `correlate(commands, rows)`: a Command whose `context.long_context_markdown` (or `question`) matches `/gm-checkpoint:(cp_[0-9A-HJKMNP-TV-Z]{26})/` links to the row with that `checkpoint_id` → `updateCheckpoint(row.id, { decision_id, version })`; a Command with no marker and no existing row (by `decision_id`) → new card row with `options` from the Command (`id`, `label`) and `recommend` from `recommendation.option_id`; a linked row whose Command is no longer `open|deferred`: if the Command shows an answer (`route_state`/answer fields in the show payload), set `answered` with the option id, else `moot`; both write inbox files (U5). Keep `version` for `/decide`. Back off to 30 s after an error; resume at 5 s on success.
Interface sketch: `export function correlate(cmds: AiurCommand[], rows: CheckpointRow[]): { link: …[]; create: …[]; resolve: …[] }` (pure).
Test scenarios:
- Given a Command with the marker and a row with that cp id, then `link` contains the pair.
- Given a marker-less Command, then `create` has it with its options.
- Given a linked row whose Command is absent from the open list and the show payload has an answer, then `resolve` with `answered`.
- Given fetch errors, then no state change and the period is 30 s.
Execution note: write `correlate` as a pure function first with the fixture; the poller is a thin loop around it.

### U4. Answer route and decide

Goal: one tap → `/decide` with the version guard.
Files:
- Create `services/api/src/checkpoints/routes.ts`, `services/api/src/checkpoints/decide.ts`.
- Test `__tests__/routes.test.ts`.
Approach: `POST /api/v1/jobs/:jobId/checkpoints/:checkpointId/answer` → `authorize(actor, "job.create", { gameId, ownerId })`; load row; if `decision_id === ""` → 425 `not_linked`; else `decide(daemon, decision_id, { option_id, expected_version: version, idempotency_key: "ogm:"+checkpointId+":"+version, rationale: "Creator chose '"+label+"' in the build chat" })`; on 202/200 → `updateCheckpoint(status:"answered", option_id)`, publish, inbox; on `DecisionConflict` → re-list, update to the winner, 409 with `{status, by:"other"}`. `GET …/checkpoints/budget` → U2. Rate limit answers at 10/min per job.
Test scenarios:
- Given a linked row and the fake aiur accepting, when answering `b`, then `/decide` body has `option_id:"b"`, `expected_version` from the row and the `ogm:` key; row is `answered`.
- Given an unlinked row, then 425.
- Given the fake returns 409, then the row shows the winner and the response is 409.
- Given a player session, then 403.

### U5. Inbox writer

Goal: tell `gm checkpoint wait` inside the sandbox.
Files:
- Create `services/api/src/checkpoints/inbox.ts`.
- Test `__tests__/inbox.test.ts`.
Approach: `writeInbox(workspaceRoot, { checkpoint_id, decision_id, option_id?, status, at })` → `mkdir -p <ws>/.gm/inbox/checkpoints/`, write `<cp_id>.json.tmp` then `rename` to `<cp_id>.json`, and the same content to `<decision_id>.json` when known. Workspace root comes from OGM-080's `recordWorkspace(jobId, root)` registry; if unknown, log once and keep the row state (the card still works; `wait` times out and the agent re-reads the card through its Command delivery).
Test scenarios:
- Given a temp workspace, when written, then both files exist with identical JSON and no `.tmp` remains.
- Given no workspace known, then no throw and one log entry.

### U6. Checkpoint card (web)

Goal: the card the panel renders for `kind:"checkpoint"`.
Files:
- Create `apps/web/src/features/build-chat/checkpoint-card.tsx`, `apps/web/src/features/build-chat/checkpoint-card.test.tsx`, `apps/web/e2e/checkpoint-card.spec.ts`.
Approach: props `{ message: BuildChatMessage; mediaById: (id) => BuildChatMessage | undefined; budget?: { used, max }; onAnswer(optionId) }`; options sorted with `recommend` first and marked by text ("Builder's pick"); each option a `<button>` tile with the referenced media (poster image or `<video muted playsinline>` for clips, 10 s max per E06-16) or the label alone; tiles ≥ 64 px tall, full-width on phones (`svh`, safe areas inherited from OGM-071 tokens); states: `open` + empty `decision_id` → disabled tiles and "Waiting for the builder to ask"; `open` linked → enabled; `answered` → chosen tile marked, others dimmed; `moot` → one line "No longer needed"; `blocking` → "The builder is waiting on this"; budget line "Checkpoint 2 of 3". No taglines beyond those strings (CLAUDE.md "no needless text").
Test scenarios:
- Given `recommend:"b"`, then the first tile is `b` with the pick mark.
- Given empty `decision_id`, then tiles are disabled and the waiting text shows.
- Given `answered` with `option_id:"a"`, then tile `a` has `aria-pressed=true` and `onAnswer` is not called on click.
- Playwright (`--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`, fallback `GM_VERIFY_SOFTWARE_GL=1`): at 390×844 every tile's bounding box height ≥ 64.

## 4. Verification

```
pnpm --filter @ogm/aiur-client test -- decisions
pnpm --filter @ogm/api test -- checkpoints
pnpm --filter @ogm/web test -- checkpoint-card
pnpm --filter @ogm/web e2e -- checkpoint-card     # Playwright, GPU flags; GM_VERIFY_SOFTWARE_GL=1 if ANGLE fails
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: counts per suite, the `/decide` request body captured by the fake server in test (c), and the Playwright tile-height assertion output.

## 5. Deferred to implementation

- Where the per-daemon supervisor token is read: default the daemon record from OGM-034 (`GameDaemon` in T02 §4 gains `supervisorToken`); until then an env name `OGM_AIUR_SUPERVISOR_TOKEN` for the single local daemon.
- Mirroring marker-less (native) Commands: default yes, as cards without media.
- Notification emit: default call OGM-016's `notify(jobId, "checkpoint.open")` if the module exists, else nothing.
- Clip autoplay in tiles: default poster only; play on tap.

## 6. Scope boundaries

- CLI (`open`, `wait`) and the printed payload: OGM-081.
- Store, relay, SSE, `recordWorkspace`: OGM-080.
- Panel, FAB, layout: OGM-076.
- Daemon config and tokens: OGM-034/037 (`decisions.supervisor_allowed_kinds`, `AIUR_SUPERVISOR_TOKEN`).
- Skill text for when to checkpoint and the budget rule: OGM-091/093.

## 7. Risks

- The daemon lacks `supervisor_allowed_kinds` → `/decide` returns `delegation_forbidden`; default: surface as a card error "The builder's settings don't allow answering here" and log; OGM-100 verifies the template.
- A worker emits with `authority: human_required` (ignoring OGM-081's printed payload) → same forbidden error; default: the card shows the Command but explains it must be answered in aiur; OGM-091's skill text forbids it.
- Marker parsing drift if aiur redacts or truncates `long_context_markdown` → default: also match the marker in `question` and `context.short_summary`; test all three.
- Workspace unknown when answering (relay never saw an outbox line) → default: the Command delivery still reaches the worker via aiur; only `gm checkpoint wait` times out.
