# T06 voice-and-build-chat: evidence packet

Researched at OGM `9508c1c` (branch `research`) against aiur `main` `0f692a45b` (`/home/orangekid/github/aiur`, read only). Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

Two-way creation voice through aiur's `voice_converse` (what exists on current main; the token issuer, wire contract, narration, no-transcript mode, TS client), one-way dictation, narration and captions, the budget-aware voice agent (read-only budget and estimate tools, four offers), the build chat (text, dictate, two-way; screenshots and clips at each visible step) and direction checkpoints (2–5 rapid prototypes mapped onto aiur Commands so only dependent work pauses).
Out of scope: aiur job admission, usage and progress APIs as such (T02), budgets and admission (T01), the skills that produce the screenshots (T10), the web app shell (T09), the bucket (T05), process supervision and TLS (T11).
Providers ElevenLabs then OpenAI are decided; no keys exist and no spending is allowed, so this packet says what ships with zero spend.

## 2. Evidence packets

### E06-1: `voice_converse` on current main is a working package, not the skeleton the research describes
- Claim / current behavior: B2 §2 and A6 §10 (aiur `ad084b1f3`) say the package has "no sessions, no providers, no wire codec and no transport" and "4 of 66 tickets closed". On `0f692a45b` the package has 8,932 lines across sessions (`session.ex` 500 lines, `session/{start,runtime,consult,confirmation}.ex`), two live provider adapters, a wire codec, a standalone WebSocket transport, a token issuer, batch narration, a no-transcript mode, drafts with Confirm, a summary tool, transcript store and index, provider cleanup, agent forks (Claude Code and Codex), a fake provider for tests and 40 test files.
- Source and exact locus: `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/**` (file list and `wc -l`), `README.md` of the package; aiur-side host under `src/lib/aiur/voice_converse/host/*.ex`; component manifests `components/voice-conversation-core.json`, `components/voice-conversation.json`.
- Why it matters: the V1 path "thin Elixir host around the package" (decision log, "Stack") is buildable today; the B2 D3 "TypeScript relay first" fallback is unnecessary.
- Confidence and freshness: [V] as of `0f692a45b`.
- Contradiction or open question: contradicts B2 §1–§2 and A6 §10 ("skeleton"); the handoff prompt's recheck instruction was right.
- Suggested requirement/decision impact: tickets consume the package as a pinned git dependency; no voice core is written in OGM.

### E06-2: The wire contract is versioned JSON (v1, 16 frame types) with a JSON Schema and generated TypeScript types; the browser client is a single ES module, not an npm package
- Claim / current behavior: `VoiceConverse.Wire` validates `v: 1` frames. Client→server: `start{target}`, `audio{data_b64}`, `text{text}`, `confirm_draft{draft_id, edited_text?}`, `discard_draft{draft_id}`, `end`. Server→client: `state{state}`, `transcript{kind: partial|final, text}`, `agent_text{turn_id, text, final}`, `agent_audio{turn_id, format: pcm_16000|pcm_24000|pcm_44100, data_b64}`, `interrupted{turn_id}`, `draft{draft_id, kind, target, text, status}`, `delivery{draft_id, message_id?, status}`, `context_gap{source, message}`, `error{code, message}`, `ended{reason}`. Unknown fields survive. The schema is published in `@aiur/contracts` with generated types `VoiceConverseFrame`; the browser client is `priv/static/voice_converse_client.js` (242 lines: `getUserMedia` on a click, ScriptProcessor capture resampled to 16 kHz PCM16, PCM playback queue, draft cards with Confirm/Discard).
- Source and exact locus: `packages/elixir/voice_converse/lib/voice_converse/wire.ex` (`@client_types`, `@server_types`, `@required`); `packages/aiur-contracts/schemas/voice-converse.v1.schema.json`; `packages/aiur-contracts/src/voice-converse.generated.ts`; fixture `packages/elixir/voice_converse/test/fixtures/wire/v1.jsonl`; `priv/static/voice_converse_client.js`.
- Why it matters: OGM's TS client types come free from `@aiur/contracts` (`"./schemas/*"` export, `VoiceConverseContract`); the JS client is a reference implementation to port, not a dependency (it uses the deprecated `createScriptProcessor` and no captions/highlighting).
- Confidence and freshness: [V] as of `0f692a45b`.
- Contradiction or open question: the decision log's "a TS voice client (npm)" does not exist as a package; `@aiur/contracts` (`"version": "0.1.0"`, not published) carries the types only.
- Suggested requirement/decision impact: ticket "voice client package" ports the ES module to TypeScript with AudioWorklet capture and a caption renderer, typed from `@aiur/contracts`.

### E06-3: A host-supplied token issuer and a standalone, loopback WebSocket transport exist (B2 gap G5 covered)
- Claim / current behavior: `VoiceConverse.Ports.TokenIssuer` (issue/verify with scope, expiry, subject) and the shipped `VoiceConverse.TokenIssuer.Hmac` (tokens `vct1.<base64url json>.<base64url hmac-sha256>`, payload `{scope, sub, exp, nonce}`, secret ≥32 bytes installed with `put_secret/2`, default TTL 300 s, max 3,600 s, constant-time compare). `VoiceConverse.Transport.WebSock` (Bandit, compiled only when the host adds `websock_adapter` and `bandit`) binds `127.0.0.1` by default, verifies `Authorization: Bearer` or `?token=` with scope `"converse"`, closes `4401` otherwise, caps frames at 400,000 bytes, maps session events to wire frames.
- Source and exact locus: `lib/voice_converse/ports/token_issuer.ex`, `lib/voice_converse/token_issuer/hmac.ex` (`@prefix "vct1"`, `@default_ttl_s 300`), `lib/voice_converse/transport/websock.ex` (`@token_scope "converse"`, `init(%{authorized?: false})`).
- Why it matters: OGM's Node backend can mint the same HMAC token itself (the format is small and documented), so one shared secret links the TS backend and the Elixir host with no RPC. The transport is loopback, so T11's reverse proxy must forward `wss://` to it.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: `POST /api/voice/token` in the OGM backend mints `vct1` tokens with `sub = creator id`; T11 exposes the voice host at one path behind TLS.

### E06-4: A no-transcript mode exists (G2 covered), but it also disables provider-side conversation cleanup
- Claim / current behavior: `Config.transcript: :file | :none`; `:none` needs no `transcript_root`, refuses one if given, and `TranscriptStore.start/4` returns `:none` (writes nothing anywhere; tests check the disk). But `VoiceConverse.children/1` starts `ProviderCleanup` and `BootReconciler` only for `transcript: :file`, so in `:none` mode the queue that deletes ElevenLabs provider conversations after a session never runs.
- Source and exact locus: `lib/voice_converse/config.ex` (`check_transcript_mode`, `required_fields`), `lib/voice_converse/transcript_store.ex` (`start/4`), `test/voice_converse/no_transcript_test.exs`, `lib/voice_converse.ex` (`transcript_children/1`).
- Why it matters: V1 wants no transcripts (decision log "no-transcript mode") and provider conversations deleted; today you get one or the other.
- Confidence and freshness: [V] for the code paths; [I] that no other path enqueues cleanup in `:none` mode.
- Contradiction or open question: contradicts B2 §2 "provider conversations are deleted after each session" when combined with no-transcript.
- Suggested requirement/decision impact: file an upstream aiur issue ("provider cleanup in `transcript: :none`"); V1 default `transcript: :none` plus ElevenLabs `record_voice: false` through the privacy policy (E06-9) until fixed.

### E06-5: A batch narration path exists in the core, but no real adapter implements it (G4 partial)
- Claim / current behavior: `VoiceConverse.Narration.render/2` and `render_to_file/3` call the optional provider callback `render_speech/1`, return raw PCM plus `alignment: [%{text, start_ms, end_ms}]`, write WAV atomically, enforce `max_chars` 5,000 and a 60 s deadline, and check the privacy policy. Only `VoiceConverse.Testing.FakeProvider` implements `render_speech/1`; the ElevenLabs Agents and OpenAI Realtime adapters do not, so `Narration.render` returns `{:error, :unsupported}` for both. There is no HTTP, CLI or cache surface; it is an in-process library call.
- Source and exact locus: `lib/voice_converse/narration.ex`, `lib/voice_converse/provider.ex` (`@optional_callbacks render_speech: 1`), grep of `render_speech` across `lib/voice_converse/provider/*` (none) and `testing/fake_provider.ex` (present).
- Why it matters: "narration rendered once and cached by content hash" (release plan) needs an adapter with `render_speech` (ElevenLabs TTS with timestamps) plus OGM's cache keyed by `sha256(text, voice, engine, version, speed, lang)` (B2 §5.1).
- Confidence and freshness: [V].
- Contradiction or open question: handoff prompt lists "narration render" as a V1 need from aiur; it is half there.
- Suggested requirement/decision impact: upstream request "ElevenLabs `render_speech` adapter"; OGM ticket wraps `render_to_file` behind the voice host's internal HTTP and caches to the bucket; V1 ships captions always and browser `speechSynthesis` as the zero-spend read-aloud.

### E06-6: The live wire carries no alignment or usage frames (G3 open for live sessions)
- Claim / current behavior: `Wire` has no `alignment` or `usage` type; `Events` has no usage struct; the only usage value in the package is the agent-fork answer tuple. Alignment exists only in the batch render result (E06-5).
- Source and exact locus: `lib/voice_converse/wire.ex` (`@server_types`), `lib/voice_converse/events.ex` (`@all`), grep `usage|alignment` in `lib/`.
- Why it matters: spec §7.2 usage reporting and word highlighting in live replies cannot come from the package; per-session minutes are enforced by `SessionLimits` (daily cap) but not reported to the host as a frame.
- Confidence and freshness: [V].
- Contradiction or open question: B2 §5 item 4 asked for both frames; still open upstream.
- Suggested requirement/decision impact: V1 shows live agent text as captions (sentence level, no highlighting); OGM records session minutes from its own `start`/`ended` timestamps; file the upstream request.

### E06-7: Only ElevenLabs Agents and OpenAI Realtime are real adapters; cascade, text-only, OpenAI Live, Gemini Live and Codex Realtime are registry entries without modules
- Claim / current behavior: the registry maps `:cascade` and `:text_only` to `nil` modules and names `VoiceConverse.Providers.OpenAILive`, `GeminiLive`, `CodexRealtime`, which are not defined anywhere outside test support. `Providers.resolve/1` skips adapters that are not loaded. The standalone WebSocket refuses the `text` client frame ("Text input is unavailable"). The ElevenLabs adapter speaks the Agents WebSocket (16 kHz PCM both ways, client tools, interruption); the OpenAI adapter uses the GA Realtime protocol (24 kHz out, `gpt-4o-mini-transcribe` for input transcription).
- Source and exact locus: `lib/voice_converse/providers/registry.ex` (`@registry`), `lib/voice_converse/providers.ex` (`resolve_preference`), grep `defmodule VoiceConverse.Providers.OpenAILive` (only `test/support/provider_test_support.ex`), `lib/voice_converse/transport/websock.ex` (`dispatch(%{"type" => "text"}, ...)`), `lib/voice_converse/provider/{eleven_labs_agents,openai_realtime}.ex`, `website/docs-app/reference/configuration-voice.md`.
- Why it matters: the "cascade with browser STT/TTS" in the config docs is configuration only; there is no zero-spend voice path through the package, and no text-chat path through its transport. Two-way voice in V1 needs an ElevenLabs or OpenAI key, which Kevin has not approved.
- Confidence and freshness: [V].
- Contradiction or open question: B2 §2 "Planned" lists cascade and text-only as provider families; they remain unbuilt.
- Suggested requirement/decision impact: V1 two-way voice is wired and tested against `VoiceConverse.Testing.FakeProvider` and turns on the day a key is added; text and dictation modes bypass the package entirely (E06-11, E06-13).

### E06-8: The tool set is fixed by the core; host-defined tools do not exist, so the budget tools map unevenly
- Claim / current behavior: `Tools.specs/2` offers `get_status`, `get_details(section, n)` (sections come from the host's `BriefingSource.sections/1`), `list_open_commands` (if a `CommandSource` is set), `propose_instruction(text)` (creates a draft the client must Confirm; delivered through `AgentChannel.instruct`), `ask_agent(question, question_type)` (needs `AgentChannel` `ask: true` or a fork), `record_summary(decisions, open_questions, ideas)` and `end_conversation`; `allowed_tools` can only restrict. There is no port for a host to add a tool with parameters.
- Source and exact locus: `lib/voice_converse/tools.ex` (`specs/2`, `dispatch/3`), `lib/voice_converse/ports/{briefing_source,agent_channel,command_source}.ex`, `lib/voice_converse/summary_tool.ex`, package `README.md` ("Hosts may set allowed_tools").
- Why it matters: C2 §5 wants `budget_status()`, `estimate_change(summary, game_id)`, `queue_change(plan, start)`. Mapping: `budget_status` = a host detail section `"budget"` (and a `waiting_on`/`extra` line in the briefing); `queue_change` = `propose_instruction` → draft → Confirm → `AgentChannel.instruct`, where OGM's channel hands the text to admission with `start: now | at_reset` parsed from the draft kind; `estimate_change` has no parameterised tool to ride on.
- Confidence and freshness: [V] for the tool list; [I] for the mapping.
- Contradiction or open question: C2 §5 assumed host tools; the architecture doc repeats it.
- Suggested requirement/decision impact: upstream request "host tool port (name, JSON params, handler)"; V1 workaround: the briefing's `extra` block carries today's remaining allowance, the reset time, free slots, queued jobs and a coarse size-class table so the agent can estimate in prose; admission remains the backstop (C2 §5 risk).

### E06-9: Configuration is explicit and credential-free; the privacy policy can pin ElevenLabs `record_voice: false`
- Claim / current behavior: `Config` requires `credentials` and `briefing_source` (and `transcript_root` unless `:none`); a session refuses to start until `llm` and `cloud_disclosure_accepted: true` are set. Limits default to 1,800 s per session, 120 s idle, 60 min/day, 4,000 context tokens, 1,500 briefing tokens, `max_sessions: 1`, `consult_timeout_seconds: 300`. `privacy` accepts `provider_allowlist`, `required_provider_options` (matched against adapter descriptors; the ElevenLabs adapter declares `record_voice`) and `provider_host_allowlist`. Credentials are fetched at use time through the `Credentials` port (`:probe` returns presence only). Port deadlines are 100 ms (`brief`), 300 ms (`details`, `ask`, `instruct`, `answer`), 50 ms (`fetch`, `token`).
- Source and exact locus: `lib/voice_converse/config.ex` (`@required`, `@default_limits`, `check_session_start/1`), `lib/voice_converse/provider_policy.ex`, `lib/voice_converse/ports.ex` (`@deadlines_ms`), aiur host example `src/lib/aiur/voice_converse/host/config.ex` (`allowed_tools: ["get_status","get_details","record_summary","end_conversation"]`).
- Why it matters: `max_sessions: 1` is per instance, so a family with two creators talking at once needs the limit raised (any positive integer validates) and OGM's own per-creator caps; the 50–300 ms port deadlines mean the Elixir host cannot call the OGM backend over HTTP inside a port and must serve from a local cache the backend pushes to.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: host config `transcript: :none`, `privacy: %{provider_allowlist: [:elevenlabs_agents, :openai_realtime], required_provider_options: %{elevenlabs_agents: %{record_voice: false}}}`, `limits.max_sessions` = concurrency decided by T01; the host keeps a briefing cache updated by the backend.

### E06-10: Drafts, Confirm and the session-end summary are the scope-agreement and handoff mechanism
- Claim / current behavior: nothing reaches an agent without a client Confirm (`confirm_draft`, optional `edited_text`); the first `ask_agent` also waits for confirmation by default (`ask_requires_confirm: :first_in_session`). `record_summary` validates and redacts three string arrays and broadcasts `{:summary_recorded, summary}` to subscribers; the aiur host publishes `executor.voice.session_ended` with the transcript and summary marked `untrusted_fields`.
- Source and exact locus: `lib/voice_converse/session/confirmation.ex`, `lib/voice_converse/drafts.ex`, `lib/voice_converse/summary_tool.ex`, `src/lib/aiur/voice_conversation/handoff.ex`, `website/docs-app/reference/configuration-voice.md` (client tool shapes).
- Why it matters: the creation flow "agree a scope" is `record_summary` (decisions = the agreed scope, open_questions, ideas) plus one confirmed draft that becomes the build request; the aiur host adapter `AgentChannel.instruct` → Listener (`aiur message`) is the pattern for OGM's channel.
- Confidence and freshness: [V].
- Contradiction or open question: the ElevenLabs Agent needs the four client tools configured on the ElevenLabs side with exact names and shapes (operator step, docs) — not code.
- Suggested requirement/decision impact: OGM's `AgentChannel.instruct(target, text, key)` posts to the backend's admission (scope target) or to `POST /api/v1/:ticket/messages` (build target); the summary subscriber stores the agreed scope.

### E06-11: One-way dictation in aiur lives in the app, not the package; zero-spend dictation is the browser
- Claim / current behavior: aiur's dictation is the Phoenix socket `/voice` with channels `voice:dictate`, `voice:dictation`, `voice:conversation`, `voice:executor`, authenticated by the dashboard session plus CSRF, backed by `Aiur.Voice` (ElevenLabs Scribe transcriber). None of it is in `voice_converse`, and the package has no STT-only session kind.
- Source and exact locus: `src/lib/aiur_web/voice_socket.ex` (`channel(...)`, `connect/3`), `src/lib/aiur_web/voice_channel.ex` (`@dictate_topics`), `src/lib/aiur/voice.ex`.
- Why it matters: OGM cannot embed aiur's dictation. With no keys, the only dictation that costs nothing is the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), which sends audio to Google on Chrome unless `processLocally` and to Apple on Safari (B2 §3.4, secondary sources). V1 is adults only, so the child-data objection does not apply.
- Confidence and freshness: [V] for aiur; [O] for the browser default.
- Contradiction or open question: A6 §10 "Do not use the browser Web Speech API by default" was written for children's data; the release plan moved that to V3.
- Suggested requirement/decision impact: V1 dictation = Web Speech API with push-to-talk, partial/final captions and review-before-send; the `transcript{partial|final}` frame shape is reused so the UI is provider-neutral; a server STT upgrade slots in later. Mark as decision for Kevin [O].

### E06-12: Captions can ship at zero cost; narration audio cannot
- Claim / current behavior: captions are text the app already has (agent text, dialogue lines). Read-aloud with zero spend is `speechSynthesis` (on-device; boundary events unreliable on iPad, so sentence-level highlighting, B2 §3.4). Rendered narration (Opus plus word timings, cached by hash) needs a TTS adapter and a key (E06-5).
- Source and exact locus: B2 §3.2 table, §3.4, §5 item 1; `docs/spec/release-plan.md` row "Narration and captions" ("highlighting Working").
- Why it matters: the SDK's `SpokenText` asset (A3) and the caption renderer can be built and tested now with `speechSynthesis` and a fixture of pre-rendered WAV plus alignment from `FakeProvider`.
- Confidence and freshness: [V] for sources; [O] for the default.
- Contradiction or open question: none.
- Suggested requirement/decision impact: narration pipeline ticket is key-gated; captions and the player-side renderer are not.

### E06-13: aiur gives the build chat text-in, progress-out and events, but no media; screenshots and clips need OGM's own chat store
- Claim / current behavior: `POST /api/v1/:issue_identifier/messages` (`text` or `message`, optional `message_id`) enqueues operator text to the worker under its listener mode (`sync|steer|async|mute`; queued for the next worker if none runs; 8,000 chars). `GET /api/v1/:id/progress` returns `phase`, `progress{percent,source,freshness}` and `events[]{id,type,topic,label,summary,at}` (`checkin` events from the agent). Outbound signed webhooks cover lifecycle, progress, usage, spend cap and cancel result. No aiur contract has an attachment, image or screenshot field.
- Source and exact locus: `src/lib/aiur_web/routes/api.ex` lines 14–18, `src/lib/aiur_web/controllers/observability_api_controller.ex` (`send_message/2`), `packages/aiur-contracts/schemas/ticket-progress.v1.schema.json`, `packages/aiur-contracts/README.md` (schema table), grep `attachment|image|screenshot` in `command.v2.schema.json` (0 hits), `website/docs-app/reference/cli-operations.md` (`aiur message`).
- Why it matters: the build chat is OGM-owned: creator → OGM store → aiur messages; agent → `gm chat post` (text, PNG, MP4) → OGM store (media in the bucket) → the panel; aiur progress and lifecycle events become system rows via T02's event receiver.
- Confidence and freshness: [V].
- Contradiction or open question: none; the decision log row "Build chat" is implementable without upstream change.
- Suggested requirement/decision impact: define `BuildChatMessage` (§4) and the `gm chat post` CLI; T10's skills call it where `gm-design-loop` step 4 says "Post a screenshot (or a short clip)".

### E06-14: The design skill already tells agents to show as they go; it lacks a command target
- Claim / current behavior: `gm-design-loop` step 4 "Show as you go. Post a screenshot (or a short clip) with one line at each visible milestone … Keep building while they look; fold their notes in at the next step." `gm-verify` produces phone-size stills and H.264 MP4 clips (960 px, CRF 27, `+faststart`) with `capture.mjs record` and an artifact page. Neither names a chat command; posting today means a Claude artifact page.
- Source and exact locus: `/home/orangekid/games/open-game-maker-2000/.claude/skills/gm-design-loop/SKILL.md` lines 30–32; `.claude/skills/gm-verify/SKILL.md` lines 36–38.
- Why it matters: the decision-log sentence "The agents' design skill tells them to do this" is true for the rule and false for the plumbing.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: T10 edits step 4 to `gm chat post --job $GM_JOB --clip … --text "…"` once the CLI exists (this track defines the CLI contract, T10 owns the skill text).

### E06-15: Direction checkpoints map onto aiur Commands raised by the worker; a blocking Command holds only that worker's ticket
- Claim / current behavior: a worker asks a bounded question by emitting `decision.requested` with structured `options` and a recommendation (`aiur-agent` skill); Codex and Claude native questions (`AskUserQuestion`) are captured into Commands by default (`decisions.native_capture.*`), and "Aiur holds the native question while its Command awaits an answer" — the hold is on that worker; `blocking: false` keeps the worker working. Commands are read at `GET /api/v1/decisions[/:id]` (fields `decision_id, version, question, requester, origin, native{harness,hold,question_ids}, questions, short_label, route_*`) and answered at `POST /api/v1/decisions/:id/decide` (option or custom response, expected version, idempotency key, as the CLI `aiur command … --option`). Options are `id=label` strings; no media.
- Source and exact locus: `/home/orangekid/github/aiur/.agents/skills/aiur-agent/SKILL.md` lines 86–100; `website/docs-app/concepts/commands.md` §Native questions (lines 376–409) and lines 45–52; `src/lib/aiur_web/routes/decisions.ex` lines 14–29; `packages/aiur-contracts/schemas/command.v2.schema.json` (properties list); `cli-decisions.md` (`aiur command DECISION-ID --option ID`).
- Why it matters: "only dependent work pauses" falls out of two aiur facts: a Command holds one worker, and other tickets keep dispatching. Inside one ticket the agent raises the checkpoint non-blocking and continues the independent subtasks (asset lineup, scaffolding) until it needs the answer, then raises a blocking one or waits. Candidates (the 2–5 prototypes) are clips and stills posted to the build chat with ids equal to the option ids, so the card renders option = media.
- Confidence and freshness: [V] for aiur; [I] for the pairing convention.
- Contradiction or open question: whether decision events reach OGM as outbound webhooks is not shown in the contracts list (lifecycle/progress/usage/cancel only) → poll `GET /api/v1/decisions` filtered by ticket, or read the events feed; T02 to confirm.
- Suggested requirement/decision impact: `gm checkpoint open` writes the candidates to the chat and emits `decision.requested` (option ids = candidate ids, `--recommend`); the backend mirrors open Commands into checkpoint cards, notifies the creator, and answers through `/decide`; a chosen option is then delivered to the worker by aiur's normal Command delivery.

### E06-16: Which decisions deserve a checkpoint, and what a draft may cost, are not measured anywhere
- Claim / current behavior: A9 §6.2 ranks variant presentation by cost: static picture variants and playable presets of a prebuilt genre kit are about $0 and instant; agent-built ~10 s demos cost "roughly one small build each … measure in an aiur benchmark". Kevin's roadmap asks for the heuristics and a time/cost budget.
- Source and exact locus: `docs/research/v0.3/A9-qa-playtest-creation-guidance.md` §6.2; `docs/plans/roadmap-next-phases.md` step 2 bullet "direction checkpoints"; `docs/architecture/architecture-scope.html` FEATURES "Direction checkpoints" (`st: 'considering'`).
- Why it matters: without a cap, checkpoints multiply build cost; with packs-first assets, most candidates are asset lineups and camera/feel presets rendered by `gm-verify`, not agent rebuilds.
- Confidence and freshness: [V] for sources; [O] for the default below.
- Contradiction or open question: the feature is "considering" in the architecture doc; Kevin's 2026-10-30 note treats it as wanted.
- Suggested requirement/decision impact: default rule in the design skill: a checkpoint only for style family, hero look, main mechanic feel, level layout and music mood; at most 3 per creation build and 1 per feature build; candidates are lineups, presets or ≤10 s clips of existing scaffolds, never separate agent builds. Measure cost through T01's analytics once live.

### E06-17: There is no zero-spend LLM for a backend chat agent; text scope chat must run inside an aiur worker
- Claim / current behavior: the machine has no `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `ELEVENLABS_API_KEY` in the environment; model access exists only through the signed-in Codex and Claude CLIs that aiur drives (README non-goals; questions A9). The package's conversation model is the provider's (ElevenLabs Agent model or OpenAI Realtime), so it also needs a key.
- Source and exact locus: [M] `env` presence check on this host (all three unset); `docs/plans/ogm-v1-build/README.md` "Non-goals"; `questions-or-commands.md` A9; `configuration-voice.md` "Keys come from the daemon environment".
- Why it matters: the build chat's text mode is fine (it talks to the ticket's worker through aiur messages), but the creation flow's scope chat has no worker yet. The zero-spend design is a short "scope" aiur ticket whose worker runs the scope conversation with the creator through messages and ends by writing the agreed scope.
- Confidence and freshness: [M]/[V]; design [I].
- Contradiction or open question: release plan "Creation … clarify, agree scope, build and test through aiur" is consistent with this; the architecture doc's voice-first scope chat is key-gated.
- Suggested requirement/decision impact: T02/T09 ticket "scope session as an aiur ticket"; the voice session, when a key exists, targets that same ticket (its `BriefingSource` reads the scope state).

### E06-18: A fake provider ships in the package, so the whole voice path is testable with no key
- Claim / current behavior: `VoiceConverse.Testing.FakeProvider` implements the provider behaviour including `render_speech/1` (silence plus alignment), scripted events, errors and delays; `FakeBriefingSource`, `FakeAgentChannel`, `FakeCommandSource` and `StaticCredentials` exist too.
- Source and exact locus: `lib/voice_converse/testing/*.ex` (compiled in `lib`, not `test/support`).
- Why it matters: OGM's voice host, token route, client and build-chat voice mode can have end-to-end tests (browser → wss → host → fake provider → frames) before any spend.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: the voice-host ticket's acceptance test uses `FakeProvider`; a `--fake-voice` dev flag selects it.

### E06-19: The prototype's voice and progress UI is theatre; its layout is the only thing worth keeping
- Claim / current behavior: `VoiceSession` in `prototypes/studio-v0/app.js` (lines 401–540) plays scripted turns with a drawn seismograph and orb; no microphone or network. The "bottom loading bar" is the `#tracker` panel with `#tr-fab`, a ring, per-job bars and step text, fed by a fake timer (lines 560–640). Both are 1,000-line vanilla JS files with no tests.
- Source and exact locus: `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js` lines 401–470, 555–640; no `SpeechRecognition|getUserMedia|MediaRecorder` anywhere under `prototypes/` (grep).
- Why it matters: T09 must not port this; the two-column (you / builder) captions layout, "Type instead", the FAB ring and the "something finished" glow are the design references.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: the build chat panel replaces `#tracker`; the voice composer replaces `VoiceSession`.

### E06-20: Cost basis for the decided providers, for the day a key is approved
- Claim / current behavior: registry price hints: ElevenLabs Agents "about USD 0.08/min", OpenAI Realtime "token-priced", OpenAI Live "about USD 0.05/min". The aiur prototype's own guard was a USD 25 combined budget and `daily_minutes_cap: 5` for OpenAI trials.
- Source and exact locus: `lib/voice_converse/providers/registry.ex` (`price_hint`), `configuration-voice.md` ("Live evaluation has a combined USD 25 budget").
- Why it matters: T01's per-creator allowance needs a voice line item; the package's daily cap is per instance, so per-creator minutes are OGM's.
- Confidence and freshness: [V] for the hints (vendor-sourced, unverified here).
- Contradiction or open question: none.
- Suggested requirement/decision impact: default `limits.daily_minutes_cap` per instance = sum of member caps; OGM meters minutes per creator from `start`/`ended`.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Voice session core, providers, drafts, summary | `aiur/packages/elixir/voice_converse` (Elixir, 8.9k lines, 40 test files) | Keep as a pinned git dependency | Only Elixir besides aiur (decision log); replacing it is weeks |
| Wire contract and TS types | `aiur/packages/aiur-contracts/schemas/voice-converse.v1.schema.json`, `src/voice-converse.generated.ts` (TS, tests yes) | Keep; consume as a workspace dependency on the aiur checkout path until published | Already generated and fixture-checked |
| Browser client | `voice_converse/priv/static/voice_converse_client.js` (JS, no tests) | Port to TypeScript (`packages/voice-client`) | ScriptProcessor is deprecated; needs captions and push-to-talk |
| Token issuer | `voice_converse/lib/voice_converse/token_issuer/hmac.ex` (tests yes) | Keep on the host; re-implement the 20-line minting side in TS | Shared secret, no RPC |
| Standalone transport | `voice_converse/lib/voice_converse/transport/websock.ex` (tests yes) | Keep; supervise in the OGM voice host | Loopback by default; T11 proxies |
| Host adapters (ports) | `aiur/src/lib/aiur/voice_converse/host/*.ex` (Elixir, tests yes) | Replace with OGM ports in `services/voice-host` (Elixir) | aiur's read Listener and StatusReport; OGM reads its own backend cache |
| Dictation | `aiur/src/lib/aiur_web/voice_socket.ex` + `Aiur.Voice` (Elixir) | Replace with Web Speech API in `packages/voice-client/dictation.ts` | Tied to the dashboard session and an ElevenLabs key |
| Narration render | `voice_converse/lib/voice_converse/narration.ex` (tests yes) | Keep; wrap in the voice host; key-gated | No live adapter implements `render_speech` yet |
| Build chat | None (prototype `#tracker`, scripted `VoiceSession`; JS, no tests) | Replace: `apps/api/src/build-chat`, `apps/web/src/build-chat` | Throwaway prototype |
| Agent posting media | `gm-verify` capture tools (`capture.mjs`, `clips_page.py`; JS/Python) | Keep the capture; add `gm chat post` (TS) as the sink | Skills already say "post a screenshot" |
| Checkpoint questions | aiur Commands (`decision.requested`, `/api/v1/decisions`) | Keep; add `gm checkpoint open` and a backend mirror | Native hold semantics are exactly "only this worker pauses" |
| Budget tools | None in the package (fixed tool set) | Briefing section + drafts now; upstream host-tool port later | E06-8 |

## 4. Interfaces and contracts this track defines or consumes

**Voice token (this track, consumed by T09; verified by the voice host).** `POST /api/voice/token` → `{ "token": "vct1.<payload>.<mac>", "expires_at": "2026-11-01T05:30:00Z", "url": "wss://<host>/voice" }`. Minting in TS: `payload = base64url(JSON{scope:"converse", sub:<creatorId>, exp:<unix>, nonce})`, `body = "vct1." + payload`, `token = body + "." + base64url(hmacSha256(secret, body))`, secret ≥32 bytes shared with the host's `Hmac.put_secret/2`.

**Session target (this track; the host's `BriefingSource.describe_target/1` reads it).**
```ts
type VoiceTarget =
  | { kind: "scope"; game_id: string; session_id: string; creator_id: string }
  | { kind: "build"; game_id: string; job_id: string; ticket: string; creator_id: string };
```
Sent as `{"v":1,"type":"start","target":VoiceTarget}`.

**Briefing cache push (this track → voice host; consumed from T01 budgets and T02 progress).** `POST http://127.0.0.1:<port>/internal/briefing` body `{ target_key, summary, current_task, next_steps[], waiting_on, questions[], extra: [{title:"Budget", text:"…"}], sections: [{id:"budget", text}, {id:"progress", text}] }`; the host serves ports from this cache within the 100/300 ms deadlines.

**Agent channel (voice host → OGM backend; this track).** `POST /internal/voice/instruct` `{ target, text, idempotency_key, kind: "instruct"|"ask" }` → `{ delivery_id }`; the backend routes `scope` targets to admission (`queue_change` semantics: `start: "now"|"at_reset"` parsed from a leading `[later]` marker in the confirmed draft) and `build` targets to aiur `POST /api/v1/:ticket/messages`.

**Build chat message (this track; T09 renders, T02 feeds, T10's CLI writes).**
```ts
type BuildChatMessage = {
  id: string; job_id: string; at: string;
  actor: "creator" | "agent" | "system";
  kind: "text" | "image" | "clip" | "checkpoint" | "progress";
  text?: string;
  media?: { url: string; poster?: string; width: number; height: number; duration_ms?: number };
  checkpoint?: { decision_id: string; question: string; options: { id: string; label: string; media_id?: string }[]; recommend?: string; status: "open" | "answered" | "moot" };
  aiur?: { ticket: string; event_id?: number; topic?: string };
};
```
Stream: `GET /api/jobs/:job_id/chat?since=<id>` (SSE). Post: `POST /api/jobs/:job_id/chat` (creator text or dictated final transcript) → mirrors to aiur messages.

**Agent CLI (this track defines; T05's `gm` hosts it; T10's skills call it).** `gm chat post --job <id> --text "<one line>" [--image <png>] [--clip <mp4> --poster <png>]`; `gm checkpoint open --job <id> --question "<q>" --option <id>=<label> … [--recommend <id>] [--media <id>=<chat message id>] [--blocking]` → emits `decision.requested` through the aiur agent tools and returns the Command id; `gm checkpoint wait <decision_id>` blocks until answered and prints the option id.

**Narration render (this track; key-gated).** `POST http://127.0.0.1:<port>/internal/narration` `{ text, voice_id, format: "pcm_24000" }` → `{ wav_path, alignment: [{text,start_ms,end_ms}] }`; OGM transcodes to Opus and stores at `narration/<sha256>.{opus,json}` in the bucket (T05).

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| V1 | Voice host service (Elixir) | A supervised `voice_converse` instance with OGM ports, HMAC secret, loopback WebSocket, `transcript: :none`, privacy policy, briefing cache and internal HTTP; e2e test with `FakeProvider` | `services/voice-host/` (mix project, `lib/ogm_voice/{ports,cache,http}.ex`, `config/runtime.exs`), systemd user unit | 3 | T11 unit and env-file pattern; shared secret from T01's secrets layout | Any OGM business logic; dictation; the web UI |
| V2 | Voice client package and token route | TS client (AudioWorklet capture, PCM playback, captions, drafts) typed from `@aiur/contracts`; `POST /api/voice/token` | `packages/voice-client/src/{client,audio,captions}.ts`, `apps/api/src/voice/token.ts` | 2 | V1's URL and secret; T09 package layout | Dictation; chat UI |
| V3 | Dictation and read-aloud (zero spend) | Push-to-talk Web Speech dictation with partial/final captions and review-before-send; `speechSynthesis` read-aloud with sentence highlighting; reuses the `transcript` frame shape | `packages/voice-client/src/{dictation,speak}.ts` | 2 | None | Server STT; narration cache |
| V4 | Build chat backend | Message store, media upload to the bucket, SSE stream, creator text → aiur messages, aiur progress and lifecycle events → system rows | `apps/api/src/build-chat/{routes,store,media,aiur-bridge}.ts`, migration | 3 | T01 jobs and auth; T02 aiur client and event receiver; T05 bucket client | Checkpoint logic; the panel |
| V5 | Build chat panel | Replaces the prototype tracker: text, dictate and two-way modes, media cards, progress rows, phone layout | `apps/web/src/build-chat/*` | 3 | V2, V3, V4; T09 shell | Admin views; the editor |
| V6 | `gm chat post` and `gm checkpoint` | Agents post stills and clips and open checkpoints from inside a build; design skill step 4 names the command | `packages/gm-cli/src/commands/{chat,checkpoint}.ts`; `.claude/skills/gm-design-loop/SKILL.md` (T10 edits) | 3 | T05 `gm` CLI skeleton; V4 API; T02's way to emit `decision.requested` from a worker | Deciding which milestones to post (skill text, T10) |
| V7 | Direction checkpoints bridge | Open aiur Commands for a job become checkpoint cards with candidate media; answers go to `/decide`; notification; non-blocking by default, blocking when the agent asks | `apps/api/src/checkpoints/{poller,decide}.ts`, `apps/web/src/build-chat/checkpoint-card.tsx` | 3 | V4, V6; T02 decisions polling or feed | Heuristics for which decisions deserve one (T10 skill); candidate rendering (gm-verify) |
| V8 | Budget-aware voice agent | Budget section and `extra` block in the briefing; conversation rules role file (trim, split, queue, ask an admin; quiet when it fits); confirmed drafts route to admission with `now|at_reset`; mid-build overrun announcement | `services/voice-host/lib/ogm_voice/ports/briefing_source.ex`, `services/voice-host/roles/creator.md`, `apps/api/src/voice/briefing-push.ts`, `apps/api/src/voice/instruct.ts` | 3 | V1; T01 budgets, estimates and admission API | The estimate model itself (T01); upstream host-tool port |
| V9 | Narration pipeline (key-gated) | `render_to_file` behind the host's internal HTTP; OGM job renders dialogue lines once by content hash to the bucket; SDK `SpokenText` player with word or sentence highlighting | `services/voice-host/lib/ogm_voice/http/narration.ex`, `apps/api/src/narration/*`, `packages/sdk/src/audio/spoken-text.ts` | 3 | V1; T05 bucket; upstream `render_speech` adapter; a provider key | Live voice; captions (V3) |

## 6. Risks and unknowns

- **No provider key, so two-way voice cannot be exercised for real.** Default: build V1–V2 and V8 against `FakeProvider`; keep ElevenLabs Agents first in `preference`; the day Kevin adds `ELEVENLABS_API_KEY` the same config goes live (operator steps: create the Agent, enable the four client tools and prompt override per `configuration-voice.md`). [V]
- **Text scope chat needs a model (E06-17).** Default: the scope conversation is an aiur "scope" ticket; the voice session targets it when a key exists. Decision for T02/T09.
- **Browser Web Speech privacy and Safari behaviour (E06-11).** Default for adults: allowed, with a one-line notice in settings; test `webkitSpeechRecognition` on a real iPhone before the 5:30 checkpoint claims dictation works there. Kevin's call [O].
- **`transcript: :none` skips provider cleanup (E06-4).** Default: no-transcript plus `record_voice: false`; file upstream; revisit when fixed.
- **No host tool port (E06-8).** Default: briefing-carried budget facts and prose estimates; file upstream "host tool port"; `estimate_change` as a real tool is post-V1 unless upstream lands early.
- **Port deadlines 50–300 ms (E06-9).** Default: the host never calls the backend inside a port; a push-updated cache with `observed_at` so stale data renders as stale, not idle.
- **`max_sessions: 1` per instance.** Default: set to T01's creator concurrency; per-creator minutes metered in OGM.
- **Decision events may not be in the outbound webhook allowlist (E06-15).** Default: poll `GET /api/v1/decisions` every 5 s for jobs with running tickets; T02 confirms or finds the feed topic.
- **Checkpoint cost (E06-16).** Default: ≤3 per creation build, ≤1 per feature build, candidates from lineups, presets and ≤10 s clips of existing scaffolds; agent rebuilds as candidates are off in V1.
- **Elixir dependency fetch is a network step** (`mix deps.get` for mint, jason, telemetry, websock_adapter, bandit). Default: one-time, run by Kevin or with his go-ahead via `remind`; check whether `aiur/src/deps` already holds matching versions before fetching [I].
- **Upstream pinning.** `voice_converse` has no tags on main (`version: "0.1.0"`); the decision log wants "git dep pinned to tags". Default: pin the commit `0f692a45b` and ask the aiur agent in Khala to tag.

## 7. Self-hosting notes

Checked read-only on this host (2026-10-31): Node `v24.14.0`; `mise` installs Erlang `28.5` and Elixir `1.19.5-otp-28` (aiur's `mise.toml` pins), so the Elixir voice host compiles here with `mise exec`; the package has never been built standalone here (no `packages/elixir/voice_converse/_build`); `ffmpeg` at `/usr/bin/ffmpeg` and `chromium` at `/usr/bin/chromium` for clips and captures; `aiur` at `/home/orangekid/.local/bin/aiur`; `codex` and `claude` CLIs present; `systemctl --user is-system-running` → `running`; 12 cores, 31 GB RAM (13 GB used). `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` are all unset in the session environment [M].

Changes versus the Railway plan: the voice host is a systemd user unit (`ogm-voice-host.service`, pattern `scripts/drive-sync/ogm-drive-sync.service`) binding `127.0.0.1:40400`; T11's reverse proxy terminates TLS and forwards `/voice` as `wss://` (the microphone needs a secure context; the Netlify app origin is already HTTPS, and the voice socket must be same-site-allowed by CORS/`Origin` checks on the proxy since the host does none). The HMAC secret and any future provider key live in the unit's `EnvironmentFile` (0600), never in the repo. The Elixir host's internal HTTP (briefing push, instruct callbacks, narration) is loopback only and shared-secret authenticated. ElevenLabs/OpenAI egress is the only outbound traffic from the voice host; the sandbox egress allowlist (T03) does not apply to it because it runs as a service, not inside an agent job. The narration cache writes to the local S3-compatible bucket (T05/T11 choice); captions and `speechSynthesis` need nothing server-side.
