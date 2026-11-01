# T01 backend-core: evidence packet

Researched at OGM commit `9508c1c` (branch `research`) and aiur `main` `0f692a45b`, 2026-10-31. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

Accounts, family roles, sign-in (email + passkey + Google through Better Auth), the 18+ age screen, the policy module, job admission (slots, reservations, concurrency 1 creation + 3 edit), budgets and the daily allowance, bug-report intake and auto-repair admission, build-analytics event ingestion joined to aiur run ids, and notifications.
Decisions asked of this track: database, ORM/migrations, API style, auth library versions.
Out of scope: how the backend drives aiur jobs (T02), sandbox and commit service (T03), the bucket (T05/T11), the web UI (T09), process supervision and TLS (T11).

## 2. Evidence packets

### E01-1: No backend code exists at the researched commit; every reuse target in this track is new
- Claim / current behavior: the repository has no server, auth, database or ORM code. The only `package.json` files are `prototypes/ui-v0/tools/package.json` (esbuild 0.25.0, playwright) and `docs/research/v0.5/schemas/tools/package.json`. No file in `prototypes/` or `scripts/` references express, fastify, hono, better-auth, drizzle, prisma, kysely or trpc.
- Source and exact locus: `find … -name package.json`; grep over `prototypes/` and `scripts/` [M].
- Why it matters: T01 tickets create packages from scratch; nothing to port. Hot write surfaces are the ones T12 proposes (root `package.json`, shared contracts package).
- Confidence and freshness: [M] as of 9508c1c.
- Contradiction or open question: none.
- Suggested requirement/decision impact: every T01 ticket is "replace/new"; the first ticket must own the backend skeleton so the others can land in parallel against it.

### E01-2: No database server is installed; SQLite is available through Node 24 and the npx cache; Postgres needs Kevin's sudo or the Docker group
- Claim / current behavior: `which psql postgres pg_ctl sqlite3` all miss. `apt-cache policy postgresql` shows candidate `17+278` (install needs sudo). `docker` exists at `/usr/bin/docker` but the daemon socket refuses this user (`id -nG` = `orangekid sudo users systemd-journal`, no `docker` group). Node v24.14.0 exposes `node:sqlite` (`DatabaseSync` present, prints an ExperimentalWarning). `better-sqlite3` 13.0.3 is in `~/.npm/_npx/…` cache. libsqlite3 3.46.1 is installed system-wide.
- Source and exact locus: host checks listed in §7 [M].
- Why it matters: the planner must pick a store that works with zero manual steps at the 5:30am checkpoint.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: A7 (R07) proposed Postgres advisory locks for repo serialisation; with repo-per-game (decision log "Repos") and one admission process, that lock is unnecessary [I].
- Suggested requirement/decision impact: **Decision: SQLite (WAL) owned by the single API process, through Drizzle ORM so Postgres is a driver swap later.** Postgres 17 via apt is the named fallback if T07/T11 require multi-process writers; it costs a `remind` item for Kevin (sudo install) [O].

### E01-3: aiur itself runs on files and SQLite here, not Postgres
- Claim / current behavior: aiur bundles `ecto 3.13.6`, `postgrex 0.22.4` and `exqlite 0.27` but its runtime state on this machine is files plus SQLite: `~/.aiur/github-budget/budget.sqlite3`, `~/.aiur/logs/<boot>/log/telemetry.ndjson`, JSON stores (`json_store.ex`, `agent_queue_store.ex`, `decision_store.ex`). No Ecto repo adapter is configured in `src/config/*.exs`.
- Source and exact locus: `/home/orangekid/github/aiur/src/mix.exs:192-194`; `find ~/.aiur -name '*.sqlite*'`; `grep Ecto.Adapters src/config` (no hits) [V][M].
- Why it matters: picking SQLite for OGM does not add a second database technology to the host; a Postgres choice would.
- Confidence and freshness: [V] aiur 0f692a45b.
- Contradiction or open question: none.
- Suggested requirement/decision impact: supports E01-2.

### E01-4: aiur main now has per-ticket usage, per-ticket USD spend caps and a cancel endpoint; B8's gaps 1, 2 and 5 are closed
- Claim / current behavior: routes exist for `GET /api/v1/:issue/usage` (`AiurWeb.Api.UsageController`), `GET|PUT|DELETE /api/v1/:issue/spend-cap` (`AiurWeb.Api.SpendCapController`, body `{"amount": "<decimal string, ≤6 fraction digits>", "currency": "USD"}`; 409 `spend_cap_exhausted` once exhausted) and `POST /api/v1/:issue/cancel` (`TicketCancelApiController`). The dispatch policy skips dispatch with `:spend_cap_exhausted`, and the orchestrator handles `{:spend_cap_exhausted, identity}` through `SpendCap.Stop`. The usage payload carries `ticket{owner,repository,identifier}`, `by_run[]{run_id, by_model, by_provider}` and `api_equivalent{amount, coverage}`.
- Source and exact locus: `src/lib/aiur_web/routes/usage.ex:8-25`; `routes/api.ex:13-14`; `api/usage/ticket_usage.ex:142,181-195`; `api/usage/ticket_spend_cap.ex:49-60`; `orchestrator/dispatch_policy/spend_cap.ex:7`; `orchestrator/calls.ex:40-41` [V].
- Why it matters: B8 §4 and the decision log ("aiur gaps: work around for V1 with a sidecar and a watchdog") assumed none of this existed. Admission can now set a hard cap inside aiur at filing time and reconcile from an HTTP read, with no ledger-reading sidecar.
- Confidence and freshness: [V] aiur 0f692a45b; B8 was written at `46bda0020`.
- Contradiction or open question: **contradicts B8 §2.4 "no per-ticket dollar cap", §4 gaps 1, 2, 5, and the decision-log D4 sidecar plan.** Whether `api_equivalent.coverage` is complete for subscription-backed runs is T02's to confirm.
- Suggested requirement/decision impact: drop the sidecar ticket; admission ticket calls `PUT spend-cap` with the job's hard cap and polls `usage` for reconciliation.

### E01-5: Analytics join keys are (tracker identity, attempt id, run id), and aiur accepts no custom events
- Claim / current behavior: `Lifecycle.record(ticket, attempt_id, event, boundary, metadata)` accepts only the fixed `@events` list (`dispatch … ticket_usage`); anything else is dropped. Labels `feature:`/`build-lane:` mark feature work and up to 20 tags of 64 chars are copied into telemetry. The usage endpoint groups by `run_id`.
- Source and exact locus: `src/lib/aiur/run_telemetry/lifecycle.ex:15-41,125-150`; `run_telemetry/cohort.ex:13,51`; `api/usage/ticket_usage.ex:181-187` [V]. C2 §1 reports the same at an earlier commit.
- Why it matters: the OGM event store must key game-activity events by job id plus aiur `{repo, issue}` and, when known, `run_id`/`attempt_id`, and set a `feature:gm-<gameId>` label per job so aiur's own reports filter by game.
- Confidence and freshness: [V] aiur 0f692a45b.
- Contradiction or open question: which environment variables the agent process sees inside the workspace (so `gm` can stamp `run_id`) is T02's; B8 names `AIUR_HOOK_TICKET_IDENTIFIER` and `AIUR_TICKET_BRANCH` for hooks only.
- Suggested requirement/decision impact: the ingestion contract (§4) carries optional `aiurRunId`/`attemptId`; the join to cost happens server-side from the usage endpoint, not in the client.

### E01-6: Every OGM write to aiur's API needs a bearer client token; Basic auth is refused on a public bind
- Claim / current behavior: `AiurWeb.ClientTokenAuth` authenticates `/api/*` with a bearer token and refuses Basic auth when the endpoint is bound publicly. Write pipelines are `client_token_write` + `api_write` + `require_writable` (`observability.dashboard_writable`).
- Source and exact locus: `src/lib/aiur_web/client_token_auth.ex:11-40`; `routes/api.ex:9-10`; `routes/usage.ex:9` [V].
- Why it matters: the backend holds one aiur client token in its env file; this is a secret the sandbox must never see (T03).
- Confidence and freshness: [V]; how tokens are minted is not in `reference/configuration*.md` by that name (grep miss) and is left to T02.
- Contradiction or open question: none.
- Suggested requirement/decision impact: `AIUR_API_URL`, `AIUR_API_TOKEN` in the backend env; T02 defines the client module.

### E01-7: Sign-in is email-mandatory plus passkey and Google (A10); Better Auth 1.7.x with `@better-auth/passkey` is the named library and could not be version-checked offline
- Claim / current behavior: A7 verified `better-auth` 1.7.12 (MIT, 30.4k stars, 2026-10-20) with passkey split into `@better-auth/passkey` 1.7.12; B10/B9 recommend both methods, email as recovery. No copy of either package exists on this machine (searched `~` to depth 7).
- Source and exact locus: `docs/research/v0.3/A7…md:146`; `docs/spec/release-plan.md:28`; `questions-or-commands.md` A10; local `find` [M].
- Why it matters: versions must be pinned when the ticket installs; they will be newer than 1.7.12 by then.
- Confidence and freshness: [I] for current version; [V] for the October figures via A7.
- Contradiction or open question: spec v0.4 §4.4 says "Sign in with Google for adults and children" and rejects email/password; the decision log and release plan supersede it (email mandatory, passkey + Google) [V].
- Suggested requirement/decision impact: pin `better-auth` and `@better-auth/passkey` to the same minor at install; email magic-link or OTP for recovery; no password.

### E01-8: Cookies and passkeys across Netlify (frontend) and this machine (backend) need a same-origin path
- Claim / current behavior: the frontend stays on `ogm2000.netlify.app`; the backend will sit on a different registrable domain (T11). Better Auth's session is a cookie; WebAuthn's RP ID must be a registrable suffix of the page origin that runs the ceremony. Safari blocks third-party cookies by default, and iPhone is the primary test device (CLAUDE.md, release plan).
- Source and exact locus: `README.md` objective ("The Netlify frontend stays"); A7 R04 (Better Auth sessions); WebAuthn RP-ID rule [I, standard behaviour, not re-read today].
- Why it matters: cross-site cookies would break sign-in on the phone; passkeys registered against the frontend's domain are fine only if the server verifies against that origin.
- Confidence and freshness: [I] as of 9508c1c.
- Contradiction or open question: none in the research; nobody has written this down.
- Suggested requirement/decision impact: **proxy `/api/*` and `/auth/*` from Netlify to the backend (`netlify.toml` 200 rewrite) so the browser sees one origin; set `rpID` and `trustedOrigins` to the frontend host. WebSocket services (rooms, voice) cannot go through that proxy and authenticate with short-lived tokens the API mints, never the cookie** [O]. T09 and T11 consume this.

### E01-9: The age screen is a neutral birth month/year check at 18, before any collection, with a cookie against retries
- Claim / current behavior: B9 §2a and §3 specify free entry of month and year, no "must be 18" wording before the screen, a cookie that stops re-entry, screening before Google sign-in, and keeping nothing but the cookie for refused users. Invitees pass the same screen (architecture doc "Easy invites").
- Source and exact locus: `docs/research/v0.4/B9…md:27-32,77-92`; `docs/architecture/architecture-scope.html` FEATURES "Easy invites" [V].
- Why it matters: it is the whole V1 COPPA posture; it must precede the OAuth redirect, so the age gate lives in the backend's sign-up flow, not only in React.
- Confidence and freshness: [V] docs; A12 keeps 64 px targets and read-along only.
- Contradiction or open question: none.
- Suggested requirement/decision impact: store `age_band = adult` plus `age_attested_at` on the user; a `POST /auth/age` step issues a signed short-lived cookie that sign-up and OAuth start require; an actual-knowledge procedure deletes the account (B9 §2a).

### E01-10: V1 authorization is four dimensions reduced to three, with deny-wins precedence and no admin takeover of adults' games
- Claim / current behavior: A7 R04 defines `platformRole ∈ {maintainer, admin, none}`, `capability ∈ {creator, player}`, `game.ownerId`, plus supervision (V3). Spec §4.1 adds family owner vs admin (owner cannot be removed). Release plan: admins cannot take over another adult's game (Working); invite-only play for everyone (§4.3); no accountless guests in V1.
- Source and exact locus: `A7…md:153-181`; `spec-v0.4.md:309-345`; `release-plan.md:29`; `questions-or-commands.md` A2, A5 [V].
- Why it matters: it is the one module every route calls; A7 asks for it as table-driven tests before any UI.
- Confidence and freshness: [V].
- Contradiction or open question: decision-log pick "Edit takeover: either side takes over instantly" vs "admins cannot take over an adult's game"; release plan §6 Q5 resolves it as takeover only between the owner's own devices [V].
- Suggested requirement/decision impact: `authorize(actor, action, resource)` with the A7 matrix minus the guardian/child columns as a test table; `maintainer` is an env allow-list, never grantable in-app.

### E01-11: Invitations are an own table with hashed single-use tokens bound to an email, not the Better Auth organization plugin
- Claim / current behavior: A7 recommends 128-bit random tokens stored hashed, single-use, 48–72 h expiry, revocable, bound to the recipient email, role fields server-side, per-inviter rate limits and audit. The organization plugin requires the accepting session's email to match the invitation (fine for adults) but A7 still prefers the own table for the policy coupling. A2 keeps invites family-only via an admin allowlist setting.
- Source and exact locus: `A7…md:193-200`; `questions-or-commands.md` A2 [V].
- Why it matters: room-scoped invite links (T07, "sign in and land in the game") reuse the same token mechanics with a `roomId`/`gameId` scope.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: one `invitations` table with `kind ∈ {member, play, room}`, consumed by T07 and T09.

### E01-12: Admission owns slots, reservation, queue and stop; aiur supplies per-ticket limits and the new spend cap
- Claim / current behavior: defaults 1 new-game + 3 edit builds per family (spec §8.3), repairs share the edit slots (D3), reservation = p80 by kind and complexity from own history (B8 §5), pause and ask an admin at 1× the reservation, stop at the hard cap, rolling-window caps per family plus one platform cap; provider exhaustion shown separately from failure (§8.4). Queued jobs never reach GitHub (B8 §3.1).
- Source and exact locus: `spec-v0.4.md:958-983`; `B8…md:108-134`; decision log "Spending" [V].
- Why it matters: this is the money-safety boundary; it must be deterministic code (CLAUDE.md rule 5).
- Confidence and freshness: [V].
- Contradiction or open question: §8.3 forbids a hidden aggregate cap, yet B8 adds a platform-wide cap; treat the platform cap as an explicit admin-visible setting, not hidden [I].
- Suggested requirement/decision impact: a `jobs` state machine `queued → admitted → filed → running → paused_budget | done | failed | cancelled`, with the reservation and hard cap recorded on the row and mirrored to aiur's spend cap (E01-4).

### E01-13: The daily allowance is per member, reset at local midnight, shown as a friendly unit (A4); under subscriptions the unit is api-equivalent dollars
- Claim / current behavior: C2 §5 left "whose allocation" and "reset period" open; `questions-or-commands.md` A4 takes daily per member, reset at local midnight, friendly unit. A9 says hosted builds run on the Codex/Claude subscriptions signed in here, so no vendor invoice exists; aiur reports `api_equivalent{amount, coverage}` per ticket.
- Source and exact locus: C2 §5 lines 229-237; A4, A9; `ticket_usage.ex:195` [V].
- Why it matters: allowance arithmetic needs one unit; api-equivalent USD is the only one aiur produces for subscription runs.
- Confidence and freshness: [V] for the fields; [I] that coverage is adequate.
- Contradiction or open question: **A9 contradicts B1 §4 ("no subscription may power the hosted multi-user builder")**; Kevin's memory notes classify this instance as personal, family-only use. Not a T01 decision; flag for the decisions file.
- Suggested requirement/decision impact: allowance and budgets are stored in api-equivalent USD (integer micro-dollars); the display unit is a per-family admin setting; the reset timezone is a family setting defaulting to the host's zone (America/Los_Angeles per C2 §1's timestamps [I]).

### E01-14: Budget-aware voice needs three read-only tools served by this backend; admission re-checks
- Claim / current behavior: `budget_status()`, `estimate_change(summary, gameId)`, `queue_change(plan, start: now|at_reset)`; the voice agent never reserves money; queued-at-reset jobs start automatically and notify.
- Source and exact locus: C2 §5 lines 215-233; release plan "Budget-aware voice" [V].
- Why it matters: T06 consumes these; the estimate model needs history that does not exist at launch.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: ship a seeded size-class table (small/medium/large/huge → cost range, confidence low) and refine from `jobs` history; `queue_change` is `POST /api/v1/jobs` with `start`.

### E01-15: Bug intake is deterministic: private bundle, signature dedupe, rule-based routing, auto-repair only for reproducible crashes within the allowance
- Claim / current behavior: one report button; the bundle goes to private storage, never GitHub; signature = hash(error type, normalised message, top in-game frames after source mapping, gameId); platform if the frame is outside the iframe or the signature repeats across two games; game repair is a `game_repair` job sharing edit slots at about one-third of a feature's reservation, 2 attempts placeholder (D5: decide after measurement); platform bugs are filed by a write-only `gm-reporter` identity without `agent:todo`.
- Source and exact locus: `B8…md:136-170`; `spec-v0.4.md:517-537`; decision log picks D2/D3/D5 [V].
- Why it matters: it is the only path where a player can cause spend; the deterministic rules are the guard.
- Confidence and freshness: [V].
- Contradiction or open question: the two GitHub Apps (`gm-intake`, `gm-reporter`) are free but only Kevin can create them; with self-hosting, T03 may instead use the `gh` credentials already here. Which identity files platform issues is T03's call.
- Suggested requirement/decision impact: `reports` and `report_signatures` tables; the repair job is ordinary admission with `kind = repair`.

### E01-16: Notifications are browser push plus in-app status; no email/SMS fallback in V1
- Claim / current behavior: spec §5.22 accepts the iOS home-screen-install constraint; the architecture doc lists three triggers: finished builds, queued changes starting, intake reports. No provider spend is allowed.
- Source and exact locus: `spec-v0.4.md:663-669`; architecture FEATURES "Notifications" [V].
- Why it matters: Web Push with self-generated VAPID keys is free and needs no vendor; an SSE feed covers the open tab.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: `push_subscriptions` table; `notifications` table with `read_at`; `GET /api/v1/notifications/stream` (SSE).

### E01-17: Mandatory email means a mail sender, and no paid provider is allowed
- Claim / current behavior: email is the recovery path on every account (decision log). No SMTP relay or sender is decided anywhere in the research; `which sendmail` was not part of the brief's checks and is unverified here.
- Source and exact locus: decision log "Sign-in"; B10 §2 row 1 [V]; absence of any sender decision [M grep over research: none].
- Why it matters: magic links and invitation emails cannot go out without a sender; blocking sign-up on it would block the checkpoint.
- Confidence and freshness: [V] gap.
- Contradiction or open question: open.
- Suggested requirement/decision impact: **default: a `MailSender` interface with a `console/admin-inbox` implementation (links shown to an admin in the admin UI) and an SMTP implementation Kevin can point at a Gmail app password later, free** [O]. Add a `remind` item.

### E01-18: Admin visibility of build analytics follows the oversight scope; no prompt or source text is stored
- Claim / current behavior: C2 §1 and the release plan: categories, timings, counts only, mirroring aiur's `lifecycle.ex:1-8` privacy rule; admins see per-build timelines and roll-ups per game and member.
- Source and exact locus: C2 §1 lines 66-98; `release-plan.md:31`; A12 drops cell suppression for adults [V].
- Why it matters: shapes the event schema and the retention rule.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: the event `meta` field is an allow-listed set of scalar keys; validation rejects anything else.

## 3. Existing owners and reuse targets

| Capability | What exists today | Keep / port / replace | Why |
|---|---|---|---|
| HTTP API server | nothing in repo; `hono` 4.13.13 and `express` 5.2.1 only in unrelated projects under `~/github` [M] | new (Hono, TS, tests: none yet) | REST needed by non-TS callers (aiur hooks via curl, voice tools from Elixir, rooms) |
| Auth | nothing; A7's Better Auth research only | new (`better-auth` + `@better-auth/passkey`, pinned) | decided library; no local copy to reuse |
| Database | nothing; aiur uses files + SQLite (`~/.aiur/github-budget/budget.sqlite3`) [M] | new: SQLite WAL + Drizzle ORM + drizzle-kit migrations | zero install, file backups, one host (E01-2, E01-3) |
| Usage, spend cap, cancel, pause, resume, state | aiur `src/lib/aiur_web/routes/{api,usage}.ex` (Elixir, aiur's own tests) [V] | keep, consume over HTTP | closes B8 gaps 1, 2, 5 (E01-4) |
| Telemetry / phase timeline | aiur `run_telemetry/*` ndjson + `GET /api/v1/:issue/usage` by run [V] | keep; join by `{repo, issue, run_id}` | aiur accepts no custom events (E01-5) |
| Per-ticket limits | aiur `.aiur/config` `max_turns_by_complexity`, `max_agent_duration_minutes`, `max_dispatches_per_ticket` (B8 §5) | keep, set in each game repo's config (T02) | backstop under admission |
| systemd user unit pattern | `scripts/drive-sync/ogm-drive-sync.service` (T11 owns) | keep as template | linger is on (§7) |
| Asset usage-rights enforcement at build/publish | `docs/research/v0.5/schemas/asset-card.schema.json` + validator (T05) | consume: policy module calls T05's rights check at publish | C2 §10 |
| Prototypes (`studio-v0`, `ui-v0`, `title-city`) | static JS, no server | not reused by T01 | throwaway per README precedence |

## 4. Interfaces and contracts this track defines or consumes

**Owner T01: policy module** (`packages/policy`), consumed by every service route, T07 room `onAuth`, T08 publish.
```ts
type Actor = { userId: string; platformRole: 'maintainer'|'admin'|'none'; capability: 'creator'|'player'; familyId: string };
type Action = 'game.create'|'game.edit'|'game.publish'|'game.play'|'game.fork'|'job.create'|'job.cancel'|'member.invite'|'admin.budget.set'|'report.file';
export function authorize(actor: Actor, action: Action, resource: { gameId?: string; ownerId?: string; familyId?: string; visibility?: 'listed'|'private' }): { ok: true } | { ok: false; reason: string };
```

**Owner T01: job admission** (`services/api` route; T02 implements the aiur side; T06 calls it from `queue_change`).
```http
POST /api/v1/jobs
{ "gameId": "g_01J…", "branchId": "main", "kind": "new_game"|"feature"|"repair", "complexity": 1-5,
  "plan": { "title": "...", "summary": "...", "scope": {"included": [], "excluded": []}, "tickets": [ {"key": "...", "skills": [], "dependsOn": [], "acceptanceCriteria": []} ] },
  "start": "now"|"at_reset", "idempotencyKey": "fork:…|voice:<sessionId>:<n>" }
→ 202 { "jobId": "j_…", "state": "queued"|"admitted", "reservation": {"amountMicroUsd": 3000000, "sizeClass": "medium", "confidence": "low"}, "slot": "edit", "position": 2 }
→ 402 { "error": "allowance_exceeded", "remainingMicroUsd": 1200000, "resetsAt": "2026-11-01T07:00:00Z", "offers": ["trim","split","queue","ask_admin"] }
```
Job row fields the other tracks read: `aiurRepo`, `aiurIssueNumber`, `aiurSpendCapMicroUsd`, `state`, `pausedReason`, `usageMicroUsd` (reconciled from `GET /api/v1/:issue/usage` `api_equivalent.amount`).

**Owner T01: budget tools for voice** (consumed by T06 through `voice_converse` tool calls; all GET except queue).
```http
GET  /api/v1/budget/status?userId=…      → { "remainingMicroUsd", "remainingPercent", "unitLabel", "resetsAt", "freeSlots": {"new_game":1,"edit":2}, "queued": [jobId…] }
POST /api/v1/budget/estimate { "gameId", "summary" } → { "sizeClass": "large", "rangeMicroUsd": [4e6, 9e6], "confidence": "low", "fits": false }
POST /api/v1/jobs  (as above, start: "at_reset")
```

**Owner T01: analytics ingestion** (emitted by the `gm` CLI (T05), gm-* skills (T10), the editor (T09), the SDK playtest hook (T04)).
```json
POST /api/v1/analytics/events  (bearer: job token or session)
{ "events": [ { "ts": "2026-10-31T09:12:03Z", "gameId": "g_…", "jobId": "j_…", "aiurRunId": "…?", "attemptId": "…?",
   "actor": "agent"|"human", "activity": "asset_pipeline"|"level_building"|"gameplay_code"|"animation_vfx"|"audio"|"ui_hud"|"playtesting"|"deploy_release"|"writing",
   "boundary": "start"|"end"|"point", "source": "gm_cli"|"skill"|"editor"|"sdk"|"manifest_path", "meta": { "command": "gm verify", "system": "combat" } } ] }
```
`meta` keys are allow-listed; no free text beyond a command name. Admin read: `GET /api/v1/admin/builds/:jobId/timeline` merges aiur phases (from usage/telemetry) with OGM activities.

**Owner T01: bug reports** (consumed by T09 button, T04 SDK bundle builder, T03 for the GitHub write).
```http
POST /api/v1/reports  { "gameId", "releaseId", "buildHash", "text"?, "error"?: {"type","message","frames":[…]}, "bundleKey": "<private bucket key from T05 signed upload>" }
→ 201 { "reportId", "signature", "route": "game_repair"|"platform"|"editor_hint"|"stored", "jobId"? }
```

**Owner T01: age gate + auth** (Better Auth mounted at `/auth/*`; T09 renders the screen).
```http
POST /auth/age { "birthMonth": 1-12, "birthYear": 1900-2026 } → 204 + cookie `ogm_age=<signed band>` | 403 (nothing stored)
```
Sign-up, magic-link and the Google OAuth start require the cookie.

**Owner T01: notifications**: `POST /api/v1/push/subscriptions { endpoint, keys }`; `GET /api/v1/notifications/stream` (SSE `event: build.done | job.started | intake.report`).

**Consumed from T02**: an `AiurClient` with `setSpendCap(issue, usd)`, `usage(issue)`, `cancel(issue)`, `pause/resume`, `issue(issue)` state projection. **Consumed from T05**: `assertUsageRights(gameId, 'publish')`. **Consumed from T11**: env file path and the public hostnames for `trustedOrigins`.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T01-a | Backend skeleton: Hono + Drizzle + SQLite + env + health | `services/api` boots under systemd-user, `GET /healthz`, migrations run, `packages/db` schema package, `packages/contracts` zod types | `services/api/*`, `packages/db/*`, `packages/contracts/*`, root `package.json`, `pnpm-workspace.yaml` | 2 | T12 monorepo layout | auth, any product route |
| T01-b | Auth: Better Auth with email magic link, passkey, Google; age gate; same-origin proxy | sign-up refused under 18; passkey and Google work from the Netlify origin on iPhone; `MailSender` interface with admin-inbox default | `services/api/src/auth/*`, `packages/db` auth tables, `netlify.toml` proxy block, `apps/web` only the redirect config | 3 | T01-a; T11 public hostname | the React screens (T09), SMTP credentials |
| T01-c | Accounts, families, invitations and the policy module | families, members, roles, owner/admin rules, invite tokens (member/play/room kinds), `authorize()` with the A7 matrix as a test table | `packages/policy/*` (+ tests), `services/api/src/accounts/*`, `services/api/src/invites/*` | 3 | T01-a | UI, room protocol (T07) |
| T01-d | Job admission, budgets, allowance and aiur spend-cap reconciliation | jobs table and state machine, slots 1+3, repairs share edit, reservation table seeded by size class, per-member daily allowance with local-midnight reset, pause at 1×, stop at hard cap mirrored to aiur, queued-at-reset scheduler | `services/api/src/jobs/*`, `services/api/src/budget/*`, `packages/contracts/jobs.ts` | 4 | T01-a, T01-c; T02 `AiurClient` contract | filing issues or hooks (T02), voice prompts (T06) |
| T01-e | Build-analytics ingestion, aiur join and admin read API | events endpoint with the 9-activity taxonomy, allow-listed meta, join to aiur usage by run id, per-build timeline and per-game/member roll-ups | `services/api/src/analytics/*`, `packages/contracts/analytics.ts` | 3 | T01-a, T01-d (job ids) | emitting events from gm CLI/skills (T05/T10), the charts (T09) |
| T01-f | Bug-report intake, dedupe, routing and repair admission | reports table, signature hash, deterministic classifier, repair job via T01-d, platform route handed to T03's GitHub writer | `services/api/src/reports/*`, `packages/contracts/reports.ts` | 3 | T01-d; T05 signed upload; T03 issue writer | the SDK bundle builder (T04), the button (T09) |
| T01-g | Notifications: Web Push + SSE feed | VAPID keys generated at first boot into the env dir, subscriptions, notification rows, three triggers wired | `services/api/src/notify/*` | 2 | T01-a, T01-d | service worker/UI (T09) |
| T01-h | Voice budget tools and estimate model | `budget/status`, `budget/estimate`, `jobs start=at_reset` with seeded size classes and refinement from history | `services/api/src/budget/estimate.ts`, `packages/contracts/budget.ts` | 2 | T01-d | voice conversation rules (T06) |
| T01-i | Admin API: membership, budgets, concurrency, oversight listing | admin-only routes for every setting the release plan names; platform cap visible; game listing and delist | `services/api/src/admin/*` | 2 | T01-c, T01-d | admin React views (T09), editing others' games |

## 6. Risks and unknowns

1. **Cross-site auth on iPhone** (E01-8). Default: Netlify 200-rewrite proxy for `/api/*` and `/auth/*`; WebSocket services use API-minted short-lived tokens. Spike: 30 minutes on a real iPhone once T11 has a hostname.
2. **Subscriptions powering hosted builds vs B1** (E01-13). Default: proceed under A9 for this family instance; record the contradiction in `decisions.md`; the unit is api-equivalent USD.
3. **`api_equivalent.coverage` under subscription runs** may be partial. Default: treat uncovered usage as the reservation (pessimistic) until T02 confirms.
4. **Email sending without spend** (E01-17). Default: admin-inbox sender; `remind` Kevin to supply an SMTP app password.
5. **Google OAuth client** must be created by Kevin (free, testing mode, ≤100 users suffices). Default: `remind`; passkey and magic link work without it.
6. **SQLite with more than one process** (rooms, intake worker). Default: only `services/api` opens the DB; other processes call the API. Fallback: Postgres 17 via apt (sudo).
7. **`node:sqlite` is experimental; `better-sqlite3` needs a native build** (prebuilt binaries come over the network at install, which is allowed for tickets). Default: `better-sqlite3` through Drizzle; swap to `node:sqlite` later if the warning is the only cost.
8. **Better Auth version drift** since A7's 1.7.12. Default: pin whatever the installing ticket resolves and note it in `decisions.md`; both packages on the same minor.
9. **Daily reset timezone**. Default: family setting, initial value the host zone.
10. **Platform-wide cap vs spec §8.3's "no hidden cap"**. Default: explicit, admin-visible, default = sum of member allowances.
11. **Repair numbers** (D5: after measurement). Default: 2 attempts, one-third of a feature's reservation, all in config.
12. **Who creates `gm-intake`/`gm-reporter`** GitHub identities. Default: T03 decides; T01 exposes the report route with a pluggable `IssueWriter`.

## 7. Self-hosting notes

Checked read-only on this host (2026-10-31) [M]:
- `which psql postgres pg_ctl sqlite3 redis-server podman caddy nginx` → none. `which docker` → `/usr/bin/docker`, but `docker info` fails with "permission denied … docker.sock" (user not in `docker` group).
- `node` v24.14.0 (`~/.nvm`), `npm` 11.9.0, `pnpm`, `yarn`, `bun` present; `python3` 3.13.5 with sqlite 3.46.1; `node -e "require('node:sqlite')"` works with an ExperimentalWarning.
- `apt-cache policy postgresql` → candidate 17+278, not installed; `sqlite3` CLI candidate 3.46.1, not installed (libsqlite3 is).
- `systemctl --user --version` → systemd 257; `loginctl show-user $USER -p Linger` → `Linger=yes`, so user units survive logout (T11's pattern from `scripts/drive-sync/ogm-drive-sync.service` applies).
- aiur runtime state is under `~/.aiur` (SQLite budget store, ndjson telemetry per boot); the OGM backend reads none of it directly, only aiur's HTTP API (E01-4, E01-6).

What changes because it is this machine and not Railway:
- No managed Postgres: SQLite file under a data directory T11 names (recommend `~/.local/share/ogm/api/ogm.sqlite3`, mode 0600, WAL), backed up by file copy in T11's backup job.
- Secrets (`AIUR_API_TOKEN`, Better Auth secret, Google client secret, VAPID private key, SMTP password) live in one env file with 0600 permissions loaded by the systemd user unit; the sandbox (T03) must not inherit that environment.
- The backend's public hostname and TLS come from T11; Better Auth `baseURL`, `trustedOrigins`, passkey `rpID` and the Google redirect URI all depend on it, so T01-b cannot finish before T11 names the host (a placeholder `localhost` config lets tests run).
- Netlify keeps the frontend; the `/api` proxy rewrite in `netlify.toml` is the one Netlify change this track needs.
- Nothing in this track costs money: Web Push (own VAPID keys), magic links (own sender), Better Auth, Drizzle, SQLite and Hono are all MIT/Apache and above 1k stars [I, from A7 and general knowledge; not re-verified offline].
