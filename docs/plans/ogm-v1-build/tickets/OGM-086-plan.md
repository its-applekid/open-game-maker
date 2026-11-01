# OGM-086 — Budget-aware voice agent: implementation plan

## 1. Problem frame

The voice agent must talk about money truthfully without owning any of it: it reads today's allowance and sizes from a briefing the API pushes, offers trim / split / queue / ask-an-admin only when a request does not fit, and hands a confirmed draft to admission, which decides. The package has no host tools and no live refresh, so everything rides on the briefing cache (OGM-085) and the draft → instruct path.

Requirements trace: **R12** (four offers when a request does not fit; queued jobs start themselves) → role text names the offers; `[later]` drafts become `start: "at_reset"` jobs; 402 becomes `needs_choice` and a `waiting_on` line. **R21** (voice behind a flag; zero spend) → everything is tested with `FakeProvider`; the role text is the prompt for the real Agent later.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/voice_converse/host/briefing_source.ex` — `%Briefing{summary: field(..), current_task: field(..), gaps: [...]}`; extend OGM-085's copy with sections and `extra`.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/briefing.ex` — `render/2` (budget, drop order `extra → links → next_steps`), `field/1` shape `%{value, observed_at, max_age_s}`; the test asserts `dropped == []`.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/tools.ex` lines 148–215 — `get_details(section, n)` parameter shape and `propose_instruction` (`text` ≤ 4,000) so the role text names tools exactly.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/test/voice_converse/transport/websock_test.exs` lines 170–205 — the FakeProvider tool-call recipe (`FakeProvider.emit(ref, %Events.ToolCall{…})`).
- OGM-085 `services/api/src/voice/token.ts` — route and policy shape for `instruct.ts`/`routes.ts`.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Role text

Goal: the conversation rules, short enough to survive the briefing budget.
Files:
- Create `services/voice-host/roles/creator.md`.
- Test `services/voice-host/test/ogm_voice/role_test.exs` (token estimate ≤ 400 by `div(byte_size, 4)`, no digits).
Approach: sections "When it fits" (say nothing about budget), "When it doesn't" (offer, in this order: make it smaller, split into two builds, queue it for the reset, ask an admin; one sentence each), "Drafts" (one draft per change; start with `[later]` when the creator wants it after the reset; read the draft back before they confirm), "Checking" (call `get_status` after each confirmed draft and whenever asked how it is going; call `get_details("budget")` before quoting any number), "Ending" (`record_summary` with decisions, open questions, ideas). No numbers in the file.
Test scenarios:
- Given the file, then estimated tokens ≤ 400 and `Regex.match?(~r/\d/, text) == false`.

### U2. Cache and briefing sections (Elixir)

Goal: budget, progress and estimate sections; `extra` and `waiting_on`.
Files:
- Modify `services/voice-host/lib/ogm_voice/cache.ex`, `services/voice-host/lib/ogm_voice/ports/briefing_source.ex`.
- Test `test/ogm_voice/budget_briefing_test.exs`.
Approach: `Cache.put/1` already stores `sections` (OGM-085); add validation that `sections` ids are within `["budget","progress","estimate"]` and keep `waiting_on`. `BriefingSource.brief/1` builds `%Briefing{summary, current_task, next_steps, waiting_on, questions, extra: [%{title: "How to talk about budget", text: role(), observed_at: boot}, %{title: "Budget", text: first_line(sections["budget"]), observed_at}], gaps: gaps(entry)}` where `gaps` adds "Budget unavailable" when the section is absent; `sections/1` lists the three ids with descriptions; `details(target, "estimate", _)` returns the size-class lines only. `role/0` reads `roles/creator.md` once at boot (`priv/roles/creator.md` in the release; copy at build).
Interface sketch: `OgmVoice.Ports.BriefingSource.details(target, "budget" | "progress" | "estimate", opts) :: {:ok, String.t()} | {:error, :unavailable}`.
Test scenarios:
- Given the fixture push, when rendered with budget 2,500, then both `extra` titles present and `meta.dropped == []`.
- Given no budget section, then `gaps` contains "Budget unavailable" and `details("budget")` is `{:error, :unavailable}`.
- Given `waiting_on` in the push, then `brief/1` carries it.

### U3. API-side briefing pusher

Goal: build and push `BriefingPush` for live targets.
Files:
- Create `services/api/src/voice/briefing-push.ts`, `services/api/src/voice/routes.ts` (mount), `services/api/src/voice/__tests__/briefing-push.test.ts`; fixtures `fixtures/voice/budget-status.json`, `fixtures/voice/push-build-paused.json`.
Approach: `buildPush(target, { budget, estimateTable, job?, queued })` → lines: `Remaining today: <friendly(remainingMicroUsd)> (<remainingPercent>%). Resets at <local time>. Free slots: <n> new game, <m> edits. Queued: <k or none>.` and `Rough sizes: small ≈ …, medium ≈ …, large ≈ …, huge ≈ … (low confidence).` from OGM-018's seeded size-class table (E01-14); `progress` from the job row (`stage` words if OGM-032 set them, else `unknown`), `current_task` from the last `progress` chat row text (OGM-080 store), `next_steps: []`, `waiting_on` = "Build paused at its reservation: ask an admin to raise it, or trim" when `job.state === "paused_budget"`, or the four-offer line after a 402 (U4), `questions: []`, `observed_at: now`. `push(target)` POSTs to `OGM_VOICE_INTERNAL_URL + "/internal/briefing"` with `X-OGM-Internal`. Triggers: `onTokenMinted(target)` (OGM-085's route calls it), `onJobChanged(jobId)` (subscribe to OGM-080's `jobEvents` if present), a 30 s timer per live target (targets registered at mint, dropped 10 min after `ended` or last push failure). Friendly unit: `unitLabel` and the family's unit size from OGM-018 (`friendly(microUsd)` helper imported from there).
Interface sketch: `export function buildPush(target: VoiceTarget, input: PushInput): BriefingPush; export async function push(target: VoiceTarget): Promise<void>`. Worked push for the fixture:
```json
{ "target_key": "build:j_01", "summary": "Building", "current_task": "Placing the first room", "next_steps": [], "waiting_on": "",
  "questions": [], "extra": [{ "title": "Budget", "text": "Remaining today: 2.0 stars (40%). Resets at 12:00 am. Free slots: 1 new game, 2 edits. Queued: none." }],
  "sections": [{ "id": "budget", "text": "Remaining today: 2.0 stars (40%). Resets at 12:00 am. Free slots: 1 new game, 2 edits. Queued: none.\nRough sizes: small ≈ 0.5 star, medium ≈ 1–2, large ≈ 3–5, huge ≈ 6+ (low confidence)." },
                { "id": "progress", "text": "Building: placing the first room (started 3 min ago)." },
                { "id": "estimate", "text": "Rough sizes: small ≈ 0.5 star, medium ≈ 1–2, large ≈ 3–5, huge ≈ 6+ (low confidence)." }],
  "observed_at": "2026-11-01T05:10:00Z" }
```
Test scenarios:
- Given the fixture (2.0 of 5.0 units, 40%, reset 07:00Z, slots 1/2), then the budget section equals the expected two lines.
- Given `job.state = "paused_budget"`, then `waiting_on` is set.
- Given the budget call throws, then the push has no budget section and `questions` is unchanged (the host adds the gap).
- Given a push failure, then it is logged once and retried on the next tick.

### U4. Instruct receiver and routing

Goal: confirmed drafts → aiur message or admission.
Files:
- Create `services/api/src/voice/instruct.ts`.
- Modify `services/api/src/voice/routes.ts`.
- Test `services/api/src/voice/__tests__/instruct.test.ts`.
Approach: `POST /internal/voice/instruct` (loopback bind is the API's; header `X-OGM-Internal` compared in constant time) → `InstructRequest.parse`; idempotency table in memory + SQLite (`voice_deliveries(idempotency_key primary key, delivery_id, status, at)`, timestamped migration) → a seen key returns the stored result. `build`: `AiurClient.message(target.ticket, text, idempotency_key)`; insert a creator row in the job's chat (OGM-080 `store.insert` + `publish`) with `aiur: { ticket }`; status `delivered`. `scope`: look up the scope session (OGM-088 `scopeSessions.get(session_id)`; if the module is absent or has no ticket, fall through); with a ticket → same as build; without → `later = /^\s*\[later\]\s*/i.test(text)`; call OGM-013's admission function (`admitJob({ gameId, kind: "feature", complexity: 2, plan: { title: first line, summary: text, scope: { included: [], excluded: [] }, tickets: [] }, start: later ? "at_reset" : "now", idempotencyKey: "voice:" + idempotency_key })`); 202 → `delivered` (or `queued_at_reset` when `state === "queued"` and `start === "at_reset"`); 402 → `needs_choice`, and set the target's pending `waiting_on` line "Doesn't fit today: trim, split, queue for <resetsAt local>, or ask an admin" then `push(target)`; errors → `failed` (500 to the host, which reports `:failed`).
Interface sketch: `POST /internal/voice/instruct → 200 { delivery_id, status }`.
Test scenarios:
- Given a `build` target, then `message()` called once with the key and one creator chat row exists.
- Given the same key twice, then one call and the same `delivery_id`.
- Given `scope` + `[later] add a boss`, then admission receives `start:"at_reset"` and `summary:"add a boss"`.
- Given admission 402, then `needs_choice` and the next push contains the four offers.
- Given a wrong header, then 401.
Execution note: test-first on idempotency; a naive implementation calls aiur twice.

### U5. Overrun hook and e2e

Goal: the paused-at-reservation state reaches the agent; the whole loop runs on the fake provider.
Files:
- Modify `services/api/src/voice/briefing-push.ts` (job-state trigger).
- Create `services/voice-host/test/ogm_voice/e2e_budget_test.exs`.
Approach: subscribe to the job state change source (OGM-033/013 mark `paused_budget`; use OGM-080's `jobEvents` emitter or a 30 s poll of the job row as fallback) and push. Elixir e2e: boot with `FakeProvider` and the API stub (from OGM-085's test support); push the fixture briefing; start a session; emit `%Events.ToolCall{name: "get_details", params: %{"section" => "budget"}}` and assert the provider received a `tool_result` containing "Remaining today"; emit `propose_instruction` `[later] add a boss`, confirm over the socket, assert the stub got the text and reply `{"delivery_id":"d1","status":"needs_choice"}`; push a briefing with `waiting_on`; emit `get_status` and assert the result contains the `waiting_on` line.
Interface sketch: the e2e drives the session the way `websock_test.exs` does: `FakeProvider.emit(ref, %Events.ToolCall{call_id: "c1", name: "get_details", params: %{"section" => "budget"}})` then `assert_receive {:fake_provider, :tool_result, "c1", result}` (set `fake: [call_observer: self()]` in the provider spec).
Test scenarios:
- Given the fixture briefing pushed and a session started, when the provider calls `get_details("budget")`, then the tool result contains "Remaining today" and "Rough sizes".
- Given a `propose_instruction` with `[later] add a boss` confirmed over the socket, when the API stub replies `needs_choice`, then the socket receives `delivery{status:"delivered"}` for the draft and the session stays `listening`.
- Given a briefing push with `waiting_on` after that reply, when the provider calls `get_status`, then the result contains the four-offer line.
- Given the API stub returns 500, when a draft is confirmed, then the socket receives `delivery{status:"failed"}` and the draft can be confirmed again.
- Given a job row that enters `paused_budget`, when the push trigger fires, then the next `get_status` result starts with the paused line.

## 4. Verification

```
mise exec -C services/voice-host -- mix test
pnpm --filter @ogm/api test -- voice
pnpm -r typecheck && pnpm -r lint
```
Paste into `## Local tests`: `mix test` summary; the rendered budget section from the Vitest snapshot; the instruct idempotency assertion.

## 5. Deferred to implementation

- Friendly-unit formatting: default OGM-018's helper; if absent, `units = microUsd / familyUnitMicroUsd` to one decimal with `unitLabel`.
- Push cadence: default 30 s while a session is live; immediate on mint, job change, budget change.
- Scope-target complexity when admitting from voice: default 2, `kind: "feature"`; OGM-074's flow sets the real plan after `record_summary`.
- Where `waiting_on` after a 402 is stored: default in-memory per target with a 10 min TTL.

## 6. Scope boundaries

- Budget math, size classes, offers UI: OGM-018, OGM-013, OGM-074.
- Host skeleton, cache, token, transport: OGM-085.
- Scope ticket and session rows: OGM-088.
- Commands answering: OGM-082. Narration: OGM-087.

## 7. Risks

- The role text gets dropped when the briefing is over budget → default: 2,500-token budget and a test asserting `dropped == []`; if summary/current_task alone exceed the budget, `over_budget` is true and the text stays whole (package rule).
- No live refresh in the session → default: `waiting_on` plus the `get_status` rule; upstream request filed.
- The ElevenLabs Agent prompt is operator-side; the role file could drift from it → default: README says the file is the source and names the paste step.
- OGM-032/033 absent at pickup → default: `unknown` progress and the 30 s job-row poll; no invented state.
