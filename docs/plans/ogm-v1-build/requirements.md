---
date: 2026-10-31
topic: ogm-v1-build
---

# Open Game Maker 2000 V1: requirements

Written from the release plan (`docs/spec/release-plan.md` §2), the decision log, C1–C4 and the twelve evidence packets in `evidence/`, with the self-hosting change and the assumptions in `questions-or-commands.md`. Deep-product tier. Requirement IDs are stable and referenced by `tickets/*.md` and `build-order.json`.

## Problem Frame

An adult signs in, talks or types a game idea, agrees a scope, and coding agents build it from asset packs and code while the creator watches and talks back. The creator plays, edits while builds run, branches, publishes, and invites friends to play along. Everything server-side runs on Kevin's second machine; the frontend stays on Netlify; no money is spent and no provider keys are added.

Today the repository holds research, three throwaway prototypes (the live title screen among them), tested Python asset workers and the asset-card schemas. There is no TypeScript, no backend, no SDK, no CI. V1 is a greenfield build of the product on that research, with the prototypes' proven contracts carried over and nothing else.

---

## Actors

- A1. Creator: an adult member who makes games by voice or text and edits them.
- A2. Player: an adult member or invited friend who plays games, in rooms or alone.
- A3. Admin: a family admin who manages members, invites, allowances, concurrency, the Drive folder and oversight. The owner is an admin who cannot be removed.
- A4. Operator (Kevin): runs the instance on this machine; approves spend, licences and rights decisions; the only human merger of the platform repo.
- A5. Build agent: an aiur worker (Codex or Claude) implementing one job ticket inside a creator's game repo, loading `gm-*` skills.
- A6. Executor: the aiur-run operator of the platform build (this session), reviewing and merging platform PRs.
- A7. Platform services: the API, rooms, commit, intake and verify services on this machine; the aiur daemons; the Netlify frontend.

---

## Key Flows

- F1. Make a game
  - **Trigger:** A1 presses New game.
  - **Actors:** A1, A5, A7
  - **Steps:** choose genre, vibe, style family, world, single/multi, point of view (options come from the pack catalog and the SDK); the scope chat (text, dictation, or voice when available) ends in a plan; the backend checks the plan's estimate against today's allowance and offers trim / split / queue / ask-an-admin when it doesn't fit; admission reserves a slot and money and files an aiur ticket in the creator's repo with a spend cap; the agent scaffolds from a template, chooses assets from cards, builds, runs `gm verify`, posts stills and clips to the build chat; the PR merges by the platform's gate; the build lands in the bucket and plays in the game iframe.
  - **Outcome:** a playable draft build on `main`, the creator having seen it take shape.
  - **Covered by:** R1–R6, R10–R14, R20–R27, R40–R46, R50–R55, R60–R64

- F2. Edit while it builds
  - **Trigger:** A1 opens Edit on a game.
  - **Actors:** A1, A7
  - **Steps:** the editor framework shows the controls the build's manifest declares; each change becomes a transaction on the branch's log, applied through the bridge at once; overrides ride on top of the latest build; when a new build lands, overrides are re-applied with a report (kept / renamed / needs a choice / conflict / dropped); undo and redo work across the session.
  - **Outcome:** the creator never waits on an agent to tune the game.
  - **Covered by:** R30–R36, R65–R67

- F3. Play with friends
  - **Trigger:** A1 presses Invite.
  - **Actors:** A1, A2, A7
  - **Steps:** the backend issues a room-scoped invite link; the friend signs in (age screen, family allowlist), lands in the room as a watcher of the editor stream; Play moves everyone into gameplay within one round trip; each player reads only their own controls and sees their own camera and HUD; the owner's browser runs the simulation; if the owner leaves, the session ends with progress saved.
  - **Outcome:** online play with no game code on the server.
  - **Covered by:** R70–R78

- F4. New assets arrive
  - **Trigger:** A4 drops files in the Drive folder.
  - **Actors:** A4, A7
  - **Steps:** the listener waits for uploads to settle, downloads to quarantine with strict default rights; intake identifies the collection, checks licences, unpacks safely, measures, renders contact sheets, writes cards; unknown licences wait for A4; the collection becomes searchable at once and a creation choice only if it completes a style family.
  - **Outcome:** agents can use the drop without anyone editing JSON by hand.
  - **Covered by:** R80–R88

- F5. Version and publish
  - **Trigger:** A1 presses "New version from here" or Publish.
  - **Actors:** A1, A7
  - **Steps:** a version is a Git branch plus a fork point in the design log; each version builds and plays on its own; merge back is a Git merge for code and a three-way merge by stable id for design, with only real conflicts walked through with side-by-side previews; Publish folds overrides into `design/*.json` on `main` through the commit service, tags, writes a release row and moves one pointer; rollback is a new release pointing at an older pair.
  - **Outcome:** one published line, every version playable, rollback without an agent.
  - **Covered by:** R37–R39, R90–R96

---

## Requirements

**Accounts, sign-in and family**
- R1. Every account has an email; sign-in is passkey and/or Google through Better Auth, email magic link as recovery, no passwords (A10).
- R2. A neutral 18+ age screen (birth month and year) precedes sign-up and any OAuth start; refused users leave nothing but a cookie; adults record `age_band` and an attestation time.
- R3. Families have an owner and admins; admins manage members and invites, allowances, concurrency, the Drive folder and oversight (list, delist, abuse) and cannot edit or take over another adult's game.
- R4. Invitations are single-use hashed tokens bound to an email with kinds member / play / room; V1 allows family members only, with an admin allowlist switch for friends (A2).
- R5. Authorization is one tested policy module (`authorize(actor, action, resource)`, deny wins) that every service route, the room's auth and publish call.
- R6. Each creator connects their own GitHub at setup; the platform creates one repo per game (public or private, the creator's pick; paid-pack assets force private).

**Money and admission**
- R10. Each member has a daily allowance set by an admin, reset at the family's local midnight, shown in a friendly unit; amounts are stored as api-equivalent micro-dollars (A4, E01-13).
- R11. Admission is deterministic code: slots (default 1 creation + 3 edit builds per family, repairs share edit slots), a reservation by size class, pause and ask an admin at 1× the reservation, a hard cap mirrored to aiur's per-ticket spend cap, a platform-wide cap that is admin-visible.
- R12. A request that doesn't fit today's allowance gets four offers: do it now (if an admin raises it), trim, split, queue for the reset; queued jobs start themselves and notify.
- R13. Usage is reconciled from aiur's per-ticket usage endpoint by run id; reservations are released on terminal states.
- R14. No spending, no provider API keys: agents run on the Codex and Claude subscriptions signed in on this machine (A9).

**Creation and the build chat**
- R20. Creation offers genre, vibe, style family (from `style-families.json`), world, single/multiplayer and point of view (filtered by family and genre), with "Other" by typing or dictation; the choices are recorded in the game's lockfile.
- R21. The scope chat and the build chat accept text and browser dictation always, and two-way voice behind a capability flag when a voice provider is configured; nothing in V1 requires a paid provider.
- R22. During a build the agent posts stills and short clips at each visible step (the design skill requires one after every `gm run`); the creator can reply mid-build; posts are text, image, clip or choice.
- R23. Direction checkpoints: for a decision the agent judges important, it posts 2–5 quick options (clips or stills) as a `choice` post and pauses only the work that depends on the answer.
- R24. The build chat shows aiur phase, friendly progress, usage in the friendly unit, and queued-at-reset jobs with edit and cancel.
- R25. Image upload accepts any image including photos of drawings; EXIF is stripped server-side; restyling is out of V1.
- R26. Every job is one aiur ticket in the creator's repo, labelled with complexity and `feature:gm-<jobId>`, with the spend cap set before `agent:todo`, nudged with `control todo`.
- R27. Job state is projected from aiur lifecycle events into creator words (waiting for robot capacity, building, running final tests, fixing a problem, ready to try, out of budget, failed).

**Editor and design state**
- R30. The editor framework is host-owned: rail, palette, inspector with scope labels, tools, gizmo overlay and snap preferences, driven by the manifest the game declares.
- R31. Every edit is a transaction `{branchId, rev, baseRev, leaseToken, actor, kind, label, commands, patches, inverse}` against entities keyed by stable host-minted ids; the log is append-only per branch and is the source of truth; the working set is a cached reduction.
- R32. A single-writer edit lease per `(gameId, branchId)` with heartbeat and fencing; a second device of the same user takes over silently; admins never take over.
- R33. Overrides apply on top of the latest build at once; when a new build is tested, a re-apply report classifies each entry (carried / renamed / needs a choice / conflict / dropped) using manifest hints; the creator's value wins unless the job targeted that control.
- R34. Undo and redo are per session over transactions; strokes and drags coalesce into one transaction.
- R35. The design transaction stream is served as SSE per branch and relayed unchanged to room watchers.
- R36. A design snapshot at any revision is readable (for watcher catch-up and merges).
- R37. Branches ("versions"): a Git branch plus a fork point `(parentBranchId, parentRev)`; `main` is a branch with no fork point; cap 5 active; archive, never delete; builds, saves, rooms and analytics carry `branchId` (A1).
- R38. Merge: base at the fork point, last-write-per-path reduction on each side, automatic where one side changed or both agree, conflicts of kind both_changed / delete_vs_edit / control_removed resolved per conflict or all-mine, landing as one merge transaction with a preview build first; code merges through Git with an agent job only on conflict.
- R39. Agent code jobs run on `main` only in V1 (aiur has one base branch per repo); branches diverge in design state and in Git only through fold and merge; the gap is filed upstream.

**Releases, saves, forks, achievements, creator analytics**
- R90. Publish requires a tested build on `main`; it folds the working set into `design/*.json` deterministically through the commit service behind the content gate, tags `gm/<gameId>/v<version>`, appends a release row and moves `publishedReleaseId` by compare-and-set (A3).
- R91. Version numbers follow Kevin's counter scheme (major per publish, minor per agent build, patch per hand edit), derived, with `saveSchemaVersion` as the only compatibility signal.
- R92. Rollback creates a new release pointing at an older `(build, snapshot)`; saves on newer schemas become `incompatible_after_rollback`; nothing is deleted; every tested build artifact is kept.
- R93. Changelogs are assembled without a model call from `.gm/changes/<jobId>.md` notes and transaction labels; the update indicator polls the published release with an ETag.
- R94. Saves: cloud autosave plus three manual slots, OCC revisions with a device lease and an IndexedDB outbox, lazy one-step migration from the predecessor release only.
- R95. Forks copy the published design, assets and achievement definitions into a new game and repo in the creator's GitHub, never runtime data; rights are re-checked.
- R96. Achievements are permanent awards keyed by slug from `achievements.json`, idempotent, never awarded in drafts; creator analytics are first-party events with pseudonymous ids, daily rollups, 90-day raw retention, drafts excluded.

**Engine SDK and game host**
- R40. One message-based engine–editor contract (versioned envelope, Zod schemas, JSON Schema and fixtures emitted) over a hand-written MessageChannel bridge with origin check, size cap and rate limit; games run in a separate-origin sandboxed iframe on the games domain.
- R41. `@gm/sdk` wraps Three.js r186 + Rapier (3D) and Phaser 4.2 (2D) behind one `GameModule`/`GameInstance` interface: `applyDesign` deterministic, `serialize`/`restore`/`migrate`, pick and placement validation, per-player multiplayer hooks.
- R42. Test hooks on every game: `ready`, `advanceTime(ms)` (fixed step, no render), `renderAt(ms)`, `renderGameToText()`, `renderInfo()`, `hitTest`, `setSeed`, `inject`; reachable over the bridge always and as window globals only in draft and test builds.
- R43. Seven camera rigs (iso, topdown, side, follow, fps, orbit, fixed) with their input mappings and occlusion handling; one instance per local player; the editor keeps its own camera plus "view as player".
- R44. Input: the host is the only gamepad reader and owns the touch overlay (declared actions, 64 px primary targets); the SDK merges host frames and in-iframe keys into one `ActionFrame` per player.
- R45. Device tiers: `pickTier()` once at startup from capability signals plus frame-time downgrade and a `?tier=` override; the loader reads `assets/manifest.json` and never derives file names.
- R46. Audio: SDK-owned context with buses, unlock on first pointerup, `audioSession` playback, ZzFX, optional Tone.js `song.json`, MP3 samples, offline `renderCue`, and an `audio.relay` fallback to the host for iOS.
- R47. Conformance (`gm-sdk check`): the nine A4 checks plus B7's two, runnable on this machine's GPU with a SwiftShader fallback.
- R48. `@gm/sdk` adds `fx` (pixelfx adapter, data-driven 3D sprites), `nav` (grid A*, recast lazily behind a capability), `proc` (seeded FastNoise Lite); Jolt and Effekseer are out of V1.

**Assets**
- R50. The `gm` CLI is one binary with namespaces owned by different packages: `assets`, `packs`, `maps`, `build`, `check`, `run`, `shot`, `perf`, `docs`, `progress`, `new`, `test`, `changes`.
- R51. Metadata cards (C3 schema, moved unchanged into the contracts package) describe every collection and asset; the rights engine (`effective()` with the negative fixtures as tests) runs in the CLI, the backend and the commit check; cards gain `processing: local-only | any`, defaulting to local-only for every `LicenseRef-*` and quarantined collection.
- R52. All 414 packs get schema-valid collection cards with SPDX or `LicenseRef-*` licences; 3D/2D asset cards come from code measurement, filename seeds and local CLIP lift-ranking on contact sheets (no paid vision pass); audio and map cards keep their Python taggers.
- R53. `gm assets use` writes `assets.lock.json` (rights source of truth) and `CREDITS.md`; `gm check assets` enforces rights at build and publish; `gm packs blocklist` feeds the commit service a hash blocklist of non-redistributable bytes.
- R54. `gm build assets` tiers a game's used assets at build time (weld, quantize, meshopt, WebP, MP3; KTX2 behind a flag) into content-hashed files and a manifest with licence per asset; `gm verify` fails builds over the mobile budget.
- R55. Style families: a curated `style-families.json` (seven C2 families, views per family, coverage report); one family per game enforced in search by default with logged exceptions; Kenney families first until FBX conversion exists.
- R56. The bucket is a filesystem-backed content-addressed `BlobStore` on this machine served through HMAC-signed URLs by the API, with the S3 adapter a later flip; originals in `assets-local/` are never moved.
- R57. Tier 2 sources ship as pinned mirrors (`gm packs sync`); live API adapters and paid generators are out of V1; tier 3 is agent-made (code-drawn or procedural) and registered with provenance.

**Drive intake and map inspiration**
- R80. The Drive listener (`drive_sync.py`, kept) runs as a user service; its queue, quarantine manifest and `intake.json` are the intake contract.
- R81. `gm packs import` performs identification, safe unpack, measurement, previews and card creation for any drop; `gm-asset-intake` shrinks to licence judgment and the admin's confirmation.
- R82. Collections of any size are indexed at once; curation marks the ones that complete a style family as creation choices.
- R83. Tabletop maps enter as inspiration collections, become layout specs, and are searchable by structure; map images never ship in games; `gm-map-inspiration` adapts layouts to the game's tiles, family and point of view with a reachability check.
- R84. The admin UI shows intake status and reports read-only; the folder id stays in the operator's TOML.
- R85. Processed Drive files stay where they are (A6).
- R86. Intake, tagging and previews run on this machine with `nice` and bounded workers.
- R87. FBX conversion is a pluggable worker that activates when Blender is installed (a `remind` item for Kevin).
- R88. Every asset command emits an activity event to the job's event sink.

**aiur, sandboxing, commit service, hosting**
- R60. The backend drives aiur over its HTTP API through a typed client: usage, progress, spend cap, cancel (confirmed exit), pause/resume, message, `control todo`, accounts, events; one write token per daemon; reads and writes carry Origin and `X-Aiur-Request`.
- R61. One aiur daemon per active game repo under a systemd template unit, started on first admitted job and stopped after idle, capped (default 4 live daemons), each rendered from a config template with `instance.mode: local`, `priority: [codex, claude]`, per-ticket limits, hooks and events export.
- R62. Game repos are provisioned by template, not by the interactive wizard: `.aiur/*`, labels, `ci.yml` with `ci / required`, `.claude/skills/gm-*`, `.codex/skills` and `.agents/skills` links, `AGENTS.md`, `skills.lock`.
- R63. Coding agents and build/verify steps run in per-job isolation on this machine using what the host offers without spending (bubblewrap/userns/cgroups; design in `decisions.md` D-SBX), with an egress allowlist, no secrets inside, and a model proxy or equivalent so provider credentials never enter the sandbox.
- R64. The commit service is the only writer to creators' GitHub repos (fold, tag, branch, fork, repair issues, PR merge for creators' games), runs the publication content gate and the hash blocklist on public repos, and holds the GitHub credential alone.
- R65. The `after_create` hook fetches a job bundle (skills version, game context, diagnostics) from the backend with a per-daemon secret; the bundle never contains provider keys.
- R66. Build analytics: a fixed nine-activity taxonomy; events recorded at the source (gm CLI, skills, editor, SDK playtests), joined to aiur run ids; admins see per-build timelines (aiur phases plus activities), cost and retries, and roll-ups; no prompt or source text is stored.
- R67. Notifications: Web Push with self-generated VAPID keys plus an SSE feed; triggers are finished builds, queued jobs starting, intake reports.
- R68. Bug reports: one button; a private bundle; signature dedupe; deterministic routing (game repair / platform / editor hint / stored); only reproducible crashes auto-repair, sharing edit slots, with a generated failing promise test that then runs forever; platform bugs file into the platform repo without `agent:todo`.
- R69. Hosting on this machine: every service is a `systemd --user` unit with an env file (0600) it alone reads; a reverse proxy with TLS and public hostnames for the API, rooms, voice and the games domain (wildcard for per-game subdomains); SQLite (WAL) owned by the API through Drizzle; backups by file copy; agents and taggers under CPU weights below the services; the frontend proxies `/api/*` and `/auth/*` so cookies stay first-party.

**Multiplayer**
- R70. A generic relay-only Colyseus room per session on this machine; the owner's browser is the simulation authority; no game code on the server.
- R71. Room state: pin `(gameId, branchId, buildId)`, owner, phase, members with server-assigned `playerIndex`, presence with `privateMode`, `lastRev`, `maxPlayers` (default 4, ceiling 8).
- R72. Grants are HS256 tokens signed by the backend binding user, room, role and expiry; the room verifies them with no network call; revocation lists are pushed.
- R73. Watchers receive the design transaction stream after the backend accepted it and catch up from a snapshot at a revision; a gap triggers `resync`.
- R74. Play is broadcast with a server timestamp; peers switch on receipt; the first snapshot carries the spawn set; late joiners load the pinned build and design at `playRev`.
- R75. Inputs are relayed to the host with `playerIndex` stamped by the server; snapshots and events flow host → peers with size and rate caps; the SDK interpolates.
- R76. Private panels never reach the wire: no field can hold prompt text, patches are validated to design paths, presence is zeroed in `privateMode`, and the two-client verify asserts a canary never appears.
- R77. Owner drop → `pausedForHost`, 120 s reconnection, then `ended: host-left` recorded by the backend; players 60 s; idle rooms dispose after 5 minutes.
- R78. Every game follows `gm-multiplayer-ready` from day one; the multiplayer template has two spawns and two HUDs; single-player → multiplayer is an ordinary edit job ending in the two-client verify.

**Agent skills and verify**
- R100. The `gm-*` skill pack ships inside each game repo (`gm-core`, `gm-verify`, `gm-genre-platformer` with pattern cards, `gm-input`, `gm-ui-hud`, `gm-audio`, `gm-multiplayer-ready`, `gm-scope-options`, `gm-editor-tuning`, `gm-repair`) plus a vendored engine reference layer (Phaser official, CloudAI three.js minus R3F, awesome-gamedev adaptations) pinned in `skills.lock` with an API-name checker.
- R101. `gm-core` is the router: tier order, the `gm` cheat sheet, done = `gm check`/`gm test`/`gm run` green, show-as-you-go, B15's three anti-sameness rules, the activity taxonomy.
- R102. `gm run`, `gm shot`, `gm perf` port the repo's capture tools to TypeScript on the GPU flags (renderer string reported, SwiftShader fallback) and produce a verify report JSON with budgets, rig, clients and an `unchecked[]` list.
- R103. `gm check` (L0 static: typecheck, lint banning `Math.random`/`Date.now` in simulation, hook present) and `gm test` (L1 smoke: boot, 3,600 ticks, state round-trip, HUD still) block; the worker reads the sheet and answers the binary checklist in its PR; no paid judge.
- R104. `gm new` scaffolds boot, hooks, input map, grey-box level and the skill pack; pattern cards are themeless, 300–800 tokens, with a 3-line `advanceTime` test, fetched by `gm docs pattern`.
- R105. The sameness eval (M1 duplication, M4 unasked mechanics, M5 card-default fingerprint) runs on demand before a skill change merges.
- R106. Agents never load user-level skills or plugins; the sprite-forge plugin stays an operator tool.

**Web app**
- R110. `apps/web` is Vite + React + TypeScript on the existing Netlify site with SPA fallback, the `/api` proxy, `tokens.css` from studio-v0's dark glass look, the two-cache service worker, PWA manifest, and `window.__ogmHost` behind `?test`.
- R111. The title screen keeps the castle town: poster → live reveal with no cut, the town bundle served from `public/town/`, sound and tap relay as today.
- R112. Screens: title, age, sign-in and GitHub connect, games picker with versions on the card, creation flow, game host (play/edit, platform HUD, editor framework, draft vs published, update indicator), build chat dock (FAB → bar → list), versions/releases/merge, join and watcher mode, admin and build analytics, settings.
- R113. Phone first: safe areas, `svh`, landscape-phone rules, reduced motion, 64 px primary and 44 px secondary targets, iOS audio unlock rules; a frame-by-frame phone load check before every deploy.
- R114. Deploys stay manual from this machine (no GitHub Actions deploys); the 5:30am checkpoint deploys whatever has merged.

**Platform engineering**
- R120. A pnpm workspace (`apps/*`, `packages/*`, `services/*`, `skills/*`, `templates/*`, `scripts/py/*`), TS project references, Vitest, Playwright, ESLint; CI runs lint, typecheck, unit tests and the venv-free Python tests; `ci / required` is the aggregate check.
- R121. Shared contracts live in `packages/contracts` with one file per family and an append-only barrel; schemas and fixtures are emitted from Zod and checked in.
- R122. Hot write surfaces are split by convention: directory-scanned command and route registries, one module per screen, timestamped migrations, package-local dependencies.
- R123. Tests must fail without the production change they guard; every PR carries a `## Local tests` section; the platform repo's `AGENTS.md` names the commands.
- R124. The prototypes are frozen; `studio-v0` and `ui-v0` are archived after `apps/web` deploys; `title-city` moves under the web app as a built asset.

---

## Acceptance Examples

- AE1. **Covers R11, R12, R26.** Given a member with 2.0 units left today and a request estimated at 3–5 units, when they confirm, the chat offers trim / split / queue / ask an admin; choosing queue creates a job with `start: at_reset` that files its aiur ticket at the family's midnight with spend cap = reservation.
- AE2. **Covers R33.** Given 23 overrides on build 13, when build 14 is tested with one control renamed and two removed, the report says 20 carried, 1 renamed, 2 dropped, and the editor shows the card before switching.
- AE3. **Covers R38.** Given branch B forked from `main` at rev 40, `main` changed `entities.door1.props.locked` to true at rev 45 and B changed it to false at rev 12, when merging B into `main`, the plan lists one `both_changed` conflict and everything else auto-merges.
- AE4. **Covers R73, R76.** Given a host editing with a watcher connected, when the host places three entities and types a canary string in the build chat, the watcher's effective design equals the host's at each rev and no frame received by the watcher contains the canary.
- AE5. **Covers R53.** Given a game whose lockfile holds a Synty asset, when the creator publishes to a public repo, `gm check assets --publish` exits 1 naming the asset and the rule, and the commit service refuses the fold.
- AE6. **Covers R42, R103.** Given a scaffolded game, when `gm test` runs, it boots the game headless, advances 3,600 ticks, round-trips `renderGameToText()` through `restore`, and fails if any step throws or the HUD still is blank.
- AE7. **Covers R61, R62.** Given a creator's new game repo, when the first job is admitted, a daemon unit `aiur@<slug>` starts from the rendered config, the repo has the labels and skills links, and `aiur status` for that instance lists the ticket as todo within one poll.

---

## Success Criteria

- Kevin can sign in on his phone, make a game by text, watch stills arrive in the build chat, play the draft, edit it while a second build runs, branch it, invite a family member into a room, and publish, all against services on his machine, with no money spent.
- Every requirement above has one disposition in `build-order.json` (ticket, deferred, rejected or satisfied); every ticket names its files, reuse targets verified at the researched commit, and a verification a coding agent can run.
- The platform repo stays green on `main` through the run; the 5:30am deploy carries whatever merged.

---

## Scope Boundaries

### Deferred for later

- Teens, child accounts, parental controls, guardian consent, COPPA documents, the self-hosted voice cascade (V2/V3).
- Split-screen, more than one editor at once, server-authoritative rooms, host migration, player voice chat.
- Gameplay rewind, drawing tools, image restyling, a CDN, paid generators, self-service credentials, live tier-2 API adapters, KTX2 until `toktx` exists, FBX conversion until Blender exists, a paid vision tagging pass, Jolt, Effekseer, an S3 daemon, Postgres.
- Per-ticket base branches in aiur (filed upstream), per-ticket skill injection, hosted mode on subscriptions (#5701).

### Outside this product's identity

- A kids' product: child rules live only in the V3 parental-controls module.
- A generic coding-agent dashboard: aiur owns runs; OGM owns money, slots, design state and the creator's view.
- A marketplace or redistribution of packs: paid packs stay on this instance and out of public repos.

---

## Key Decisions

Recorded with rationale in `decisions.md` (D-STACK, D-DB, D-API, D-AUTH, D-ORIGIN, D-AIUR-MODE, D-DAEMONS, D-SBX, D-COMMIT, D-BUCKET, D-TIERS, D-LOG, D-BRANCH-BASE, D-VERSION, D-ROOMS, D-HOOKS, D-VOICE-ZERO, D-VERIFY-GPU, D-SKILLS-IN-REPO, D-HOSTING).

---

## Dependencies / Assumptions

- The assumptions A1–A14 in `questions-or-commands.md` stand until Kevin answers.
- aiur `main` 0f692a45b through `scripts/aiurdev`; its HTTP API, spend caps, cancel and events feed are the integration surface (E02-1).
- Kevin's by-hand items (free): a DNS name and TLS path for the backend (T11), a Google OAuth client, an SMTP app password, Blender, installing the Drive service account (existing `remind` items).
- The host: 12 cores, 31 GB, Intel iGPU usable headless, Node 24, pnpm, Python 3.13 venvs, Playwright browsers cached, no database server, Docker socket not accessible.

---

## Outstanding Questions

### Resolve Before Planning

None: every blocking question was converted to an assumption (A1–A14) at Kevin's request to run without stopping.

### Deferred to Planning

- [Affects R63][Needs research] The exact per-job isolation recipe on this host (bubblewrap profile, egress allowlist mechanism, GPU and browser-cache pass-through for verify) — T03.
- [Affects R69][Needs research] Reverse proxy, TLS and public hostname with zero spend (Tailscale Funnel vs Caddy with a DNS name Kevin owns) — T11.
- [Affects R21][Needs research] What `voice_converse` offers on aiur main and the zero-cost voice path — T06.
- [Affects R60][Technical] Whether `api_equivalent.coverage` is complete for subscription runs (spike C0).
- [Affects R46][Technical] iOS audio inside a cross-origin iframe (real-iPhone spike).
- [Affects R100][Technical] Codex discovery of repo-shipped `.codex/skills` links (one dry run).

---

## Next Steps

-> `decisions.md` and `architecture.md` (ce-plan synthesis), then `tickets/` and `build-order.json`.
