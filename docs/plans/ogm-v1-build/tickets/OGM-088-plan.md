# OGM-088 — Scope session as an aiur ticket: implementation plan

## 1. Problem frame

The creation flow needs a conversation that turns six choices and a few sentences into an agreed scope. With no zero-spend model outside the coding agents, that conversation is a worker on a short aiur ticket, talking through the job's build chat. This ticket files that ticket, keeps the session row, accepts the agreed scope from the worker (outbox line plus a file in the PR), and gives the voice target a ticket to aim at.

Requirements trace: **R20** (creation choices recorded; "Other" by text or dictation) → `ScopeChoices` stored on the session and rendered into the ticket body; the lockfile write itself is OGM-062's. **R21** (text and dictation always; voice when a key exists) → the scope chat is the job chat (text/dictation via OGM-080/083); the voice `scope` target resolves to the session's ticket.

## 2. Patterns to follow

- OGM-031's filing module (refresh at pickup; T02 §4 "ticket filing contract": title, body with markers, labels, then `PUT spend-cap`, then `nudgeTodo`) — copy the call sequence; only the body template differs.
- `/home/orangekid/github/aiur/.agents/skills/aiur-agent/SKILL.md` lines 69–78 — how a worker reads operator messages (`aiur_read_messages` in async; sync/steer deliver inline); the ticket body tells the worker to expect creator messages.
- OGM-080 `services/api/src/build-chat/outbox.ts` — the handler shape for `scope.agreed`.
- OGM-081 `packages/gm-cli/src/commands/chat/outbox.ts` — `jobContext`, `appendLine` for `gm scope done`.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/summary_tool.ex` — `record_summary(decisions, open_questions, ideas)`; `AgreedScope.open_questions/ideas` mirror it so a voice-agreed scope maps one to one.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Contract and schema

Goal: `ScopeChoices`, `AgreedScope`, `ScopeSession` as Zod, one table.
Files:
- Create `packages/contracts/src/scope.ts`, `packages/contracts/fixtures/scope/{choices,agreed}.json`, `packages/contracts/fixtures/scope/negative/agreed-missing-tickets.json`.
- Modify `packages/contracts/src/index.ts` (append one line).
- Create `packages/db/src/schema/scope.ts`, `packages/db/migrations/<YYYYMMDDHHmmss>_scope_sessions.sql`.
- Test `packages/contracts/test/scope.test.ts`.
Approach: `AgreedScope.tickets` reuses the T01 §4 `plan.tickets` item shape; `complexity` 1–5; `title` ≤ 120 chars; `summary` ≤ 2,000; arrays ≤ 50 items. Table `scope_sessions(id text pk, game_id, creator_id, job_id, ticket text null, status text, choices_json, scope_json null, scope_hash text null, at text, updated_at text)` with a partial unique index on `(game_id) where status = 'open'`.
Interface sketch: as in the ticket's contract block.
Test scenarios:
- Given `agreed.json`, then it parses.
- Given the negative fixture, then it fails naming `tickets`.
- Given `players: "coop"`, then it fails.

### U2. Session store and routes

Goal: create, read, abandon.
Files:
- Create `services/api/src/scope/store.ts`, `services/api/src/scope/routes.ts`.
- Test `services/api/src/scope/__tests__/routes.test.ts`.
Approach: `POST /api/v1/games/:gameId/scope/sessions`: `authorize(actor, "game.create", { gameId, ownerId })`; if an `open` session exists for the game → 200 with it; else `admitJob({ gameId, branchId: "main", kind: "scope", complexity: 1, plan: { title: "Scope: " + choices.genre, summary: JSON.stringify(choices), scope: { included: [], excluded: [] }, tickets: [] }, start: "now", idempotencyKey: "scope:" + gameId + ":" + nowMinute })` (OGM-013; `kind: "scope"` must be accepted by admission as the small class on an edit slot — document as a request to OGM-013 if the enum lacks it) → on 202 insert the session `{ id: ulid, job_id, status: "open", choices }` → 201 `{ sessionId, jobId }`; on 402 pass the offers through (the creation flow shows them). `GET …/:id` → `ScopeSession` (creator only). `POST …/:id/abandon` → `abandoned`; call OGM-033's `cancelJob(jobId)` when present. Export `scopeSessions.get(id)` and `scopeSessions.setTicket(jobId, ticket)` (called by OGM-031 when the issue number is known, or read lazily from the job row).
Test scenarios:
- Given no open session, when created, then admission is called with `kind:"scope"` and the session is `open`.
- Given an open session, then the same id is returned and admission is not called.
- Given a 402, then the response relays `offers`.
- Given a player, then 403.
- Given abandon, then `abandoned` and cancel called once.

### U3. Ticket template and filing (builder)

Goal: the scope ticket in the game repo.
Files:
- Create `services/builder/src/scope/template.ts`, `services/builder/src/scope/file.ts`.
- Test `services/builder/src/scope/__tests__/template.test.ts`.
Approach: `renderScopeTicket({ jobId, sessionId, choices })` → `{ title: "Scope: <genre> <vibe> game", body }` with sections: one paragraph restating the choices; "## Scope" (hold the conversation in the build chat: ask at most five questions, propose 2–3 scopes from the pack catalog, agree one); "## Acceptance" (`.gm/scope/<sessionId>.json` written with `gm scope done --file .gm/scope/<sessionId>.json` and committed in this PR; no game code); "## Load skills" (`- gm-scope-options`); the markers comment `<!-- gm-job:<jobId> gm-ticket:scope gm-scope:<sessionId> gm-sig:<sha256 of body> -->`. `fileScopeTicket(job)` calls OGM-031's intake with that body and labels `["complexity:1", "feature:gm-<jobId>", "agent:todo"]`, then OGM-031 does `setSpendCap(n, smallReservationUsd)` and `nudgeTodo([n])`; the job row receives `aiurIssueNumber`; call `scopeSessions.setTicket(jobId, String(n))` and OGM-080's `flushPending(jobId)` so any creator text typed before filing reaches the worker.
Interface sketch: `export function renderScopeTicket(i: { jobId: string; sessionId: string; choices: ScopeChoices }): { title: string; body: string; labels: string[] }`.
Test scenarios:
- Given the fixture choices, then the body has all three markers and the skill line; the title ≤ 80 chars.
- Given filing with a fake client, then `setSpendCap` and `nudgeTodo` are called in that order and `setTicket` ran.

### U4. Outbox handler `scope.agreed`

Goal: the worker's result lands in the session.
Files:
- Create `services/api/src/scope/outbox.ts`.
- Test `services/api/src/scope/__tests__/outbox.test.ts`.
Approach: handler `{ type: "scope.agreed", handle(line, ctx) }`: `AgreedScope.parse(line.payload)`; load the session by `ctx.jobId`; reject if `payload.session_id !== session.id` (log with both ids); compute `scope_hash` = sha256 of the canonical JSON; if equal to the stored hash → no-op; else store `scope_json`, `status: "agreed"`, insert one system chat row `{ actor: "system", kind: "text", text: "Scope agreed: " + title }` via `ctx.store` and `ctx.publish`; trigger OGM-016's `notify(jobId, "scope.agreed")` when present.
Test scenarios:
- Given a matching line, then `agreed`, one row, hash stored.
- Given the same line again, then no second row.
- Given a mismatched `session_id`, then unchanged and logged.
- Given an invalid payload, then skipped and logged.

### U5. `gm scope done`

Goal: the only agent-side writer.
Files:
- Create `packages/gm-cli/src/commands/scope/index.ts`, `packages/gm-cli/src/commands/scope/done.ts`.
- Test `packages/gm-cli/src/commands/scope/__tests__/done.test.ts`.
Approach: flags `--file <path>` (required; must be inside the workspace), `--job`, `--json`; read and `AgreedScope.parse` (exit 2 naming the first failing path); `jobContext()` from OGM-081's helpers; `appendLine(root, "scope.jsonl", { v:1, id: ulid(), job_id, at, type: "scope.agreed", payload })`; print the session id; also append a `chat.post` text line "Scope agreed: <title>" so the creator sees it even before the handler runs. Exit 0.
Test scenarios:
- Given the fixture file, then one `scope.agreed` line with equal payload and one `chat.post` line.
- Given a file outside the workspace, then exit 2.
- Given a missing `tickets` field, then exit 2 naming `tickets`.

### U6. Bundle field and voice resolution

Goal: the worker knows its session; the voice target finds the ticket.
Files:
- Modify (additive, documented request) OGM-036's bundle builder to include `scope_session_id` when `job.kind === "scope"`.
- Create `services/api/src/scope/resolve.ts` exporting `ticketForScopeTarget(target)` used by OGM-086's `instruct.ts`.
- Test `__tests__/resolve.test.ts`.
Approach: `ticketForScopeTarget({ session_id })` → `scopeSessions.get(session_id)?.ticket ?? null`; OGM-086 falls back to admission on `null`. If OGM-036's bundle cannot be changed at pickup, `gm scope done` derives the session id from the file name (`.gm/scope/<id>.json`).
Test scenarios:
- Given a session with ticket `142`, then `"142"`.
- Given none, then `null`.

## 4. Verification

```
pnpm --filter @ogm/contracts test -- scope
pnpm --filter @ogm/api test -- scope
pnpm --filter @ogm/builder test -- scope
pnpm --filter @ogm/gm-cli test -- scope
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: counts per suite; the rendered ticket body from the template test (markers visible); the handler test's "no second row" assertion.

## 5. Deferred to implementation

- Admission `kind: "scope"` handling: default a request to OGM-013 to accept it as the small class on an edit slot; until then file as `kind: "feature"`, `complexity: 1` with the markers distinguishing it.
- Listener mode for scope tickets: default the daemon default (`sync`), set by OGM-034's template; the body tells the worker creator messages arrive inline.
- Whether the worker also posts a readable summary to the chat: default yes, through `gm chat post --text` in the skill (OGM-095), not here.
- Cancel on abandon: default call OGM-033 if present, else leave the job to finish.

## 6. Scope boundaries

- The conversation and option generation: OGM-095 (`gm-scope-options`).
- Creation flow screens and submitting the plan to admission: OGM-074.
- Admission math, offers: OGM-013. Issue filing primitives: OGM-031. Bundle mechanics: OGM-036.
- Chat store, relay, mirror: OGM-080; `gm chat post`: OGM-081; voice routing: OGM-086.

## 7. Risks

- A scope ticket that ends without a PR may be marked error by aiur → default: the acceptance requires the file committed in a PR; CI for game repos is minimal (E02-13) so it merges fast through the commit service.
- Creator messages typed before the issue exists → default: OGM-080 keeps them `pending` and `flushPending` sends them after filing.
- OGM-095 lands after this ticket (advisory order) → default: the worker without the skill still gets a complete body; the skill improves the conversation.
- Two scope sessions for one game → prevented by the partial unique index; the API returns the open one.
