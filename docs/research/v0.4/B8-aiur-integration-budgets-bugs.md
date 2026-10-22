# B8: aiur integration, budgets, and the two bug routes

**Source requirements:** spec v0.4 §5.5–5.6, §5.10–5.11, §7.1–7.3, §8.3–8.5, R22, U13. **Builds on:** A6 (aiur at `ad084b1f`), A9 §5, A1 §Q4.
**Research date:** 2026-10-21. Read-only. Nothing in aiur was run, changed, or filed.

**What I inspected.** The local aiur `main` is still `ad084b1f`, so `git log ad084b1f..HEAD` is empty. The local `origin/main` ref is 21 commits ahead, at `46bda0020`. That is also the commit the live runtime worktree (`aiur-worktrees/runtime`) runs, so I read every interface at **`46bda0020`** with `git show`/`git grep`. None of the 21 commit titles touch intake, the HTTP API, skills, or budgets. I did not fetch; the remote has since moved to `b24b70b1b`, which I did not read.

**Labels:** **V** = verified in code or docs at `46bda0020`. **I** = inferred from verified facts. **U** = unverified. **P** = proposal.

---

## 1. TL;DR

- aiur still has no "create job" API. Work enters only as a GitHub (or Linear) issue labelled `agent:todo`, and only when a trusted account applied that label. Game Maker should file issues through its own GitHub App.
- What a creator should see (stage, waiting reason, CI) is readable today from labels and `GET /api/v1/:issue`. aiur offers no ETA. Its percent comes from the agent's own rough guess, in 10% steps, and only on aiur's internal event bus. Game Maker must work out ETA and the friendly stage names itself.
- aiur has no dollar or token budget per ticket or per tenant. Game Maker must own admission: the 1 new-game + 3 edit slots, the money reservation, and when to stop a job. aiur supplies turn, time, and retry limits, provider-window waits, and a usage ledger with per-ticket attribution. The ledger has no HTTP read path.
- Skills are not chosen per ticket. aiur copies one fixed bundle into every workspace and leaves alone any skills the repo ships itself. Game Maker should ship its skill pack in the games repo, or fetch it with an `after_create` hook, and name the relevant skills in the ticket body.
- The two aiur uses separate cleanly, by host and by GitHub App. Hosted aiur runs on its own host with an App installed only on the games repo. Kevin's listener is a second daemon on the private Game Maker repo. On one machine, the two daemons share provider accounts unless `agent.accounts` restricts them.
- Bug reports: deterministic sorting first; a private store for diagnostics; only an opaque id in issues; dedupe on Game Maker's side by signature. A player's report never spends money freely: the recommended starting point is auto-repair only for reproducible crashes, and an admin approves anything else.

## 2. aiur today

### 2.1 Instances, repositories, isolation

- **One daemon serves one tracked repository.** The daemon runs from a checkout; `tracker.github.repo` defaults to that checkout's `origin` and is the single repo it polls and opens PRs against. Several daemons may share one `~/.aiur/config` (V, `website/docs-app/reference/configuration.md:88`). Per-instance state is keyed by `AIUR_INSTANCE_KEY`, a hash of the project root, and fails closed when that key is missing (V, `src/lib/aiur/config/paths.ex:40-60`).
- **GitHub credentials** are read in this order: shell, then `./.env`, then `~/.aiur/.env`. If a repo-local `.env` sets any GitHub credential, all home-level GitHub credentials are ignored (V, `configuration.md:8`). So each daemon can carry its own App or token.
- **Provider accounts** are machine-local profiles (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, named API keys). `agent.accounts` in each repo's config lists which accounts that repo may use (V, `configuration-agent.md:10`). There is **no** budget per instance; two daemons on one host draw from the same subscription windows (I).
- **Who can trigger dispatch.** Dispatch requires that the current `agent:*` state label was applied by an allowed actor, checked against the issue timeline (V, `src/lib/aiur/github/dispatch_authorization.ex:54-115`). The daemon's own bot identity cannot trigger its own work, except for marked main-watch fixer tickets (V, `website/docs-app/apis/github-auth.md:5-9`). Comment commands and review-driven rework are accepted only from trusted accounts, the repo owner, or CODEOWNERS (V, same file).
- **Isolation.** aiur still assumes a trusted environment. Claude runs with `bypassPermissions` (V per A6; not re-checked). `*_API_KEY` variables are removed from agents' environments (V, `configuration.md:329`).

### 2.2 Intake, progress, cancellation, outcome

| Need | What exists | Status |
|---|---|---|
| Create a job | Issue plus `agent:todo` from a trusted actor. Dependencies use GitHub's native blocked-by relations and the build queue (`concepts/build-orders.md:150-199`). | **V**, no API |
| Ticket text to the agent | Liquid `prompt_file` with `{{ issue.title }}` and `{{ issue.description }}`, wrapped in `src/prompts/shared-agent-instructions.md` | **V** |
| Per-job setup | `hooks.after_create` / `before_run` / `after_run`, with `AIUR_HOOK_TICKET_IDENTIFIER` and `AIUR_TICKET_BRANCH` set (`src/lib/aiur/workspace/hooks.ex:286-308`) | **V** |
| Status | `GET /api/v1/:issue` returns `state`, `turn_count`, `runtime_seconds`, `work_state`, `waiting_reason`/`waiting` (capacity, provider limit, backoff), `ci`, `review`, `pause_reason` (`src/lib/aiur_web/presenter/entries.ex:10-39`). It returns **no tokens, cost, percent, or ETA**. | **V** |
| Events | `GET /api/v1/:issue/events` returns the transcript (raw agent messages and diffs) (`observability_api_controller.ex:38`). Not suitable for children. | **V** |
| Percent | The agent emits `progress` as 10, 20 … 100 at phase boundaries, as a time-based self-estimate (`shared-agent-instructions.md:217-240`). These events live on the internal bus (`concepts/message-bus.md:36`), with no stable external read. | **V** exists; **I** no external API |
| ETA | None; a grep for ETA fields found nothing | **V** absent |
| Pause / resume | `POST /api/v1/:issue/pause` and `/resume` (Basic auth, write pipeline) (`routes/api.ex:14-18`) | **V** |
| Cancel | The `agent:cancelled` label is terminal, and terminal states "stop work" (`concepts/ticket-lifecycle.md:23-37`; `configuration.md:100`). There is no cancel endpoint. Delay depends on the poll interval (120 s default) or webhooks. | **V** label; **I** delay |
| Mid-run questions | Decisions API at `/api/v1/decisions/:id/decide` (`routes/decisions.ex`) | **V** |
| Outcome | The agent stops at `human-review` with green CI. `done` happens only when the PR is merged with a closing keyword. Agents never merge their own PRs (`ticket-lifecycle.md`, "Who writes each transition"). | **V** |
| Retry and rework | `agent:rework` (from CI or a trusted comment), with `max_retry_attempts` 3 for failed turns and `max_dispatches_per_ticket` 0, meaning off by default (`configuration-agent.md:38-40`) | **V** |

### 2.3 Skills delivery

`Aiur.AgentSkills` (`src/lib/aiur/agent_skills.ex`) bakes a **fixed** set of skills in at compile time: `aiur-agent`, `aiur-debug`, `aiur-experiment`, `design-import`, plus the pinned Compound Engineering skills. It writes them into every workspace at each backend's declared path. Claude gets them under `.claude/skills`. Codex gets `.codex/skills/<skill>` symlinks to `.claude/skills`. Muse gets them under `.agents/skills` (V, `coding_agent/providers/{claude,codex,muse}.ex:18-21`). It **never overwrites** a skill the target repo already ships (V, moduledoc). No label or field picks skills per ticket (V: grep found none). The Codex symlinks cover only the bundled skills; a repo's own `.claude/skills` gets no Codex link from aiur (I, from reading the install loop).

### 2.4 Budgets and usage

- **Limits that exist** (V, `configuration-agent.md`): `max_concurrent_agents` (derived from host capacity), `max_concurrent_agents_by_state`, `max_turns`, `max_turns_by_complexity`, `max_agent_duration_minutes` (60), `max_consecutive_noop_turns` (3), `max_retry_attempts`, `max_dispatches_per_ticket`, `max_concurrent_builds`, CPU and memory gates, and GitHub API budgets per agent and per daemon.
- **Limits that do not exist** (V, grep): per-ticket or per-tenant dollar or token caps, and concurrency per label or per tenant. No open aiur issue proposes them (V, `gh issue list` searches).
- **Usage data:**
  - Per-request `UsageEnvelope` records, attributed to the ticket. Cost is reported as Unknown, never as zero (V per A6).
  - `mix aiur.cost_report --ticket N --json` (V, `src/lib/mix/tasks/aiur.cost_report.ex`). It needs the source tree; a release build likely has no `mix` (I).
  - `aiur usage` and `aiur accounts --json` give `remaining_percent` and reset times (V, `reference/cli.md:38,92`).
  - Waits caused by provider limits appear in `waiting_reason` (V).

## 3. Integration shape recommendation (P)

This keeps A6's Option A+C and narrows it to the current interfaces.

1. **Admission happens before GitHub.** Game Maker validates the §7.2 plan by checking it against the game ID, the caller's role, an allowlisted set of roles and skills, and an acyclic, size-capped `dependsOn` list. It then writes a `job` row and reserves budget. Only once a slot is free does it file issues. Queued jobs never appear in GitHub at all, so aiur's queue holds only admitted work.
2. **Filing is deterministic.** Game Maker's own GitHub App, `gm-intake`, is listed in the hosted daemon's `trusted_accounts`; it is not the daemon's own identity. It creates one issue per plan ticket with:
   - **Title:** the validated `title`.
   - **Body:** rendered from structured fields only: summary, included and excluded scope, acceptance criteria, a "Load skills: …" list, and hidden markers `gm-job:<uuid>`, `gm-ticket:<key>`, `gm-sig:<hash>`. The body never contains a raw child transcript.
   - **Labels:** `complexity:N` and `model:` as needed, then `agent:todo` last.
   - **Dependencies:** GitHub blocked-by edges.
   - **Idempotency:** the `gm-job`/`gm-ticket` pair is the key. Before creating anything, Game Maker checks its own database, then GitHub.
3. **Context and skills come from a hook.** `hooks.after_create` calls Game Maker's private API with `AIUR_HOOK_TICKET_IDENTIFIER`. It receives a short-lived signed bundle: the pinned skill-pack version, the game's context, and, for repairs, the private diagnostic bundle. It writes the skills into `.claude/skills` and `.codex/skills`. This needs no change to aiur (I; the hook mechanism is V).
4. **Status is a projection.** Game Maker watches GitHub webhooks (labels, PRs, checks) as the authoritative record of state, and polls `GET /api/v1/:issue` for waiting and CI detail. It maps that into friendly text:

   | aiur state | Creator sees |
   |---|---|
   | (GM queue) | Waiting for a free slot |
   | `todo` + `waiting: capacity` or `provider_limited` | Waiting for robot capacity |
   | `in-progress` | Building |
   | `ci-wait` | Running final tests |
   | `rework` | Fixing a problem |
   | `human-review` + preview built | Ready to try |
   | `error` | Something went wrong (friendly message) |

   ETA comes from Game Maker's own history: p50 durations by job kind and complexity, shown only when it has ≥5 samples. Otherwise it shows only the stage, as spec §5.6 requires.
5. **Control and outcome.**
   - Pause uses the API. Cancel applies `agent:cancelled` through `gm-intake`.
   - At `human-review`, Game Maker builds the PR head as the playable draft.
   - Merge and Publish are deterministic Game Maker actions; agents never merge. Whether merging happens when the draft is ready or at Publish belongs to the release and draft spike (I: open PRs left waiting would pile edits on top of each other).

## 4. Upstream aiur gap list (no tickets, by value)

1. **Read API for usage per ticket**, for example `GET /api/v1/:issue/usage`, built on the ledger. Today the only route is `mix` or reading the ledger files in a sidecar.
2. **Per-ticket token or cost cap**, enforced inside the turn loop and ending in a distinct state such as `budget_exhausted`. Without it, Game Maker's outside watchdog reacts late and stops work clumsily.
3. **External read of progress and phase**: the latest `progress` percent and label, and the phase alerts, in `GET /api/v1/:issue`. The data exists internally; it is just not exposed.
4. **Outbound event webhook or SSE** for state, progress, and PR outcomes, so Game Maker can drop polling. GitHub webhooks cover most of this today.
5. **Cancel endpoint** that confirms the agent process has stopped (today the label takes effect at the next poll).
6. **Job-create API**, which would avoid GitHub latency and rate cost. It is optional while GitHub intake works.
7. **Per-ticket skill injection**, for example a `skills:` field or a list of extra skill sources. The hook workaround is adequate for V1.
8. **Per-tenant concurrency** (a semaphore per label). It is optional because Game Maker gates `agent:todo` itself.
9. **Stable, versioned JSON schemas** for `/state` and `/:issue` (still U, as in A6).

## 5. Budgets and admission

**Game Maker owns:**
- The category slots: new-game 1 and edit 3 by default, configurable per family (§8.3).
- The money reservation per job: the p80 estimate by kind and complexity, from Game Maker's own history.
- Rolling-window caps per family plus one platform-wide cap.
- The queue and the "waiting for a free slot" state.
- Reconciliation and the decision to stop a job.
- Who may trigger a job (§6).

**aiur is reused for:** the per-ticket turn, duration, and retry limits, set in the games repo's `.aiur/config`; the global `max_concurrent_agents` backstop; waits caused by provider limits; and the raw usage records.

**Proposed accounting rules (P):**
- A new-game request takes **one** new-game slot however many design or build tickets it spawns. Spawned tickets count only against aiur's global cap and the job's reservation.
- Each repair is its own job with its own reservation (see decision D3 for which slot it takes).
- Reconciliation: every N minutes, Game Maker adds up ledger usage per `gm-job`.
  - At 1× the reservation, it pauses the job and asks the admin.
  - At the hard cap, it applies `agent:cancelled`.
  - The 1.5× threshold in the companion and A6 remains an unaccepted number; make it configuration.
- Show "waiting for robot capacity" (provider exhaustion) separately from failure (§8.4).
- Subscription quota and API-equivalent estimates stay in separate columns, per A6 §8.

**Hosted per-ticket limits to set (P, values are starting configuration):**
- `max_turns_by_complexity`
- `max_agent_duration_minutes`: 45 for edits, 90 for a new game
- `max_dispatches_per_ticket`: 3 (currently off by default)
- `max_concurrent_agents`: at least the sum of active slots the host can carry. If the host can carry fewer, Game Maker shows a capacity wait rather than overcommitting.

## 6. Bug routing (R22, U13)

**Intake.** There is one report button for text or voice. The SDK builds a bundle in the A9 §5 shape and uploads it to **private Game Maker storage**, never to GitHub. Retention is still owed by the §10.4 and R19 rulings.

**Classification: deterministic first (P).**
1. **Platform:** the error came from host UI, routing, auth, saves, the voice relay, or the editor shell (outside the game iframe), **or** the same normalized signature appears in at least two different games.
2. **Game:** the stack frames are in the game's own source, **or** there is no error but the complaint describes gameplay ("too hard", "can't jump").
3. **Editor-fixable complaints** ("enemy too fast") are offered as an editor change first, at no agent cost (A9 step 3).
4. **Ambiguous** cases (only Engine SDK frames, or no evidence) go to a **game repair first**, with an instruction: if the agent concludes the defect is in the SDK or platform, it raises an attention or decision instead of patching around it. Game Maker then files the platform issue. The game job never gains write access to the platform (§5.10).

   An optional cheap classifier call may only *suggest* a route; the deterministic rules, then the admin, decide.

**Dedupe (P).**
- The signature is a hash of the error type, the normalized message, the top in-game frames after source mapping, and the game ID (the game ID is left out for platform signatures).
- Game Maker's database is the source of truth. A report that matches an open job or issue is attached to it, raising a count and adding a bundle reference; it does not spawn new work.
- Reports without an error are grouped per game and release over a short window, and never auto-merged into another family's report.
- Searching GitHub for markers is avoided; it uses GitHub's tight search budget.

**Game route.** A repair is a `requestType: game_repair` job on the hosted aiur, filed in the games repo.
- **Issue body:** only redacted metadata: release, signature, a reproduction class (crash with error, wrong behaviour without error, or not reproducible), and the opaque `gm-report` id.
- **Diagnostics** reach the agent only through the `after_create` hook.
- Because generated-game source is public (§3.5, §9.2), the issue and PR text are public too. No speech, names, saves, or screenshots go in them.
- The acceptance criteria include a failing replay "promise" test where one can be built (A9).

**Platform route.**
- A second GitHub App, `gm-reporter`, has **Issues: write only** on `its-everdred/uncle-kevins-game-maker-2000`. That repo is private today (V, `gh repo view`) but may be open-sourced later, so the same redaction applies.
- It files issues **without** `agent:todo`. Kevin's listener does not dispatch them until Kevin, a trusted account, triages and labels them.
- This keeps user-written text, a prompt-injection surface, from auto-driving a daemon with platform write access. Kevin reads bundles through Game Maker's operator view.

**Who may trigger a repair** is decision D2. **Retry and escalation (P, numbers are configuration):**
- Each repair job gets 2 automatic attempts. Attempt 2 is a rework comment from `gm-intake` on the same ticket, so it keeps the PR and context.
- The reservation is about one-third of a feature's.
- After that, the job stops with the friendly message and goes into Kevin's operator queue. A parent is notified only when a budget or permission decision is needed (§5.11).
- Not-reproducible reports spend no tokens. They are stored and counted, and a repair is triggered at N matching reports or by admin request.
- A failed repair never replaces the published release.

## 7. Decisions for Kevin

**D1. Where does the platform listener get model capacity?**
Options:
- (a) Share the subscription accounts with the aiur dev daemon.
- (b) Dedicated accounts, set through `agent.accounts` in the Game Maker repo's config.
- (c) API key only.

Recommended: **(b)**. Why: platform fixes then cannot starve aiur dev work, and the reverse holds too; aiur has no budget per instance. Consequences: (a) costs nothing extra but both fleets compete for the same 5-hour and weekly windows. (b) needs another account. (c) has a measurable dollar cost and no subscription-terms question.

**D2. Who may trigger a repair from a player's report?**
Options:
- (a) Reports only; the creator or an admin taps "fix it".
- (b) Automatic only for reproducible crashes with an error, within a small per-game daily repair allowance charged to the family; everything else needs approval.
- (c) Every report from a family member is automatic.

Recommended: **(b)**. Why: crashes are cheap to verify and have a clear fix target, and it meets §5.10's rule that a player gets no free budget. Consequences: (a) is the safest but slowest. (c) lets a child's repeated taps or a guest drain the budget, and dedupe becomes the only guard.

**D3. Do repairs take one of the 3 edit slots?**
Options:
- (a) Yes, they share the edit pool and jump the queue.
- (b) A separate repair slot (default 1).
- (c) No slot limit, only the reservation.

Recommended: **(a)**. Why: §8.3 forbids hidden extra caps and adds no repair category; repairs are edits with context. Consequences: (a) can block feature work during a burst of bugs. (b) adds a new limit you would need to approve. (c) weakens the concurrency control.

**D4. What should Game Maker do about the upstream aiur gaps?**
Options:
- (a) File gaps 1–3 as aiur tickets now.
- (b) Work around them for V1 with a sidecar and a watchdog; file later.
- (c) Work around them permanently.

Recommended: **(b) for V1, then (a) for gaps 1–2**. Why: the V1 prototype must not wait on aiur, but an outside spend watchdog is the weakest part of the design. Consequences: (b) means a ledger-reading sidecar on the hosted host and stops that lag by minutes. (a) adds aiur work to your own queue.

**D5. Repair numbers.** Accept 2 automatic attempts at about ⅓ of a feature's reservation, then escalation to you, as the *starting configuration*?
Options:
- (a) Accept.
- (b) 1 attempt.
- (c) Decide after the R15 benchmark.

Recommended: **(a), marked provisional**. Why: there is no measured repair cost yet; config can change it without code. Consequences: (b) halves the worst-case spend but sends more to your queue.

## 8. Uncertainty

- **Not seen:** the 21 commits on the remote since `46bda0020`, and anything after `b24b70b1b`.
- **Unmeasured:** how fast `agent:cancelled` stops a running agent, and lag from issue to claim with and without webhooks (A6 §16's zero-cost spike still applies).
- **Unconfirmed — hook timing:** whether `after_create` runs before the agent's first prompt in every warm and cold workspace path (I from the module docs).
- **Unconfirmed — skill exposure:** whether skills the hook writes are picked up by Codex without extra links (I).
- **Uncertain — release builds:** `mix aiur.cost_report` is probably unavailable in a release build (I). Reading the ledger files directly would depend on their shape, which is not a contract.
- **Unchecked — bypassPermissions:** I did not recheck the `bypassPermissions` default, since A6.
- **Unchecked — Railway:** whether aiur runs on Railway at all is R05/A7's question, unchanged here.
- **Workflow overhead:** the bundled `aiur-agent` workflow (brainstorm, plan, work, review) runs on every game ticket. On small edits that is likely cost overhead. Complexity routing lets `complexity:1` skip phases; not measured.
- **Public-repo fit:** a children's product filing issues in a public games repo needs the §10.7 publication-boundary ruling. This report assumes only redacted metadata is public.
