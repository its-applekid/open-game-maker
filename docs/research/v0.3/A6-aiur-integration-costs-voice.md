# A6 — aiur integration, job orchestration, costs/limits, and the voice package boundary

Spikes covered: **R06** (aiur lifecycle, job orchestration, provider credentials), **R15** (unified costs, quotas, caching, limits), **R03** (reusable one-way and two-way voice package). Research date: 2026-10-21. Read-only inspection; nothing in aiur was modified, run, or deployed.

Status labels used below: **Verified** (read in code or docs at the commit cited), **Inferred** (my reading of verified facts), **Unverified** (not checked, or from a secondary source), **Proposal** (a recommendation, not a decision).

---

## 1. Requirement

Spec v0.3 §3.1–3.2, §5.5, §5.10, §7.1, §8 and §11.4 R03/R06/R15 ask for four things:

- Reuse aiur for orchestration, Git/PR automation, and cost tracking instead of building a second orchestrator.
- Keep deterministic work deterministic, and use agents that start for a task and stop when it ends.
- Give admins one view of spending broken down by account, game, job, and capability, with actual and estimated amounts kept apart, plus first-class limits.
- Build voice as a reusable package, with MVP dictation that does not wait for two-way conversation.

The legal and vendor questions are out of scope here and belong to the sibling legal agent. That includes whether a consumer Claude subscription may power a multi-user service. I note only where aiur's own research has already touched them.

## 2. Sources

**aiur main checkout:** `/home/everdred/github/everdred/aiur`
- Local HEAD is `ad084b1f38e7a1693b8d6ad26da9ed7d2789988b` (2026-10-21, "Make the Executor fix what it notices (#5603)").
- The local branch is 18 commits behind `origin/main` `d9fbf239b`. The findings come from the local HEAD; `voice_converse` has had no further changes on origin/main since its skeleton commit.

**aiur research branch:** `origin/research/refactor-findings` at `de341053cc16d2e6096a3a0d0fbacb43ef9f6eb0`. It holds the MP-E6 voice plan and research.

**Key files (paths relative to the aiur root):**
- Overview: `README.md`, `SPEC.md`, `docs/spec/appendix-ssh-worker.md`, `components.json`, `components/*.json` (53 components)
- Concepts:
  - `website/docs-app/concepts/{executor,ticket-lifecycle,units,headroom-dispatch,message-bus,capabilities,experiments,build-orders,workspaces}.md`
  - `website/docs-app/guide/claude-accounts.md`
- Reference:
  - `website/docs-app/reference/{configuration,configuration-agent,cli,merge-policy}.md`
  - `website/docs-app/apis/github-auth.md`
- Usage ledger:
  - `src/lib/aiur/usage_envelope.ex` and `usage_envelope/fields.ex`
  - `src/lib/aiur/usage_ledger.ex`
  - `src/lib/mix/tasks/aiur.cost_report.ex`
- Providers and accounts:
  - `src/lib/aiur/claude/account_generation.ex`, `claude/usage_api.ex`
  - `src/lib/aiur/accounts/shims/claude.ex`
  - `src/lib/aiur/coding_agent/providers/*`
- Ticket intake: `src/lib/aiur/memory/tracker.ex`
- HTTP routes: `src/lib/aiur_web/routes/{api,decisions}.ex`
- Voice:
  - `src/lib/aiur/voice.ex`, `voice/{provider,transcriber,synthesizer}.ex`
  - `src/lib/aiur/eleven_labs/{realtime,tts,quota}.ex`
  - `packages/elixir/voice_converse/**`
  - `docs/voice-mode/spec.md`
  - `docs/research/aiur-mobile-and-platform/bucket-2-platform/MP-E6/side-query-findings.md`
  - on the research branch: `.../MP-E6/plan.md` (§16–§20) and `.../MP-E6/talk/research.md`
- Packages: `packages/aiur-contracts/{README.md,package.json}`, `packages/aiur-style/{README.md,package.json}`

**GitHub (read with `gh`, 2026-10-21):** Epic `aiur-team/aiur#4083` (MP-E6 voice + /talk) is OPEN. Of its 66 MP-E6 issues, 4 are closed: the C11-T01 skeleton, the C12-T01 Executor session registration, and the C10-T03/T03b side-query spikes.

**External docs:** I did not refetch any vendor pages; the legal agent owns those.
- Claude per-MTok prices and caching multipliers come from the bundled Claude API skill reference, cached 2026-10-06 and accessed 2026-10-21.
- Voice-vendor prices are quoted **second-hand** from aiur's `talk/research.md`, which is dated 2026-10-10. They are **Unverified** by me.

## 3. Headline findings

1. **The unit of work is a tracker ticket that produces a PR** (Verified). Work enters aiur only as a tracker issue (GitHub, Linear, or an in-memory adapter for tests) carrying `agent:todo`. There is no HTTP endpoint to create a job.
   - The HTTP API can read state, read per-issue events, send a message to a live agent, pause, resume, and answer Commands (decisions).
   - The daemon claims the ticket, creates a per-issue git worktree, and runs the coding-agent CLI over several turns. The agent opens a PR, waits for CI, and hands off to `human-review`, then exits.
   - The daemon itself runs continuously, and there is one daemon per repository (`tracker.github.repo` is a single value).
2. **Agents are ephemeral per ticket; the service is persistent** (Verified). This matches spec §5.5/§7.1. An always-available daemon does not mean a continuously reasoning LLM, because polling and webhooks are plain code. The Executor role is optional and can be a human or an agent.
3. **Usage is recorded in detail, but there is no dollar or token *budget* enforcement** (Verified, grep of code and config docs).
   - Recording: a content-free usage envelope per request, turn, or session, with tokens split into input, cached, cache-creation, output, and reasoning, and with a cost and an attribution of run, ticket, attempt, session, thread, turn, and request.
   - What limits exist: concurrency, turns, wall-clock time, no-op turns, retries, and provider-window awareness (5-hour and weekly usage).
   - What does not exist: per-ticket, per-tenant, or per-day spend caps.
4. **Multi-account and multi-provider support is real** (Verified).
   - Coding-agent backends: Claude (Claude Code CLI, using a subscription login or an API key), Codex (ChatGPT login or API key), Muse, and OpenAI-compatible routes (OpenRouter, DeepSeek, Kimi/Moonshot).
   - Accounts are named machine-local profiles. The `headroom` policy routes each ticket to the backend and account with the most usage left.
   - Usage meters for API-key accounts show as unavailable.
5. **aiur assumes a trusted environment** (Verified). The README says "trusted environments only… bypasses all agent permission prompts". `agent.claude.permission_mode` defaults to `bypassPermissions`.
   - The "Agent safety" component protects the host's resources (CPU pressure, build gate, process reaper). It is not a security sandbox.
   - Codex uses its own bubblewrap sandbox.
   - Consequence: aiur must run on an isolated worker with scoped credentials (R05). Game Maker must never let user text reach it unfiltered.
6. **One-way voice exists inside the aiur app; the two-way package is a skeleton** (Verified).
   - Existing: `Aiur.Voice` is a provider-neutral seam (a Transcriber with push/commit/stop and partial/final events, and a Synthesizer that streams audio chunks). It has one ElevenLabs implementation: Scribe v2 realtime over a server-held websocket, plus streaming TTS and a quota meter.
   - The dashboard uses it for dictation (the user reviews, then sends; nothing is sent automatically) and for half-duplex spoken replies.
   - `voice_converse` (host-agnostic Elixir) currently contains only its config, ports, and default limits. The full design (providers, briefing, fork side-queries, the /talk host) is planned but 62 of 66 tickets are open.
7. **The reusable packages are small** (Verified). `@aiur/contracts` is private, unpublished, MIT, TypeScript types and JSON Schema for the capabilities report only. `aiur-style` (MIT, CSS/JS design system) is not useful to Game Maker's kid UI. The rest of aiur is not yet split into facades; components show `facade_pending: MP-R1-C1-T02`.
8. **The ElevenLabs under-18 policy blocks Game Maker** (from project memory, 2026-10-21; the legal agent will confirm). Every existing aiur voice path is ElevenLabs. Game Maker MVP dictation therefore cannot simply reuse aiur's provider without a provider decision.

## 4. Capability map — Game Maker pipeline vs aiur

| Stage | aiur today | Status | Notes / gap |
|---|---|---|---|
| **Request intake** | Issue labelled `agent:todo` (GitHub, Linear). `aiur --todo`; label writes by trusted accounts or a GitHub App. | **Partial** | No job-create API. Game Maker would create an issue through a GitHub App. Dispatch latency is bounded by polling (default 120 s, stretched 5× when idle) unless webhooks are proven. |
| **Clarify** (talk with the kid) | Agents can raise *Commands*: durable questions with options, answerable via `POST /api/v1/decisions/:id/decide`. Native question capture (MP-E2) is planned. | **Partial / wrong shape** | Commands come up mid-run, which is too slow and too costly for pre-build narrowing. Clarification belongs in Game Maker as a direct cheap-model call (§8). |
| **Specialist design** (parallel, dynamic) | Build Orders: typed members, lanes, phases, dependencies, complexity routing. The `aiur-build` skill produces planning packs. Complexity labels route model and effort. | **Partial** | Every member is a PR-producing ticket. Design specialists that only produce documents would have to commit design files, which is awkward but workable. Picking which specialists to use, and the cost of combining their work, is not automated. |
| **Plan → tasks** | Build queue with `blocked_by`, stacked PRs, optimistic dependents, start-trigger ladder. | **Exists** | Strong. More than MVP needs. |
| **Build** | Per-issue worktree. Claude/Codex/OpenAI-compatible agents. Turn loop, retries, rate-limit fallback, resume of session handles. | **Exists** | Needs a Linux host with tmux, git, the agent CLIs, and bubblewrap for Codex. Railway's support for those is Unverified (R05). |
| **Tests / CI** | `ci-wait` lifecycle, CI recovery reruns, rework on red, local-test policy, build-gate concurrency, `premerge_checks`. | **Exists** (GitHub Actions) | Browser playtests (Playwright) would run as the game repo's CI or as local tests the agent runs. Not checked: running Playwright under aiur's build gate on Railway. |
| **Draft / preview** | Agent opens a (draft) PR; `human-review` state. | **Partial** | "Draft" in Game Maker means a playable preview. aiur gives a PR head; Game Maker must build and serve that head as a preview (R08). |
| **Publish** | Operator merge command with merge policy (full CI, premerge checks). `done` on merge. No self-merge by agents. | **Partial** | Creator-controlled Publish should be Game Maker's own deterministic action (merge plus release tag plus deploy), not an aiur step. aiur's policy that agents never self-merge fits that. |
| **Repair / bug button** | Rework loop, PR review findings checklist, main-watch fixer tickets. | **Exists** | A bug report becomes a new issue (deterministic) and goes through the same pipeline. |
| **Progress board** | `/api/v1/state`, `/api/v1/:issue`, `/api/v1/:issue/events`, message-bus `ticket.<id>.agent.progress`, Units projection, `aiur units --json`. | **Exists (operator-shaped)** | Game Maker polls or subscribes and turns this into kid-friendly cards. All of it sits behind dashboard Basic auth. |
| **Cost per job** | `mix aiur.cost_report --ticket N --json`, `--build SLUG`. Ledger and aggregate on disk. Cost shown in the LiveView UI. | **Partial** | No JSON HTTP endpoint for cost. The mix task needs the source tree. |
| **Budgets / limits** | Concurrency (global, per state, per SSH host), `max_turns`, `max_turns_by_complexity`, `max_agent_duration_minutes` (default 60), `turn_timeout_ms`, `stall_timeout_ms`, no-op-turn bound, `max_dispatches_per_ticket`, retries, provider usage windows. | **Partial** | No per-tenant concurrency and no spend reservation or cap. Game Maker must do admission control. |
| **Experiments / benchmarks** | `aiur experiments` (pre-registered A/B or before/after over recorded attributes such as backend, model, complexity) plus the `aiur-experiment` skill. | **Exists** | Directly useful for the R15 heavy-versus-light benchmark. |
| **Voice** | Dictation and half-duplex TTS (in-app, ElevenLabs). `voice_converse` skeleton. | **Partial / planned** | See §10. |

## 5. Lifecycle, providers, and credentials (R06)

**How an agent receives work** (Verified):
1. The ticket title and body are rendered through a per-repository Liquid `prompt_file` plus shared agent instructions and complexity prompts.
2. The model and backend are chosen from `complexity:` and `model:` labels and `agent.routing`.
3. The agent moves its own ticket to `human-review` with the `aiur_set_ticket_state` tool. The orchestrator handles `ci-wait`, `rework`, `done`, and `error`. State writes use optimistic concurrency.

The prompt template is the clean hook for Game Maker's authority rules, the Engine SDK contract, and the editor-maintenance rule. All of them go in the *game* repository's `.aiur/config` and template.

**Exit** (Verified). The agent loop stops at handoff. It also stops on a no-op bound (3 turns), a turn limit, a duration cap (60 minutes), or retry exhaustion, which sets `error`. A rework or comment wakes a new run. The session handle can persist and resume. No LLM runs while a ticket waits for CI.

**Authority separation** (Inferred). aiur works on one repository, and trust comes from `trusted_accounts` and CODEOWNERS. Giving each game repository, or a shared games repository, its *own* daemon and GitHub App installation, separate from the platform repository, enforces spec §7.1/§9.1 by construction. A game agent's token simply cannot push to the platform repository. This matters for R07:
- one repository per game would mean one daemon per game, which does not scale;
- a shared **games monorepo** (one daemon), or a small fixed number of shards, fits aiur.

**Credentials** (Verified):
- Claude profiles are `CLAUDE_CONFIG_DIR` directories, and aiur reads their OAuth usage (`/api/oauth/usage`). `account_generation` tracks whether the auth mode is `:subscription` or `:api_key`.
- Codex uses `CODEX_HOME` profiles.
- API-key backends use `~/.aiur/.env` entries named `VAR__NAME`.
- A 401 error is a hard failure, never a silent move to another account. A 429 moves to the next route.

**Hosted multi-user use:**
- aiur's own MP-E6 research (§3.4, documents quoted 2026-10-10) records that Anthropic "does not permit… [routing] requests through Free, Pro, or Max plan credentials on behalf of their users". It also notes that the subscription limits assume "ordinary, individual usage".
- This conflicts with spec §8.5's idea of a hosted aiur running on Kevin's Claude subscription to serve other people. The legal agent must decide; I treat it as an **open blocker** and plan for API keys.

## 6. Integration boundary — options

**Option A (recommended): Game Maker is the system of record and admission controller; aiur runs as a ticket worker.**
- **Game Maker owns:** accounts and permissions, households, durable job records, the clarify conversation (a direct model call), estimates and reservations, the per-household queue and slot limits, creating issues through its own GitHub App, preview builds, and Publish (merge, tag, release metadata). It also owns cost presentation and voice.
- **aiur owns:** dispatch, worktrees, agent turns, model/account routing, CI and rework loops, PR mechanics, raw usage recording, and host-resource guards.
- **How they talk:**
  - Game Maker opens a GitHub issue carrying `agent:todo`, `complexity:N`, and a hidden `gm-job:<uuid>` marker in the body.
  - Game Maker listens to GitHub webhooks (labels, PR, checks) as the authoritative state.
  - It polls `GET /api/v1/:issue` and `/events` for progress text.
  - It uses `POST /api/v1/:issue/pause` and the `agent:cancelled` label to stop runaway work.
  - It answers mid-run questions through the decisions API.
  - For cost, a small sidecar on the aiur worker runs `aiur.cost_report --ticket N --json` and posts the result back. Better: an upstream aiur ticket adds `GET /api/v1/usage?ticket=`.
- **Pros:** reuses aiur's strongest parts (Git, CI, rework, routing, usage recording). The authority boundary lands on repositories. Agents are ephemeral.
- **Cons:**
  - GitHub becomes part of the job bus, which adds latency (polling or webhooks) and API-rate cost.
  - aiur is a trusted-environment tool that must be isolated.
  - Per-tenant limits and spend caps live in Game Maker, so the two systems' state must be kept consistent.
  - The aiur daemon needs tmux and the agent CLIs on the worker host.

**Option B: Game Maker imports aiur as a library.**
- **Not viable now.** aiur is an Elixir/OTP application with no published facades, and the TypeScript stack cannot import it.
- Only `voice_converse` and `@aiur/contracts` are package-shaped. Revisit after the MP-R1 facade work.

**Option C: Game Maker runs its own thin job runner and borrows aiur pieces.**
- A TypeScript worker on Railway drives the Claude Agent SDK, Codex, or the Messages API directly in per-job sandboxes, with Game Maker's own Git steps.
- It borrows aiur's *designs*: the usage-envelope schema, the routing grammar, the no-op and turn bounds, and the voice wire protocol.
- **Pros:** native multi-tenancy, hard spend caps per request (task budgets), no GitHub dependency for job state, lower start latency, and simpler Railway packaging.
- **Cons:** rebuilds what aiur already does for CI, rework, routing, multiple accounts, and usage recording. It also cuts against the decided direction "reuse aiur… rather than building an overlapping orchestrator" (§7.1).

**Option A+C hybrid (Proposal, worth naming).** Use Option A for builds and features, which are long, PR-shaped, and CI-gated. Call models directly from Game Maker for short, single-shot AI steps: clarify, intent interpretation for editor commands, hint and nudge text, and TTS. Those steps are not coding jobs and should not pay aiur's ticket overhead. This is the recommended reading of Option A.

## 7. Deterministic vs agent steps

| Step | Kind | Owner |
|---|---|---|
| Auth, permissions, invitations, household limits | Deterministic | Game Maker |
| Clarify / narrowing questions | Single model call (fast tier), optional STT/TTS | Game Maker (direct API) |
| Cost estimate + reservation | Deterministic (table of rolling averages by job type and complexity) | Game Maker |
| Create issue, labels, complexity | Deterministic | Game Maker (GitHub App) |
| Fork / copy game, branch, release tag, rollback | Deterministic | Game Maker (Git) |
| Specialist design | Agent tickets (0–N chosen per request) or one planner turn | aiur |
| Synthesis of the plan | Agent ticket | aiur |
| Implementation, tests, repair | Agent tickets | aiur |
| CI runs, CI waiting, rework routing | Deterministic | aiur + GitHub Actions |
| Preview build/deploy of the PR head | Deterministic | Game Maker |
| Publish (merge + semver + changelog render) | Deterministic. The changelog *text* comes from the agent-written PR body. | Game Maker |
| Editor knob changes | Deterministic, no model | Game Maker / Engine SDK |
| "Make all enemies blue" with existing operations | Intent model call, then deterministic operations | Game Maker (R02) |
| Progress cards | Deterministic projection of aiur and GitHub state | Game Maker |

## 8. Cost-reporting data model (R15)

**What aiur records** (Verified, `UsageEnvelope`):
- **Identity:** `provider`, `upstream_provider`, `backend`, `transport`, `auth_mode` (api_key / chatgpt / unknown; Claude also tracks subscription versus api_key), `requested_model`, `resolved_model`, `effort`, `context_tier`.
- **Measurement:** `cache_write_duration`; `tokens{input, cached_input, cache_creation_input, output, reasoning_output, provider_reported_total}`; `cost`; `coverage_reasons`; `occurred_at`, `pricing_effective_date`.
- **Attribution:** `{run_id, tracker_identity(owner, repo, issue), attempt_id, session_id, thread_id, turn_id, request_id}`.
- **Pricing rules:** prices come from a curated table that always wins over vendor data. An unpriced model reports **Unknown, never zero** (`unknown_price_model`). Provider-reported cost and API-equivalent estimates are kept separate. OpenRouter calls are priced at OpenRouter's rates.

**Proposed Game Maker ledger** (one row per usage event, appended only):

```text
usage_event(
  id, occurred_at, ingested_at,
  account_id, household_id, game_id, job_id, job_stage,   -- GM dimensions
  capability,          -- plan|code|test_repair|clarify|intent|stt|tts|dialogue_tts|music|sfx|image|hosting|ci
  provider, upstream_provider, model, effort, auth_mode,
  qty_kind,            -- tokens|audio_seconds|characters|requests|ci_minutes
  qty_detail jsonb,    -- token split incl. cache read/write
  cost_basis,          -- billed_actual|provider_reported|api_equivalent_estimate|quota_share|unavailable
  amount_usd numeric NULL,   -- NULL = unknown, never 0
  source,              -- aiur_ledger|gm_direct|vendor_invoice
  source_ref,          -- aiur idempotency_key / request id
  freshness_at)
job(id, game_id, account_id, kind, complexity, estimate_usd, reserved_usd,
    tracker_issue, status, started_at, ended_at, retries)
```

**How aiur records map to Game Maker dimensions** (Proposal): `tracker_identity.issue` → `job_id` via the `gm-job` marker → `game_id` and `account_id`. `job_stage` comes from the label or a ticket-type convention (`design:`, `build:`, `repair:`).

**Cost basis** (Inferred):
- Calls made with API keys: `api_equivalent_estimate` straight away. The figure becomes `billed_actual` only after reconciliation against the provider's usage/cost admin API, where one exists (Unverified per provider).
- Calls made on a subscription: `quota_share` (percent of the 5-hour or weekly window, from aiur meters), with the dollar column showing an API-equivalent estimate *labelled as such*. This matches spec §8.2: "subscription usage is not a metered charge".
- Railway, CI minutes, and GitHub: delayed or monthly, so `unavailable` until imported.

## 9. Runaway protection (Proposal; aiur pieces Verified)

Layered, with Game Maker as the primary gate:

1. **Game Maker admission:**
   - The per-household slot limit (start with 2, which is a configuration value, not a decision) decides whether `agent:todo` is applied at all. Otherwise the job waits in Game Maker's queue.
   - Reserve the estimate (p80 of past jobs of the same kind and complexity) against daily, weekly, and monthly caps per household, plus a platform-wide cap.
   - Refuse or queue when a cap would be exceeded. Manual edits stay free.
2. **aiur per-ticket bounds** (configuration in the games repository):
   - `max_turns_by_complexity` and `max_agent_duration_minutes` (for example 45 for features, 90 for new games);
   - `max_dispatches_per_ticket` (for example 3), `max_retry_attempts`, and the no-op bound;
   - `max_concurrent_agents` as the global backstop, and `max_concurrent_builds`.
3. **Reconciliation watchdog:**
   - A Game Maker worker sums live aiur usage per job every N minutes. Once actual cost passes 1.5× the reservation, it calls `POST /api/v1/:issue/pause` and asks the admin. At the hard cap it applies `agent:cancelled`.
   - Lag is bounded by how quickly the ledger and aggregate update. Not measured.
4. **Provider exhaustion:** aiur already parks tickets on 429 or usage limits and resumes at reset (`provider_limited`). Game Maker shows "waiting for capacity" rather than an error.

**Gap to file upstream in aiur (optional):** a native per-ticket token or cost cap. That is a better seam than an outside watchdog.

## 10. Voice package boundary (R03)

**What exists (Verified):**
- **`Aiur.Voice` seam:**
  - Transcriber: `start(owner)`, `push(base64 PCM16 16 kHz mono)`, `commit`, `stop`, sending `{:voice_transcript, :partial|:final, text}`, `{:voice_error, …}` and `{:voice_closed}`.
  - Synthesizer: streams `{:voice_audio, :chunk|:done|:error}`.
  - Provider: `quota_snapshot` and `configured?`.
  - Rules: the credential stays on the server; aiur writes no audio to disk or logs; aiur never delivers text to an agent by itself.
- **ElevenLabs implementation:** Scribe v2 realtime websocket, streaming TTS, and a credit-quota meter.
- **`voice_converse` skeleton:** ports for `BriefingSource`, `AgentChannel` (ask/instruct/fork_query with a `fork: native|history_copy|replay|none` capability), `CommandSource`, and `Credentials`.
  - Default limits: `max_session_seconds: 1800`, `idle_timeout_seconds: 120`, `daily_minutes_cap: 60`, `context_token_budget: 4000`, `briefing_token_budget: 1500`, `max_sessions: 1`.
  - CI keeps the package isolated from aiur.

**Planned (research branch, Unverified as built):**
- Providers: OpenAI Realtime/GPT-Live, Gemini Live, ElevenLabs Agents, a cascade (STT → LLM → TTS), and text-only.
- A briefing ("status card") so the voice model answers in about 1 second without stopping the coding agent.
- A read-only native fork for "why" questions.
- A `talk` standalone binary.
- Character timing: only ElevenLabs gives per-character timing, so other providers' text is paced against the audio clock.

**Fork-cost evidence (Verified, side-query spike):** a warm Claude fork of a large session costs about the parent's size × the cache-read price. At 360k tokens, measured warm forks cost USD 1.59 and the first fork cost USD 2.94. Changing the tool list breaks the cache. **This answers spec §5.10:** do *not* copy the full agent context into every voice session. A curated briefing (≤4k tokens) is the default, and forks are an occasional, costed escalation.

**Proposed boundary.** One wire protocol, two server hosts, five modes:

| Mode | MVP? | Capture | AI services | Turn-taking | Captions | Context | Usage unit | Owner |
|---|---|---|---|---|---|---|---|---|
| **Dictation** (describe a game, bug report, NL edit) | **Yes** | Browser mic → PCM16 16 kHz → Game Maker relay | Streaming STT only | Push-to-talk; the user reviews the text before submitting | Live partial and final text | None | audio-seconds | Shared client + GM TypeScript relay |
| **Live agent conversation** (clarify by voice, editor coaching) | Later | Same | Speech-to-speech *or* cascade | Barge-in, eagerness, idle timeout | Agent text always shown (§5.10); highlighting where timing exists | Briefing ≤4k tokens; optional costed fork | minutes + tokens | `voice_converse` (Elixir) *or* a GM TS host speaking the same wire protocol |
| **Narrated in-game dialogue** | Later / optional | n/a | TTS at **build time**, stored as assets keyed by `hash(text, voice, model, settings)` | n/a (playback) | Read-along from stored timestamps | Script lines | characters | Game build pipeline + Engine SDK player |
| **User-recorded voice assets** | Later | MediaRecorder upload | None (optional moderation) | n/a | Optional STT for captions | n/a | storage | Asset service (R16). A child's voice is sensitive personal data and needs consent. |
| **Human voice chat** | Later (with multiplayer) | WebRTC | None (not AI) | Human | Optional | n/a | bandwidth/SFU | Multiplayer runtime (R12). **Not part of the voice-AI package.** |

**The reusable boundary is the wire protocol plus the browser client, not one server language.**
- Mirror `Aiur.Voice.Transcriber`'s events (`partial`, `final`, `error`, `closed`) and `voice_converse`'s planned frame codec. Add a `usage` frame `{provider, model, audio_ms|chars|tokens, cost_basis}` and an `alignment` frame.
- Package the browser side (mic permission UX, AudioWorklet capture, echo-cancelled playback through a media element, caption and highlight renderer) as an npm package. Game Maker and aiur's dashboard could both use it. aiur's plan currently ships one JS file in `priv/` and defers the npm package (E6-OQ16).
- For MVP, Game Maker runs a **small TypeScript relay** (one websocket route that holds the vendor key) so that dictation never waits on MP-E6.
- Pick the provider only after the legal agent rules on children's data. ElevenLabs is blocked unless written approval is obtained. Candidates to evaluate later: OpenAI, Google, Deepgram, and Azure STT (all Unverified for under-13 terms).
- Do not use the browser Web Speech API by default. On Chrome it sends audio to Google, and its retention is not under Game Maker's control (Unverified for current terms).

## 11. Caching and model tiers — hypotheses and a bounded benchmark

Claude list prices per MTok (input / output, cache read), from the bundled API reference cached 2026-10-06:

| Model | Input | Output | Cache read |
|---|---|---|---|
| Opus 5.5 | $4 | $20 | $0.20 |
| Sonnet 5.5 | $2 | $10 | $0.20 |
| Haiku 5.5 (≤100k-token prompts) | $0.10 | $0.50 | ~0.1× input |

Cache writes cost 1.25× input with the 5-minute TTL and 2× with the 1-hour TTL. Caches are model-scoped and invalidated by any change to the prefix, including the tool set. Subscription use has no per-token price, only window consumption.

**Hypotheses** (none is a claim):

| # | Hypothesis | Metric |
|---|---|---|
| H1 | A stable, frozen per-repository prefix (Engine SDK contract, editor rules, game design doc) gives ≥70% cache-read share on feature jobs. | `cached_input / (input + cached_input + cache_creation)` from aiur envelopes |
| H2 | A heavy initial build (Opus 5.5, high effort) plus Sonnet 5.5 at medium for follow-ups costs less *per successful feature* over 5 follow-ups than Sonnet throughout, at equal or better pass rate. Per the API guidance, also test the arm "Opus 5.5 at lower effort for everything", because a single model keeps a single cache namespace. | cost per successful task, including retries and repairs |
| H3 | Dynamic specialists (0–3) beat one planner turn on rubric quality for an RPG but not for a puzzle game, and the extra synthesis tokens are ≤25% of job cost. | rubric score, synthesis tokens |
| H4 | Clarify with Haiku 5.5 directly in Game Maker stays under 3 s p50 and under $0.01 per exchange. Raising a Command in aiur takes minutes. | latency, cost |
| H5 | Dialogue TTS generated at build time and cached by hash makes the per-play speech cost zero. Total cost tracks the number of unique lines, not the number of plays. | characters synthesized ÷ plays |
| H6 | Changing tools or models mid-job (fallback, `--disallowedTools`) destroys cache savings. Keep tool sets fixed per tier. | cache-write tokens after a switch |

**Benchmark plan** (requires Kevin's approval; no spending before then):
- **Corpus:** 3 fixed seed specs (a simple UI puzzle, a platformer, a stateful RPG) × 1 new-game build + 5 scripted follow-up features each, all in a throwaway private games repository.
- **Arms:** A = Opus-high then Sonnet-medium; B = Sonnet-medium throughout; C = Opus 5.5 at medium throughout. Specialists on or off is a factor only for the RPG.
- **Runs:** n = 1 per cell first, as a pilot; repeat later only where cells differ.
- **Tooling:** pre-register the hypotheses with `aiur experiments` (A/B cohorts on the `model:` and `complexity:` attributes); spend comes from `aiur.cost_report --ticket`; quality from Playwright smoke tests plus a 5-item rubric (2 human raters: Kevin and the nephew for fun/readability).
- **Budget:** hard cap **USD 150 API-equivalent**, stopping at USD 125. Alternatively, run on subscription capacity only, with no dollar spend, if the legal agent allows personal use for this. Estimated draw: about 54 jobs.

## 12. Reuse / adapt / build

| Item | Decision |
|---|---|
| aiur daemon (dispatch, worktrees, CI/rework, routing, multiple accounts, usage ledger) | **Reuse** as a worker over a games repository |
| Prompt template, `.aiur/config`, complexity labels | **Adapt**: Game Maker-specific template and routing table |
| Build Orders / build queue for specialist → synthesis → build | **Reuse** for new games; skip for small features |
| `aiur experiments` | **Reuse** for R15 benchmarks |
| Usage envelope schema | **Adapt** as Game Maker's ledger shape (§8) |
| Cost HTTP endpoint, per-ticket spend cap, job-create API | **Build upstream in aiur** (small tickets for Kevin) or work around with a sidecar |
| `@aiur/contracts` | **Reuse** only to read capabilities. Too narrow otherwise. |
| `aiur-style` | **Skip** (operator design system) |
| `Aiur.Voice` events, `voice_converse` wire and limits | **Adapt** as the shared voice contract |
| MVP dictation relay + browser client | **Build** (TypeScript, small) |
| Two-way conversation | **Reuse `voice_converse` later**, or a TypeScript host speaking its protocol (decision below) |
| Clarify, intent, and hint model calls | **Build** in Game Maker (direct SDK calls) |
| Per-household admission, reservations, caps | **Build** in Game Maker |

## 13. Licensing and data questions

- **Licences:** aiur is Apache-2.0 (`LICENSE`, `NOTICE`); `@aiur/contracts` and `aiur-style` are MIT. `voice_converse` declares no licence in its `mix.exs`, so whether it can be reused standalone is **Unverified**.
- **Children's text reaching agents:** aiur sends ticket bodies to coding-agent providers, and transcripts and session files land on the worker disk and in provider retention.
  - What tickets may contain: R04 and R10 must define the minimum. Use no real names, and never put raw audio in tickets.
  - The game repository is GitHub-hosted, so issue text and PR bodies are stored by GitHub. Private-repository requirements belong to R07.
- **Voice:** aiur's voice rules (key on the server, no audio stored, provider-side storage off where possible) are a good baseline. Vendor terms for under-13 and under-18 users decide the provider (legal agent).
- **Subscription for multi-user use:** see §5. Treat it as blocked until the legal agent rules.

## 14. Stack integration (TypeScript ↔ Elixir, Railway)

- The integration surface is **HTTP (Basic-auth `/api/v1/*`) plus GitHub (issues, labels, webhooks) plus CLI JSON** (`aiur units|status|accounts|capabilities --json`). There is no SDK. Use `@aiur/contracts` types for the capabilities report, and hand-write zod schemas for the `/state` and `/:issue` responses. The responses are not versioned contracts yet (Inferred); pin the aiur version.
- **Railway** (Unverified; R05 owns this):
  - aiur needs a long-lived Linux service with a persistent volume (`~/.aiur` state, ledger, workspaces), tmux, git, the Claude and Codex CLIs, and bubblewrap. Bubblewrap needs user namespaces, which may be unavailable in Railway containers. If so, Codex cannot run sandboxed; use Claude only, or an SSH worker.
  - aiur's documented SSH-worker extension (`worker.ssh_hosts`) offers a later path: orchestrator on Railway, heavy work on a home box over outbound SSH. Not yet evaluated against Kevin's no-tailnet constraint.
  - The aiur HTTP listener should be private to the Railway network, never public.

## 15. Likely costs (illustrative, not measured)

| Item | Assumption | API-equivalent |
|---|---|---|
| Feature job (Sonnet 5.5) | 4M cache-read + 0.3M fresh + 0.3M cache-write input, 0.1M output | ≈ $3 |
| New game (Opus 5.5 build + design) | 15M cache-read + 1M fresh + 1M write, 0.4M output | ≈ $20 |
| Clarify exchange (Haiku 5.5) | 10k in / 1k out | ≈ $0.0015 |
| Dictation | ElevenLabs Scribe v2 realtime $0.39/h (secondary, Unverified; provider may change) | ≈ $0.0065/min |
| Dialogue TTS | $0.04–0.08 per 1k characters (secondary, Unverified) | ≈ $0.05 per 1k-character script, one-off |
| Voice fork side-query | spike: $0.03–1.59 warm, up to $2.94 cold, depending on parent size | per question |

These figures are wide hypotheses for setting the size of reservations. Replace them with measurements from §11.

## 16. Evaluation method

- **Integration spike** (no paid models): run aiur with the `memory` tracker or a throwaway repository and the `fake` provider. Measure:
  - issue → claim latency, with and without webhooks;
  - completeness of the `/api/v1/:issue` progress data;
  - whether pause and cancel take effect within 10 seconds;
  - whether cost-report JSON can be joined to the job.
- **Cost model:** check that the Game Maker ledger reconciles with `aiur.cost_report` to within 1% for API-key runs.
- **Voice MVP:** word error rate on 30 adult-recorded kid-style prompts (no children's audio until legal approval), time from audio end to final text, and microphone-permission success on iPad Safari and desktop Chrome.

## 17. Next steps

1. Legal agent: rule on subscription-backed hosted use and on STT providers for children.
2. R07: confirm the games-monorepo shape (one aiur daemon) versus per-game repositories.
3. File small upstream aiur tickets for Kevin to approve:
   - `GET /api/v1/usage?ticket=`;
   - per-ticket token/cost cap;
   - optionally a job-create endpoint, to avoid GitHub latency.
4. Zero-cost integration spike (§16) on a local machine with the fake provider.
5. Specify Game Maker's job, ledger, and reservation tables (§8–9) with R11 analytics kept separate.
6. Build the MVP dictation relay and client against the mirrored `Aiur.Voice` events, provider TBD.
7. Pre-register and, if approved, run the §11 benchmark.

## 18. Decisions for Kevin

1. **Integration shape:** Option A+C (aiur builds the PR-shaped jobs; Game Maker calls models directly for clarify, intent, and hints), or full Option A, or Option C?
2. **Repository topology driven by aiur's one-daemon-per-repository model:** a shared games monorepo, or per-game repositories with a different worker design?
3. **Upstream aiur work:** may Game Maker's needs (cost endpoint, per-ticket spend cap, job-create API) be filed as aiur tickets, or must Game Maker work around them?
4. **Voice host for two-way conversation:** wait for and reuse the Elixir `voice_converse` (adds an Elixir service next to the TypeScript backend), or build a TypeScript host on the same wire protocol?
5. **Benchmark budget:** approve USD 150 API-equivalent (stop at 125), or subscription-only runs if the legal agent allows them, or defer.
6. **Starting limits:** default household slots (2?), and whether jobs over budget pause for the admin or fail outright.

**Unverified items:**
- Railway compatibility (tmux, bubblewrap, volumes).
- All vendor voice prices and terms.
- Exact lag from the cost ledger to the watchdog.
- Licence of `voice_converse`.
- Whether `/state` and `/:issue` JSON shapes are stable.
