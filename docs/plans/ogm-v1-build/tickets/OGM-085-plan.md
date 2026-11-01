# OGM-085 — Voice host service (Elixir): implementation plan

## 1. Problem frame

Two-way creation voice is `voice_converse`, an Elixir package in aiur. OGM needs a thin host that supervises one instance, exposes its loopback WebSocket behind OGM's own HMAC tokens, feeds its ports from a cache the API pushes (ports have 50–300 ms deadlines), delivers confirmed drafts to the API, and runs end to end against the package's `FakeProvider` so nothing waits for a key. The API side mints the token in TypeScript with the same 20-line format.

Requirements trace: **R21** (two-way voice behind a capability flag when a provider is configured; nothing in V1 requires a paid provider) → the host boots with `fake`, is e2e-tested, and flips to a real adapter by env.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/lib/aiur/voice_converse/host/config.ex` — `VoiceConverse.Config.new(…)` with ports, `allowed_tools`, limits; copy field for field, swapping `transcript_root` for `transcript: :none`.
- `/home/orangekid/github/aiur/src/lib/aiur/voice_converse/host/agent_channel.ex` (+ `delivery_observer.ex`) — async `instruct/4` returning a ref, receipts delivered to the subscribing session; copy the shape, replace Listener with an HTTP POST.
- `/home/orangekid/github/aiur/src/lib/aiur/voice_converse/host/briefing_source.ex` — `brief/1` building a `%Briefing{}` with `field(value, observed_at)`; copy, read from ETS instead of `StatusReport`.
- `/home/orangekid/github/aiur/src/lib/aiur/voice_converse/host/command_source.ex` — read-only Commands, `answer/4` unsupported; copy.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/test/voice_converse/transport/websock_test.exs` lines 170–205 (`start_session!`, `propose_instruction`) — the FakeProvider session recipe for the e2e test.
- `/home/orangekid/github/aiur/packages/elixir/voice_converse/lib/voice_converse/token_issuer/hmac.ex` — the token format the TS minter reproduces (`vct1`, base64url, HMAC-SHA256, `{scope, sub, exp, nonce}`).
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/ogm-drive-sync.service` — unit hardening lines.
- `/home/orangekid/github/aiur/mise.toml` — the exact erlang/elixir pins.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint` (the Elixir service exposes the same four as `mix` aliases and a `package.json` with scripts that call `mise exec -- mix …` so `pnpm -r test` can skip it when `mise` is absent); Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (`bandit` 1.9k, `websock_adapter` is the Phoenix-maintained adapter: exception named, it is the package's own optional dep); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1. Mix project, pin and toolchain

Goal: `mix test` runs on this host with no network.
Files:
- Create `services/voice-host/mix.exs`, `mix.lock`, `mise.toml`, `.formatter.exs`, `config/config.exs`, `config/runtime.exs`, `package.json` (scripts only), `README.md`.
Approach: `deps: [{:voice_converse, git: System.get_env("OGM_AIUR_GIT", "https://github.com/its-everdred/aiur.git"), sparse: "packages/elixir/voice_converse", ref: "0f692a45b04bb4ce3e7d8256e134028894bd128b"}, {:bandit, "~> 1.12"}, {:websock_adapter, "~> 0.6"}, {:plug, "~> 1.16"}, {:jason, "~> 1.4"}]`; copy the lock entries from the package's `mix.lock` so `HEX_OFFLINE=1 mix deps.get` resolves from `~/.hex/packages/hexpm`; `mise.toml` with `erlang = "28.5"`, `elixir = "1.19.5-otp-28"`; `runtime.exs` reads env names and validates presence (never values) → `OgmVoice.Config`. Release: `mix release ogm_voice` (prod), `ExecStart` runs `_build/prod/rel/ogm_voice/bin/ogm_voice start`.
Interface sketch: `OGM_AIUR_GIT=/home/orangekid/github/aiur HEX_OFFLINE=1 mise exec -C services/voice-host -- mix deps.get`.
Test scenarios:
- Given the local checkout at the pin, when `mix deps.get` offline, then it succeeds and `deps/voice_converse/lib/voice_converse/wire.ex` exists.
- Given `OGM_VOICE_TOKEN_SECRET` of 10 bytes, when the app boots, then it exits naming the variable.

### U2. Config and supervision

Goal: one supervised instance plus the transport and the internal HTTP.
Files:
- Create `lib/ogm_voice/application.ex`, `lib/ogm_voice/config.ex`.
- Test `test/ogm_voice/config_test.exs`.
Approach: `OgmVoice.Config.build(env)` → `VoiceConverse.Config.new(name: OgmVoice.Instance, provider: provider(env), credentials: OgmVoice.Ports.Credentials, credential_names: %{elevenlabs: "ELEVENLABS_API_KEY", openai: "OPENAI_API_KEY"}, briefing_source: OgmVoice.Ports.BriefingSource, agent_channel: OgmVoice.Ports.AgentChannel, command_source: OgmVoice.Ports.CommandSource, token_issuer: OgmVoice.TokenIssuer, transcript: :none, llm: env.llm, cloud_disclosure_accepted: true, limits: %{max_sessions: env.max_sessions, briefing_token_budget: 2_500}, privacy: %{provider_allowlist: [...], required_provider_options: %{elevenlabs_agents: %{record_voice: false}}}, allowed_tools: [...])` where `provider("fake")` = `{VoiceConverse.Testing.FakeProvider, []}`, `"elevenlabs_agents"` = `VoiceConverse.Providers.ElevenLabsAgents` resolved through `VoiceConverse.Providers.resolve/1`, `"openai_realtime"` likewise (refresh module names against the pin: `lib/voice_converse/providers/{eleven_labs_agents,openai_realtime}.ex`). Children: `[{OgmVoice.Cache, []}, VoiceConverse.child_spec(config), {VoiceConverse.Transport.WebSock, instance: OgmVoice.Instance, token_issuer: OgmVoice.TokenIssuer, ip: {127,0,0,1}, port: env.port}, {Bandit, plug: OgmVoice.HTTP.Router, ip: {127,0,0,1}, port: env.internal_port}, {OgmVoice.Delivery, api_url: env.api_internal_url, secret: env.internal_secret}]`. `OgmVoice.TokenIssuer` calls `Hmac.put_secret(OgmVoice.Instance, fn -> System.fetch_env!("OGM_VOICE_TOKEN_SECRET") end)` at boot and delegates `issue/2`, `verify/3` with `instance: OgmVoice.Instance`.
Test scenarios:
- Given `OGM_VOICE_PROVIDER=fake`, then `VoiceConverse.availability(config) == :ok`.
- Given `transcript: :none`, then `Config.new` succeeds with no `transcript_root`.
- Given an unknown provider name, then boot fails naming it.

### U3. Briefing cache and internal HTTP

Goal: the API pushes, ports read within deadlines.
Files:
- Create `lib/ogm_voice/cache.ex`, `lib/ogm_voice/http/{router,briefing,health}.ex`.
- Test `test/ogm_voice/briefing_cache_test.exs`, `test/ogm_voice/http_test.exs`.
Approach: `OgmVoice.Cache` owns an ETS table `:ogm_voice_briefings` keyed by `target_key` → `%{briefing: %VoiceConverse.Briefing{}, sections: %{id => text}, commands: [...], describe: %{id, kind, title}, observed_at}`; `put(push_map)` validates the body (required `target_key`; strings; lists) and builds `%Briefing{summary: field(..), current_task: field(..), next_steps: field(..), waiting_on: field(..), questions: field(..), extra: [...]}` with `observed_at` now and `max_age_s: 60`; `get(target_key)`. Router (Plug): `post "/internal/briefing"` → secret header check (constant-time compare) → `Cache.put` → 204; `get "/healthz"` → `%{ok: true, service: "voice-host", provider: env.provider, sessions: n, version: git sha}`; everything else 404; body limit 256 KiB.
Interface sketch: `OgmVoice.Cache.put(map) :: :ok | {:error, term}`; `OgmVoice.Cache.get(key) :: {:ok, entry} | :error`.
Test scenarios:
- Given a push for `build:j1`, when `BriefingSource.brief(%{"kind"=>"build","job_id"=>"j1"})` through `Ports.call_port(…, :brief)`, then `{:ok, %Briefing{}}` with the summary.
- Given no push, then `{:error, :unavailable}`.
- Given a wrong `X-OGM-Internal`, then 401 and nothing stored.
- Given a 300 KiB body, then 413.

### U4. Ports

Goal: the four port modules and the token issuer.
Files:
- Create `lib/ogm_voice/ports/{credentials,briefing_source,agent_channel,command_source}.ex`, `lib/ogm_voice/token_issuer.ex`, `lib/ogm_voice/delivery.ex`.
- Test `test/ogm_voice/ports_test.exs`.
Approach: `Credentials.fetch(:fake, _)` → `{:ok, "fake"}` (`:probe` → `{:ok, :present}`); `fetch(:elevenlabs_agents | :elevenlabs, p)` → `System.get_env("ELEVENLABS_API_KEY")` at call time or `{:error, :missing}`; same for `:openai_realtime | :openai`. `BriefingSource.describe_target(target)` → from the `start` frame's map: `%{id: key, kind: :scope | :build, title: "Scope for <game_id>" | "Build <job_id>"}`; `brief/1` → cache; `details(target, section, _)` → cache sections or `{:error, :unavailable}`; `sections/1` → `[%{id: "budget", description: "Today's allowance and what fits"}, %{id: "progress", description: "What the builder is doing"}]`; `subscribe/2` → `:unsupported`; `alive?/1` → `:unknown` unless the cache says so. `AgentChannel.capabilities/1` → `%{fork: :none, ask: false, instruct: true}`; `instruct(target, text, key, _)` → `OgmVoice.Delivery.enqueue({target, text, key, :instruct}, subscriber: self())` → `{:ok, ref}`; `Delivery` (GenServer) POSTs `{target, text, idempotency_key, kind}` with the secret header to `<api_internal_url>/internal/voice/instruct` using `Mint` (already a dep) with a 5 s timeout, then sends `{:receipt, ref, :delivered | :failed}` to the subscriber (shape per `VoiceConverse.Ports.AgentChannel` moduledoc); `ask/4` → `{:error, :unsupported}`; `fork_query/3` → `{:error, :unsupported}`. `CommandSource.open/1` → cache commands (empty list when none pushed); `answer/4` → `{:error, :unsupported}`.
Test scenarios:
- Given `instruct/4`, then it returns within 300 ms under `Ports.call_port` even when the API stub sleeps 2 s (async).
- Given the stub returns 200, then `{:receipt, ref, :delivered}`; given 500, `:failed`.
- Given `Credentials.fetch(:elevenlabs_agents, :connect)` with no env, then `{:error, :missing}` and nothing logged.

### U5. Token minting in the API and cross-language vectors

Goal: TS mints what Elixir verifies.
Files:
- Create `packages/contracts/src/voice.ts` (+ barrel line), `services/api/src/voice/token.ts`, `services/api/src/voice/mint.ts`, `services/api/src/voice/__tests__/token.test.ts`; the test writes `services/voice-host/test/fixtures/token_vectors.json`; Elixir test `test/ogm_voice/token_test.exs`.
Approach: `mint({ secret, sub, ttlS = 300, now })`: `payload = base64url(JSON.stringify({ scope: "converse", sub, exp: unix(now)+ttlS, nonce: base64url(randomBytes(12)) }))`, `body = "vct1." + payload`, `token = body + "." + base64url(hmac("sha256", secret, body))` using `node:crypto`; route `POST /api/v1/voice/token` validates `VoiceTarget` (Zod), `authorize(actor, "game.edit", { gameId: target.game_id, ownerId })`, mints with `sub = actor.userId`, responds `{ token, expires_at, url: config.OGM_VOICE_WS_URL }`. The TS test mints with the fixed secret `"ogm-test-secret-0123456789abcdef0123"` (36 bytes) at a fixed `now` and writes vectors `{ token, sub, exp, expect: "ok" | "expired" | "invalid" }` (one valid, one expired, one with a flipped MAC byte); the Elixir test installs the same secret via `Hmac.put_secret/2` and verifies each with `now:` injected.
Interface sketch:
```ts
export const VoiceTarget = z.discriminatedUnion("kind", [ z.object({ kind: z.literal("scope"), game_id: z.string(), session_id: z.string(), creator_id: z.string() }), z.object({ kind: z.literal("build"), game_id: z.string(), job_id: z.string(), ticket: z.string(), creator_id: z.string() }) ]);
export const VoiceTokenResponse = z.object({ token: z.string().startsWith("vct1."), expires_at: z.string().datetime(), url: z.string().url() });
export const BriefingPush = z.object({ target_key: z.string(), summary: z.string().optional(), current_task: z.string().optional(), next_steps: z.array(z.string()).default([]), waiting_on: z.string().optional(), questions: z.array(z.string()).default([]), extra: z.array(z.object({ title: z.string(), text: z.string() })).default([]), sections: z.array(z.object({ id: z.string(), text: z.string() })).default([]), observed_at: z.string().datetime() });
export const InstructRequest = z.object({ target: VoiceTarget, text: z.string().min(1).max(4000), idempotency_key: z.string(), kind: z.enum(["instruct", "ask"]) });
```
Test scenarios:
- Given a creator session and their game, then 200 with a `vct1.` token whose payload `sub` is the creator and `exp - now ≤ 300`.
- Given another family member, then 403.
- Elixir: each vector verifies as expected; `:wrong_scope` for a token minted with scope `"other"`.
Execution note: generate the vectors first (TS), then write the Elixir test against the file; keep the fixture checked in so `mix test` needs no pnpm.

### U6. E2E with FakeProvider

Goal: the whole path with no key.
Files:
- Create `test/ogm_voice/e2e_fake_provider_test.exs`, `test/support/api_stub.ex` (Bandit on a random loopback port recording `/internal/voice/instruct` bodies).
Approach: `start_supervised!` the application children with `provider: fake`, random ports; mint a token with `OgmVoice.TokenIssuer.issue("converse", subject: "u1")`; connect with `Mint.WebSocket` to `ws://127.0.0.1:<port>/?token=…`; send `{"v":1,"type":"start","target":{"kind":"build","game_id":"g1","job_id":"j1","ticket":"142","creator_id":"u1"}}`; assert `state` frames `connecting` then `listening`; look up the session (`SessionRegistry.lookup(OgmVoice.Instance, id)`) and `FakeProvider.emit(ref, %Events.AgentText{…})` → assert an `agent_text` frame; emit `%Events.ToolCall{name: "propose_instruction", params: %{"text" => "make the door red"}}` → `draft` frame; send `confirm_draft` → the stub records one POST with `text: "make the door red"`, `kind: "instruct"` and the draft id as `idempotency_key` → `delivery{status: "delivered"}` frame; `end` → `ended`. Second test: `?token=bad` → close code `4401`. Third: `text` frame → `error{code:"unsupported_frame"}` (documents E06-7).
Test scenarios:
- as above.

### U7. Unit file and ops notes

Goal: a user unit that follows the house pattern.
Files:
- Create `services/voice-host/ops/ogm-voice-host.service`, `services/voice-host/ops/README.md`, `services/voice-host/.env.example` (names only).
Approach: `[Service] Type=simple`, `Slice=ogm.slice`, `EnvironmentFile=%h/.config/ogm/env/ogm-voice-host.env`, `ExecStart=%h/.local/bin/mise exec -C %h/games/open-game-maker-2000/services/voice-host -- _build/prod/rel/ogm_voice/bin/ogm_voice start`, `Restart=on-failure`, `RestartSec=10`, `UMask=0077`, `NoNewPrivileges=yes`, `WantedBy=default.target`. README: build the release, install the unit, the ingress line for OGM-006 (`tailscale serve --bg --https=8443 --set-path /ws/voice http://127.0.0.1:40400`), the env names, and the ElevenLabs operator steps (Agent creation, four client tools) for the day a key exists.

## 4. Verification

```
OGM_AIUR_GIT=/home/orangekid/github/aiur HEX_OFFLINE=1 mise exec -C services/voice-host -- mix deps.get
mise exec -C services/voice-host -- mix test
pnpm --filter @ogm/api test -- voice
pnpm --filter @ogm/contracts test
pnpm -r typecheck && pnpm -r lint
curl -s http://127.0.0.1:40401/healthz        # after systemctl --user start ogm-voice-host
```
Paste into `## Local tests`: the `mix test` summary (tests, failures, seed), the pin sha from `deps/voice_converse` (`git -C deps/voice_converse rev-parse HEAD`), the TS counts, and the `/healthz` body.

## 5. Deferred to implementation

- Internal HTTP library: default Plug on Bandit (already deps); no Phoenix.
- Where `OgmVoice.Delivery` gets the API URL: default `OGM_API_INTERNAL_URL` (`http://127.0.0.1:<OGM_API_PORT>`), added to `packages/config` names.
- `max_sessions`: default 2 (T01 creator concurrency; any positive integer validates).
- Release vs `mix run`: default a release for the unit; `mix run --no-halt` for development.

## 6. Scope boundaries

- Client (OGM-083); budget section, role text, API-side pusher, instruct routing (OGM-086); narration route (OGM-087); scope ticket (OGM-088); ingress mapping (OGM-006); slices/env layout (OGM-002/003); capability flag UI (OGM-079).

## 7. Risks

- `HEX_OFFLINE` resolution fails for one transitive dep → GATE-MIX-DEPS: ask Kevin, one-time `mix deps.get` with network.
- Private aiur repo on GitHub runners → default: Elixir tests are host-run; CI runs TS only; documented in the PR.
- `websock_adapter`/`bandit` version drift versus the package's optional constraints (`~> 0.6`, `~> 1.12`) → default: lock to the package's `mix.lock` versions (0.6.0, 1.12.5).
- The aiur checkout at `/home/orangekid/github/aiur` moves past the pin (aiurdev pulls) → the git dep with `ref:` still checks out the pinned commit from the local repo's object store; nothing else depends on the checkout's HEAD.
- `Config.roles` unread at the pin → role text travels in the briefing (OGM-086); file an upstream note.
