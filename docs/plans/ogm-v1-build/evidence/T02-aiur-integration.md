# T02 aiur-integration: evidence packet

Researched against OGM `9508c1c` and aiur `main` `0f692a45b` (2026-10-31, "Add opt-in idle burst capture (#7341)"). aiur paths are relative to `/home/orangekid/github/aiur/`. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

How the OGM backend (Node/TypeScript, this machine) drives aiur daemons running on this machine: filing work, reading progress/phase/usage, events, cancel, per-ticket spend caps, daemon topology for many creator repos, credential profiles, skill injection, and the Executor/merge flow. Each B8 §4 gap is re-marked against current `main`; the HTTP surface is listed route by route.

## 2. Evidence packets

### E02-1: Six of the nine B8 upstream gaps are now covered on aiur main; two remain gaps; one is partial
- Claim / current behavior: B8 §4 (written at `46bda0020`) listed 9 gaps. On `0f692a45b`: (1) per-ticket usage read **covered**, (2) per-ticket spend cap **covered**, (3) progress/phase read **covered**, (4) outbound webhook **covered** (with an HTTPS constraint, E02-6), (5) confirmed cancel **covered**, (6) job-create API **gap**, (7) per-ticket skill injection **gap**, (8) per-tenant concurrency **partial** (`instance.owns` label rules, no semaphore), (9) versioned schemas **partial** (new routes carry `contract`/`contract_version`; `/api/v1/:issue` entries do not).
- Source and exact locus: `src/lib/aiur_web/router.ex:158-191`; `src/lib/aiur_web/routes/{api,usage}.ex`; `src/lib/aiur_web/api/usage_progress_routes.ex`; `src/lib/aiur/events/outbound/event.ex:40-50`; `src/lib/aiur/control_call/allowlist.ex:179-180`; `src/lib/aiur/agent_skills.ex:43`.
- Why it matters: B8 §3 and decision D4 ("work around for V1 with a sidecar and a watchdog") are superseded for gaps 1–5; no sidecar or outside watchdog is needed.
- Confidence and freshness: [V] as of `0f692a45b`.
- Contradiction or open question: contradicts B8 §2.2 ("no tokens, cost, percent"), §2.4 ("no HTTP read path"), §4 and A6 §9 step 3 (watchdog). D4's "file upstream later" is moot for 1–5.
- Suggested requirement/decision impact: delete the ledger-sidecar and watchdog requirements; OGM consumes the routes in E02-2.

### E02-2: The aiur HTTP API surface OGM would call (all under one daemon's `/api/v1`)
- Claim / current behavior: routes, in router order:
  - `POST /api/v1/github/webhook` (HMAC, GitHub deliveries) [`routes/github_webhook.ex`]
  - `POST /api/v1/executor/hook`, `/executor/hook/deliver` (Executor session hooks; not for OGM)
  - `GET /healthz`, `GET /readyz`
  - Decisions (supervisor bearer): `GET /api/v1/decisions`, `GET /api/v1/decisions/:id`, `POST /api/v1/decisions/:id/{enrich,decide,revise}` [`routes/decisions.ex`]
  - `POST /api/v1/control` (control token; literal allowlisted calls incl. `todo(["142"], only: true)`, `pause`, `resume`, `message`, `queue …`) [`routes/control.ex`, `control_call/allowlist.ex:179-199`]
  - Agent writes (client token write + `api_write` + writable): `POST /api/v1/refresh`, `POST /api/v1/:issue/cancel`, `/listen-mode`, `/messages`, `/pause`, `/resume` [`routes/api.ex:5-25`]
  - Machine writes: `/api/v1/pane/{interrupt,hide}`, `/api/v1/:issue/claude-hook` (TUI/RC; not for OGM)
  - `POST /api/v1/events/token` (WebSocket feed token) [`routes/events.ex`]
  - `GET /api/v1/capabilities`
  - `PUT|GET|DELETE /api/v1/:issue/spend-cap`, `GET /api/v1/:issue/usage` [`routes/usage.ex`]
  - `GET /api/v1/:issue/progress` [`api/usage_progress_routes.ex`]
  - `GET /api/v1/usage`, `/api/v1/usage/:provider`, `/api/v1/usage/accounts` [`router.ex:171-179`]
  - `GET /api/v1/conversations/{resolve,:id/entries,:id/sessions,:id/anchors}`
  - Reads: `GET /api/v1/events`, `/api/v1/events/catalog`, `/api/v1/state`, `/api/v1/:issue`, `/api/v1/:issue/events` (transcript, limit ≤50, cursor) [`routes/api.ex:45-66`]
- Source and exact locus: `src/lib/aiur_web/router.ex:117-191` and the route modules above.
- Why it matters: this is the whole contract OGM's `aiur-client` package wraps; nothing else exists (no SDK, no job-create route).
- Confidence and freshness: [V] as of `0f692a45b`.
- Contradiction or open question: none.
- Suggested requirement/decision impact: the client package (ticket C1) covers exactly this list; `/state` and `/:issue` need hand-written zod schemas.

### E02-3: Authentication: bearer client tokens for reads/writes; writes also need Origin and `X-Aiur-Request: 1`; decisions use a separate supervisor token
- Claim / current behavior: `/api/v1/*` accepts `Authorization: Bearer aiur_…` from `aiur token create <name> --scope read|write` (SHA-256 hash stored in `client-tokens.json` under the decision state dir); Basic auth (`AIUR_DASHBOARD_USERNAME/PASSWORD`) is a fallback that is refused on a public bind. Write routes additionally require `Origin` (or `Referer`) equal to the endpoint origin or a loopback origin, the header `X-Aiur-Request: 1`, and `observability.dashboard_writable: true` (default). Decision routes need `AIUR_SUPERVISOR_TOKEN` (≥32 bytes) and `decisions.supervisor_allowed_kinds`.
- Source and exact locus: `src/lib/aiur_web/client_token_auth.ex:104-169`; `src/lib/aiur/client_tokens.ex:180-195`; `router.ex:88-118, 240-284`; `website/docs-app/reference/configuration-daemon.md:297-321`; `cli-launch.md:38-40`.
- Why it matters: a server-to-server caller must set `Origin: http://127.0.0.1:<port>` (loopback is allowed) on every POST/PUT/DELETE or get 403 "origin not allowed".
- Confidence and freshness: [V].
- Contradiction or open question: A6 §14 says "Basic-auth `/api/v1/*`"; bearer tokens are the current way.
- Suggested requirement/decision impact: OGM mints one write token per daemon at provisioning (ticket C5) and stores it in the daemon's env file; the client always sends Origin + custom header.

### E02-4: Per-ticket spend cap is enforced inside aiur and ends in `agent:budget-exhausted`
- Claim / current behavior: `PUT /api/v1/:issue/spend-cap {"amount":"12.50","currency":"USD"}` stores a cap keyed by repository-qualified tracker identity. `SpendCap.Evaluation.refresh/3` compares the ledger's `api_equivalent_estimate.rollup["USD"]` with the cap; at or above it, `SpendCap.Stop` terminates the running agent (`AgentTeardown.terminate_running_issue(..., :budget_exhausted)`), emits `ticket.N.usage.spend_cap_reached`, and transitions the tracker to the `budget-exhausted` state label. `DispatchPolicy.SpendCap` skips dispatch for exhausted or `unavailable` caps (fail closed when the ledger is unavailable). An exhausted cap cannot be edited (409 `spend_cap_exhausted`).
- Source and exact locus: `src/lib/aiur_web/api/usage/ticket_spend_cap.ex:27-34,49-64`; `src/lib/aiur/orchestrator/spend_cap/{evaluation.ex:13-45,stop.ex:16-29}`; `src/lib/aiur/orchestrator/dispatch_policy/spend_cap.ex`; `src/lib/aiur/github/state_labels.ex:6`; `src/lib/aiur_web/api/spend_cap_controller.ex:43-52`.
- Why it matters: B8 §5's "at the hard cap apply `agent:cancelled`" becomes "set the cap at filing time"; OGM only reconciles.
- Confidence and freshness: [V].
- Contradiction or open question: the cap reads the USD *API-equivalent* rollup. Subscription-backed Codex/Claude runs (assumption A9) are priced as estimates; whether coverage is `complete` for those routes (so the cap trips) is unverified [I]. The ticket must exist in the daemon's configured repo before `PUT` (404 `ticket_not_found`), so the cap is set after filing, before `agent:todo` is applied.
- Suggested requirement/decision impact: requirement "every filed ticket carries a spend cap = reservation"; spike S1 verifies the cap trips on a subscription route with the `fake`/memory setup, then one real Codex run.

### E02-5: Usage and progress reads are versioned contracts with exact-decimal money
- Claim / current behavior: `GET /:issue/usage` → `{contract:"aiur.ticket_usage", contract_version:1, schema_version:1, ticket:{owner,repository,identifier}, currency:"USD", state, authority, freshness, totals:{tokens, provider_reported:{USD:"…"}, api_equivalent:{amount:{USD:"…"}, coverage:{status,known,unknown,reasons}}}, by_model[], by_provider[], sessions[]{run_id,…}}`; 404 `usage_not_found` / `usage_unresolvable` (compacted), 503 `usage_unavailable`. `GET /:issue/progress?limit=` → `{contract:"aiur.ticket_progress", contract_version:1, issue_identifier, repository, phase (brainstorm|plan|work|review), progress (percent via ProgressRenderer, or status "unknown"), events[] {type: progress|checkin|phase_progress|phase, phase, transition, at}, sources:{activity}, generated_at}`. `GET /usage/accounts` → `{contract:"aiur.usage.accounts", contract_version:1, accounts[]{name,harness,weekly_percent,five_hour_percent,remaining_percent,freshness,…}}` (API-key rows say `usage_unavailable`).
- Source and exact locus: `src/lib/aiur_web/api/usage/ticket_usage.ex:234-301`; `src/lib/aiur_web/api/usage_progress.ex:56-66`; `api/usage_progress/history.ex:320-345`; `controllers/usage_accounts_api_controller.ex:14-33`.
- Why it matters: OGM's ledger rows and "waiting for robot capacity" view can be joined by issue number + run_id without reading ledger files.
- Confidence and freshness: [V].
- Contradiction or open question: progress is the agent's own 10%-step self-estimate at phase boundaries (`src/prompts/shared-agent-instructions.md:260-310`), as B8 said; ETA is still OGM's.
- Suggested requirement/decision impact: OGM stores `run_id` from `sessions[]` as the aiur run id for build analytics (T01 joins game-activity events to it).

### E02-6: Outbound events exist as a signed Standard-Webhooks POST, but only to an HTTPS, non-private URL unless opted in; a pull feed and a WebSocket feed cover loopback
- Claim / current behavior: `events.export.enabled: true` starts a journal; `events.export.webhook_url` adds delivery with headers `webhook-id` (`<instance>/<id>`), `webhook-timestamp`, `webhook-signature` (HMAC-SHA256 base64 over `id.timestamp.body`, key `AIUR_OUTBOUND_WEBHOOK_SECRET`). Exported topics: `ticket.N.lifecycle.changed` (lifecycle ∈ queued|retrying|allocated|running|paused|waiting|replaced|completed|cancelled), `ticket.N.usage.changed`, `ticket.N.usage.spend_cap_reached`, `ticket.N.cancel.result`, `ticket.N.agent.progress[.checkin|.phase]`. The URL must be `https://`; loopback/private addresses need `allow_private_destinations: true`. Pull: `GET /api/v1/events?after=&limit=&patterns=`; push over loopback: `POST /api/v1/events/token` then Phoenix channel `events:feed` on `EventsSocket` (heartbeats every 25 s, replays from `after`).
- Source and exact locus: `src/lib/aiur/events/outbound/{event.ex:40-50,webhook.ex:58-85,145-148}`; `src/lib/aiur/config/webhook_destination.ex:9-22,60-68`; `src/lib/aiur/events/catalog/ticket_entries.ex:167-205`; `controllers/events_controller.ex`; `events_channel.ex:8-20`; `configuration-daemon.md:189-207`.
- Why it matters: with a daemon and backend on one host and no TLS between them, the webhook path needs a local TLS endpoint (T11's Caddy) or OGM uses the pull/WebSocket feed.
- Confidence and freshness: [V].
- Contradiction or open question: B8 §4 gap 4 is closed, but the HTTPS rule is a self-hosting friction. Decision needed (see §6, R2).
- Suggested requirement/decision impact: default [O]: the backend subscribes to `events:feed` per daemon over loopback with a bearer-issued token, and keeps GitHub webhooks for PR/CI facts; move to the signed webhook once T11 terminates TLS locally.

### E02-7: Cancel is an API call that confirms the process exited and marks the ticket cancelled
- Claim / current behavior: `POST /api/v1/:issue/cancel` → 200 `{process:{status:"exited"},…}` or 409 with `still_running|kill_failed|generation_changed`; 409 `agent_not_running`; 503 `cancel_failed` when the tracker label write fails. It also emits `ticket.N.cancel.result` with `tracker_state: cancelled`.
- Source and exact locus: `controllers/ticket_cancel_api_controller.ex:10-48`; `src/lib/aiur/orchestrator/cancellation.ex:19-31`; `ticket_entries.ex:195-205`.
- Why it matters: replaces B8's "apply `agent:cancelled` and wait a poll".
- Confidence and freshness: [V].
- Contradiction or open question: B8 §2.2 "no cancel endpoint" is stale.
- Suggested requirement/decision impact: OGM "stop this build" = cancel route, then verify `process.status == exited`, else retry/alert.

### E02-8: There is still no job-create API; filing is a GitHub issue plus `agent:todo`, and `control todo` collapses the idle poll backoff
- Claim / current behavior: no route creates issues. `Aiur.GitHub.IssueCreation` exists but is internal (experiment analysis and main-watch fixers). Dispatch needs `agent:todo` applied by an allowed actor (`tracker.github.allowed_users`, CODEOWNERS fallback). After filing, `POST /api/v1/control {"contract":"aiur.control.call","contract_version":1,"expression":"todo([\"142\"], only: true)","max_scope":"write"}` triggers a prompt poll (same as `aiur --todo 142 --only`); otherwise the dispatch poll is `polling.interval_seconds` (120 default; starter 30) widened ×5 when idle.
- Source and exact locus: `src/lib/aiur/github/issue_creation.ex:5-20`; `control_call/allowlist.ex:179-180`; `controllers/control_controller.ex:14-66`; `configuration-tracker.md:15,36,55`; `cli-operations.md:270`.
- Why it matters: GitHub stays on the job bus (A6 Option A). Latency without webhooks is bounded by the nudge, not the poll.
- Confidence and freshness: [V].
- Contradiction or open question: none; matches B8.
- Suggested requirement/decision impact: intake = create issue (OGM GitHub App or commit-service token, T03) → labels (`complexity:N`, `agent:todo` last) → `PUT spend-cap` → `control todo`. Set `tracker.github.allowed_users`/`trusted_accounts` to the intake identity.

### E02-9: Skills are still a fixed compile-time bundle; a repo's own `.claude/skills` are kept but get no Codex link
- Claim / current behavior: `Aiur.AgentSkills` installs `aiur-agent aiur-debug aiur-experiment design-import` plus the pinned CE skills into `.claude/skills` (Claude), symlinks `.codex/skills/<skill> → ../../.claude/skills/<skill>` (Codex), and `.agents/skills` (Muse); it never overwrites an existing path. Only bundled skills are linked for Codex. No config or label selects skills per ticket.
- Source and exact locus: `src/lib/aiur/agent_skills.ex:43-51,124-137,222-236`; `coding_agent/providers/{claude.ex:19,codex.ex:19,muse.ex:21}`.
- Why it matters: gm-* skills (T10) must ship inside each game repo with committed `.codex/skills/gm-*` symlinks (or be written by `hooks.after_create`), and the ticket body must name them.
- Confidence and freshness: [V].
- Contradiction or open question: B8 §8 "skill exposure for Codex" is now answered: a repo-shipped skill needs its own `.codex/skills` link. Codex's turn sandbox grants write access to `.agents` for skill links but keeps `.codex` protected (`configuration-agent.md:268`) [V]; hooks run outside the sandbox so a hook may write the links [I].
- Suggested requirement/decision impact: the game-repo template (ticket C6) carries `.claude/skills/gm-*`, `.codex/skills/gm-*` links and `.agents/skills/gm-*` links committed.

### E02-10: Workspace hooks expose the ticket and branch to a per-job setup script
- Claim / current behavior: `hooks.after_create|before_run|after_run|before_remove` run with `AIUR_HOOK_TICKET_ID`, `AIUR_HOOK_TICKET_IDENTIFIER`, `AIUR_HOOK_RUNNER_PID`, `THIS_REPOSITORY_URL`, `THIS_BASE_BRANCH`, `AIUR_REPO_STATE_PATH`, and `AIUR_TICKET_BRANCH` when known; `hooks.timeout_ms` 600000. Erlang distribution env is scrubbed first.
- Source and exact locus: `src/lib/aiur/workspace/hooks.ex:95-124,357-388`; `configuration-daemon.md:111-119`.
- Why it matters: B8 §3.3's "context and diagnostics come from a hook" still works unchanged.
- Confidence and freshness: [V].
- Contradiction or open question: B8 cited `hooks.ex:286-308`; the block moved. Whether `after_create` precedes the first prompt in the warm-base path is still [I] (B8 §8).
- Suggested requirement/decision impact: `after_create` calls `GET <ogm>/internal/jobs/by-ticket/<id>/bundle` with a per-daemon secret and writes context files; the bundle never contains provider keys.

### E02-11: Hosted mode on main cannot run the subscription-backed agents V1 relies on; V1 must run `instance.mode: local`
- Claim / current behavior: `instance.mode: hosted` adds fail-closed auth checks (`HostedAuthPolicy.authorize("hosted", _, :api_key)` only) and the schema note says "Current production backends remain ineligible until #5701"; `deployment_kind: consumer` rejects `CLAUDE_CODE_OAUTH_TOKEN` and Codex subscription `auth.json`; `operator` may use subscriptions. `local` mode (default) is the trusted-environment mode with Claude `permission_mode: bypassPermissions` and Codex `thread_sandbox: workspace-write` with `networkAccess: true` in the default turn policy.
- Source and exact locus: `src/lib/aiur/config/schema/instance.ex:42-51,83-84`; `config/hosted_auth_policy.ex:11-15`; `application/startup_checks.ex:94-107,210-216`; `config/codex_sandbox_policy.ex:66-80`; `configuration-agent.md:252,267-268`.
- Why it matters: B1/B13's "separate hosted instance, API keys only" conflicts with A9 (subscriptions, no spending). On main, the only configuration that runs Codex/Claude on the subscriptions signed in here is `local` mode.
- Confidence and freshness: [V] for the config behavior; [I] that #5701 is unmerged (not searched on GitHub, no network).
- Contradiction or open question: contradicts B1 §4.3 and B13 §3 as V1 configuration. Isolation therefore comes from outside aiur (T03), not from aiur's hosted mode.
- Suggested requirement/decision impact: decision "V1 aiur daemons run `instance.mode: local`, `deployment_kind: operator`, inside the T03 sandbox boundary; hosted mode is revisited when #5701 lands".

### E02-12: One daemon still serves one repository; multi-instance coordination is per repository; many creator repos means many daemons
- Claim / current behavior: `tracker.github.repo` is one `owner/name` (auto-detected from the checkout's `origin`), so several daemons can share one `~/.aiur/config`. `AIUR_LEASE_DATABASE_URL` (TLS Postgres) coordinates several instances of the *same* repo (claims, leader lease, roster, `instance.owns`/`pool`). Multi-repository hosting is a "future disposition" in aiur's deferred findings. `~/.aiur/remote-instances.yaml` lets one controller address many daemons by name (`aiur --instance <name> …`, HTTP allowed for loopback). A second daemon on a bound port keeps running without its dashboard; `server.port: 0` picks a free port. `aiur run --container` runs headless without tmux (needs `AIUR_ERLANG_COOKIE`), suited to a systemd unit.
- Source and exact locus: `configuration-tracker.md:36`; `configuration-daemon.md:42-49,348`; `docs/build-order/deferred-findings.md:26-27`; `cli-options.md:58-75`; `cli-launch.md:41`; `src/lib/aiur/instance/{repository_leader.ex,lease_store.ex,roster.ex}`.
- Why it matters: #5938 (B13 "multi-repo hosting, V1") is not on main. Per-user game repos (decision "Repos") force a daemon per game repo, or a shard of repos per daemon is impossible.
- Confidence and freshness: [V]; "#5938 not merged" [I] from the absence of any multi-repo tracker field.
- Contradiction or open question: contradicts B13 §2 table ("multi-repo hosting #5938 V1"). Memory and CPU of N BEAM daemons is unmeasured [M pending].
- Suggested requirement/decision impact: V1 runs one daemon per *active* game repo under a systemd template unit, started on first admitted job and stopped after an idle period; cap the number of live daemons (default 4) and `agent.max_concurrent_agents` per daemon (default 1 creation + 3 edits across the fleet, so per-daemon 1–2) [O].

### E02-13: Merge stays outside aiur; `aiur pr merge` refuses Apps and agents
- Claim / current behavior: agents never self-merge (`aiur-agent` skill); `aiur pr merge` uses a stored human `gh` identity and "agents and Apps refuse"; `merge_policy.ci: wait` is the only mode; `human_mergers` is a human-only allowlist. `premerge_checks` run PR code as the operator user with token env removed but `gh` credential readable.
- Source and exact locus: `cli-operations.md:289-295`; `reference/merge-policy.md:8,20,47-50`; `.agents/skills/aiur-agent/SKILL.md:38-42`.
- Why it matters: OGM Publish (merge + tag + deploy) must be its own GitHub API call with the commit service's identity (T03), not an aiur command; aiur sees `done` when the PR merges with a closing keyword.
- Confidence and freshness: [V].
- Contradiction or open question: the Executor-review step Kevin asked for (background reviewers, Executor final say) applies to the *platform* repo build; for creators' game repos, the "reviewer" is OGM's gate [I].
- Suggested requirement/decision impact: for game repos set `human_mergers: []` and let OGM merge via its App; PR body check (`## Local tests`) is enforced by aiur's CI gate only if the game repo's CI runs `scripts/check-pr-body.py` [I]; keep game-repo CI minimal (ticket C6).

### E02-14: Provisioning a game repo for aiur is what `aiur init` does interactively, and it demands a PR workflow with a required check
- Claim / current behavior: `aiur init` writes `.aiur/config`, `.aiur/hooks`, `.aiur/prompt.md`, `.aiur/alerts`, creates `agent:*`, complexity, model, pause/watch and RC labels, verifies the base branch, a pull-request workflow targeting it, and branch protection or a ruleset requiring a check; a gap stops setup; it offers a `ci.yml` scaffold with aggregator check `ci / required`. The prompt template is Liquid with `issue.identifier|title|state|labels|url|description` and `attempt`. Local setup accepts `GITHUB_TOKEN`, a `gh` keyring login, or the GitHub App set.
- Source and exact locus: `src/README.md:114-148`; `cli-launch.md:34-35`; `src/examples/workflows/github-codex.yaml` (starter config, `hooks.after_create` clone example at the end) and `github-codex.prompt.md:1-40`; `configuration-daemon.md:27-29`.
- Why it matters: OGM creates repos programmatically, so it must reproduce init's outputs (labels, CI workflow, ruleset, `.aiur/*`) from a template rather than run the wizard.
- Confidence and freshness: [V].
- Contradiction or open question: the OGM repo itself has no `.github/` and no `.aiur/` at `9508c1c` [M]; `aiur init` for this repo (Kevin's request) will stop at the CI check until a workflow and ruleset exist.
- Suggested requirement/decision impact: ticket C6 owns the game-repo template; the planner notes the platform-repo CI prerequisite for the parent's `aiur init` step.

### E02-15: Zero-cost integration testing is possible with the `memory` tracker and the `fake` provider
- Claim / current behavior: trackers `linear|github|memory`; a `fake` backend entry exists in the provider registry (`default_command: "fake-agent --serve"`, model `fake-1`).
- Source and exact locus: `src/README.md:163`; `src/lib/aiur/coding_agent/providers/fake.ex:4-20`.
- Why it matters: A6 §16's spike (issue→claim latency, cancel within 10 s, usage join) can run with no model spend.
- Confidence and freshness: [V] that the modules exist; [I] that `fake` is wired for a local run outside ExUnit.
- Contradiction or open question: none.
- Suggested requirement/decision impact: ticket C0 (spike) before C2–C4 land.

### E02-16: Run telemetry and features give a join key for build analytics
- Claim / current behavior: `Aiur.RunTelemetry` writes `telemetry.ndjson` (schema v3) with per-ticket usage capture and cohort labels captured at dispatch (`observability.capture_label_prefixes`, default `experiment:`, `cohort:`, `feature:`; ≤20). `aiur feature create <slug>` / `feature add <slug> <ids…>` groups tickets into a collection with a `f-<slug>` epic.
- Source and exact locus: `src/lib/aiur/run_telemetry.ex:1-30`; `configuration-daemon.md:274-275`; `reference/build-history-commands.md:11-18`.
- Why it matters: one OGM job that spawns several tickets maps to one aiur feature; `run_id` from `/usage` `sessions[]` is the per-run id T01 needs.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: OGM labels every filed ticket `feature:gm-<jobid>` (captured by telemetry) in addition to the body markers from B8 §3.2 [O].

### E02-17: Host readiness for aiur on this machine
- Claim / current behavior: `aiur` CLI at `~/.local/bin/aiur` (npm `aiur-cli`), `aiurdev` at `/home/orangekid/github/aiur/scripts/aiurdev`, `mise` with `elixir` and `erlang` installed, `codex` and `claude` CLIs on PATH (Node 24.14.0), `~/.codex` and `~/.claude` present, `~/.aiur/` state exists with repo nodes for `aiur-team/aiur` and `its-everdred/open-game-maker-2000` and one instance key, no `~/.aiur/config`, no `~/.aiur/.env`, `bwrap` at `/usr/bin/bwrap`, `unprivileged_userns_clone=1`, cgroup2, `systemctl --user` running, `tailscale` present, 12 cores, 31 GB.
- Source and exact locus: `which`, `ls`, `cat /proc/sys/kernel/unprivileged_userns_clone`, `stat -fc %T /sys/fs/cgroup`, `systemctl --user is-system-running` run read-only.
- Why it matters: aiur can be built and run here today; Codex's bubblewrap sandbox prerequisites are met (B1 option C's Railway caveat is gone).
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: the installed `aiur-cli` version was not read (running `--version` was avoided); `aiurdev` tracks the checkout.
- Suggested requirement/decision impact: T11's units call `aiurdev` from the pinned checkout, not the npm `aiur`, to match `0f692a45b`.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| Ticket dispatch, worktrees, turns, CI/rework, PR mechanics | aiur daemon (Elixir), `src/lib/aiur/orchestrator/*`, tests yes | Keep (run as-is, pinned) | A6 §12, unchanged |
| Usage ledger + per-ticket read | `src/lib/aiur/usage_ledger.ex`, `aiur_web/api/usage/ticket_usage.ex`, tests yes | Keep; consume over HTTP | E02-5 |
| Spend cap | `src/lib/aiur/orchestrator/spend_cap/*`, tests yes | Keep; OGM sets caps | E02-4 |
| Progress/phase | `aiur_web/api/usage_progress*.ex` | Keep | E02-5 |
| Event export (journal, webhook, WS feed) | `src/lib/aiur/events/outbound/*`, `aiur_web/events_*` | Keep; OGM consumes | E02-6 |
| Cancel/pause/resume/message | `observability_api_controller.ex`, `ticket_cancel_api_controller.ex` | Keep | E02-7 |
| Job creation | none in aiur; `IssueCreation` internal | Build in OGM (TS) over GitHub API | E02-8 |
| Skill delivery | `agent_skills.ex` fixed bundle | Keep; add gm-* to game-repo template | E02-9 |
| Prompt template, `.aiur/config`, hooks | `src/examples/workflows/github-codex.*` | Adapt into an OGM template (TS renderer) | E02-14 |
| `aiur init` | interactive Elixir wizard | Replace for game repos with OGM provisioning; keep for the platform repo | E02-14 |
| B8 ledger sidecar / watchdog | proposed only, no code | Drop | E02-1 |
| OGM prototypes | nothing in `prototypes/` touches aiur [V, grep] | n/a | — |

## 4. Interfaces and contracts this track defines or consumes

**Consumes (aiur, owner upstream):** the routes in E02-2 with the shapes in E02-4/5/6/7.

**Defines: `AiurClient` (T02, `packages/aiur-client`)**
```ts
type AiurDaemon = { baseUrl: string; token: string /* write scope */; supervisorToken?: string };
interface AiurClient {
  issue(id: string): Promise<IssueEntry>;                       // GET /api/v1/:id
  usage(id: string): Promise<TicketUsage>;                      // contract aiur.ticket_usage v1
  progress(id: string, limit?: number): Promise<TicketProgress>;// contract aiur.ticket_progress v1
  setSpendCap(id: string, usd: string): Promise<SpendCap>;      // PUT /:id/spend-cap {amount,currency:"USD"}
  cancel(id: string): Promise<{ process: { status: "exited" | "still_running" | "kill_failed" | "generation_changed" } }>;
  pause(id: string): Promise<void>; resume(id: string): Promise<void>;
  message(id: string, text: string, messageId?: string): Promise<{ request_id: string }>;
  nudgeTodo(ids: string[]): Promise<void>;                      // POST /api/v1/control todo([...], only: true)
  accounts(): Promise<UsageAccounts>;                           // GET /api/v1/usage/accounts
  events(after: number, limit: number, patterns: string[]): Promise<EventPage>; // GET /api/v1/events
}
// every write: headers { Authorization: `Bearer ${token}`, Origin: baseUrl, "X-Aiur-Request": "1" }
```

**Defines: ticket filing contract (T02 with T01's job row)**
```json
{ "title": "<validated title>",
  "body": "<summary>\n\n## Scope\n…\n## Acceptance\n…\n## Load skills\n- gm-verify\n\n<!-- gm-job:<uuid> gm-ticket:<key> gm-sig:<hash> -->",
  "labels": ["complexity:2", "feature:gm-<jobid>", "agent:todo"] }
```
Then `PUT /:n/spend-cap {"amount":"<reservation>","currency":"USD"}` and `nudgeTodo([n])`.

**Defines: job state projection (T02 → T01/T09)** — aiur `lifecycle.changed`/labels → OGM stage: `queued|waiting(capacity|provider_limited)` → "Waiting for robot capacity"; `running` → "Building"; `ci-wait` → "Running final tests"; `rework` → "Fixing a problem"; `human-review` → "Ready to try"; `budget-exhausted` → "Out of budget" (admin decision); `error|cancelled` → friendly failure.

**Defines: event intake (T02)** — WebSocket `events:feed` subscription per daemon (token from `POST /api/v1/events/token`), patterns `ticket.*.lifecycle.changed`, `ticket.*.usage.*`, `ticket.*.cancel.result`, `ticket.*.agent.progress*`; optional `POST <ogm>/internal/aiur/webhook` verifying Standard Webhooks headers (E02-6) once TLS exists.

**Defines: daemon provisioning record (T02 with T11)**
```ts
type GameDaemon = { repo: "owner/name"; checkoutPath: string; unit: "aiur@<slug>.service";
  envFile: string /* GITHUB_* or token, AIUR_ERLANG_COOKIE, AIUR_OUTBOUND_WEBHOOK_SECRET? */;
  port: number; clientToken: string; status: "stopped" | "starting" | "running" | "idle" };
```
`.aiur/config` rendered from a template: `tracker.github.repo`, `base_branch`, `allowed_users: [<intake login>]`, `agent.priority: [codex, claude]`, `agent.max_concurrent_agents`, `max_turns_by_complexity`, `max_agent_duration_minutes` (45 edit / 90 new game, B8 §5), `max_dispatches_per_ticket: 3`, `hooks.after_create`, `events.export.enabled: true`, `server.host: 127.0.0.1`, `server.port: <n>`, `instance.mode: local`.

**Defines: after_create hook contract (T02 → T10)** — `GET <ogm>/internal/jobs/by-ticket/$AIUR_HOOK_TICKET_IDENTIFIER/bundle` (per-daemon secret) → `{skillPackVersion, gameContext, diagnostics?}` written to `.gm/context/`; never provider keys.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| C0 | aiur zero-cost integration spike | Measured issue→claim latency, cancel confirmation, spend-cap trip, `.codex/skills` link behavior with memory tracker + fake provider; results in `docs/plans/ogm-v1-build/evidence/T02-spike.md` | scratch repo only; no product code | 1 | aiurdev builds here (E02-17) | any product code |
| C1 | `packages/aiur-client` | Typed client for E02-2 routes with zod schemas, bearer + Origin + custom header, versioned contracts checked | `packages/aiur-client/src/{client,schemas,events}.ts`, tests | 2 | none | job logic, GitHub calls |
| C2 | Job intake to aiur | Admitted job → GitHub issue (markers, labels, feature label) → spend cap → `todo` nudge; idempotent on `gm-job/gm-ticket` | `services/backend/src/jobs/intake/*`, `services/backend/src/github/issues.ts` | 3 | C1; T01 job row + reservation; T03 GitHub identity for writes | admission/budget math (T01), repo creation (T03) |
| C3 | aiur event ingestion and job projection | WS feed subscriber per daemon + GitHub webhook facts → job stage/progress/usage rows; `budget-exhausted` handled | `services/backend/src/jobs/aiur-events/*`, `services/backend/src/jobs/projection.ts` | 3 | C1; T01 event ingestion table | notifications UI (T09) |
| C4 | Job controls | Cancel (confirmed exit), pause/resume, send message, answer decision from OGM API | `services/backend/src/jobs/controls.ts`, routes | 2 | C1; T01 policy module | chat UI (T06/T09) |
| C5 | Daemon fleet manager | Start/stop one `aiur` daemon per active game repo via systemd template unit, mint client token, register in `remote-instances.yaml`, health via `/healthz` | `services/backend/src/aiur-fleet/*`, `ops/systemd/aiur@.service`, config template | 4 | T11 unit conventions; T03 sandbox launch wrapper | sandbox design (T03), TLS (T11) |
| C6 | Game-repo aiur provisioning template | Repo gets `.aiur/{config,hooks,prompt.md}`, labels, `ci.yml` with `ci / required`, ruleset, `.claude/skills/gm-*` + `.codex/skills` + `.agents/skills` links | `packages/game-repo-template/aiur/*`, `services/backend/src/github/provision-aiur.ts` | 3 | T10 skill pack layout; T03 repo creation | the skills' content (T10) |
| C7 | Usage reconciliation and ledger import | Periodic `/usage` + `usage.changed` → OGM ledger rows (`api_equivalent`, `provider_reported`, `run_id`), reservation release on terminal states | `services/backend/src/budgets/aiur-usage.ts` | 2 | C1, C3; T01 ledger schema | budget policy (T01) |
| C8 | Bug-repair filing route | `game_repair` job → redacted issue body + diagnostics via hook bundle (B8 §6) | `services/backend/src/jobs/repair/*`, hook bundle endpoint | 3 | C2, C6; T01 bug intake; T10 repair skill | classification rules (T01) |

## 6. Risks and unknowns

- R1 **Hosted mode vs subscriptions (E02-11).** Default: `instance.mode: local` inside the T03 boundary; record as a decision; revisit at #5701.
- R2 **Outbound webhook needs HTTPS (E02-6).** Default: WebSocket `events:feed` over loopback; switch to the signed webhook when T11 provides local TLS.
- R3 **Spend cap on subscription routes (E02-4).** Unknown whether `api_equivalent` coverage is complete for Codex/Claude subscription runs. Spike C0 step; fallback: OGM also compares `/usage` totals and cancels (C7).
- R4 **N daemons on one host (E02-12).** Unmeasured RSS per daemon. Default: cap live daemons at 4, idle-stop after 30 min, `agent.max_concurrent_agents: 2` per daemon, fleet total enforced by OGM admission (1 creation + 3 edits).
- R5 **`aiur init` drift (E02-14).** OGM's template must match the pinned aiur version. Default: pin `0f692a45b` (or the tag T11 installs), re-render templates on upgrade, CI test that renders a config and runs `aiur status`-style validation [O].
- R6 **Repo-shipped skills under Codex (E02-9).** Verify in C0 that committed `.codex/skills` links are honored; fallback: `after_create` writes them.
- R7 **Dispatch authorization identity.** Issues filed by the intake App must be in `allowed_users` (or CODEOWNERS); the daemon's own bot cannot trigger itself (B8 §2.1, still true per `github-auth.md` reference). Default: intake identity ≠ agent bot identity; T03 decides App vs PAT.
- R8 **Platform-repo prerequisites for the parent's `aiur init`:** no `.github/` workflow or ruleset exists here (E02-14). Default: add a minimal `ci / required` workflow before running `aiur init` on this repo.

## 7. Self-hosting notes

- Everything B13 placed on Railway for aiur now lands on this host: daemons run under `systemctl --user` template units (running [M]), `aiur run --container` (no tmux, logs to stdout, `AIUR_ERLANG_COOKIE`) or `--bg`; each daemon binds `127.0.0.1:<port>`; no `server.public_url` unless T11 exposes the GitHub webhook receiver.
- GitHub webhooks are optional: polling (30–120 s) plus the `control todo` nudge gives sub-poll latency after filing; CI and review facts still arrive by polling classes (`polling.intervals.ci|review`).
- Credentials: `~/.aiur/.env` does not exist; each daemon's repo-local `.env` (or systemd `EnvironmentFile`) carries its GitHub credential group; a repo-local GitHub credential shadows the home one (E02-14). Provider auth comes from `~/.codex` and `~/.claude` profiles already signed in (`aiur login <harness> <name>` for extra profiles); `*_API_KEY` must not be added (no spending).
- Sandbox prerequisites for Codex's own bubblewrap sandbox are present (`bwrap`, userns, cgroup2) [M]; the default turn policy allows network, so egress control is T03's.
- Build with `aiurdev` from `/home/orangekid/github/aiur` (mise elixir/erlang installed); do not run `aiur` and `aiurdev` side by side for the same repo (shared identity).
- Checked read-only: `which aiur aiurdev codex claude bwrap mix tailscale`, `ls ~/.aiur`, `ls ~/.local/share/mise/installs`, `cat /proc/sys/kernel/unprivileged_userns_clone`, `stat -fc %T /sys/fs/cgroup`, `systemctl --user is-system-running`, `nproc`, `free -g`.
