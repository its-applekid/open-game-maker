# Architecture plan

The V1 system as the tickets will build it. Packages and services, the interfaces between them, who owns each contract, and how work is partitioned so many agents can build at once. Decisions are in `decisions.md`; evidence in `evidence/`.

## 1. Trust zones

```
Netlify (static)            This machine (trusted, loopback + Tailscale)              Untrusted, same machine
┌─────────────────┐         ┌──────────────────────────────────────────────┐          ┌──────────────────────┐
│ apps/web        │ /api/*  │ services/api   (Hono, SQLite, policy, jobs)  │ files    │ Codex sandbox per job │
│ React, Vite     │────────▶│ services/commit (GitHub App, boundary, gate) │ issues   │ bwrap+landlock, no net│
│ title town      │ wss     │ services/rooms  (Colyseus relay)             │◀────────▶│ workspace only        │
│ game iframe ────┼────────▶│ services/games-host (static, CSP)            │ aiur     │ gm CLI, skills        │
└─────────────────┘         │ services/voice-host (Elixir, voice_converse) │ HTTP+WS  └──────────────────────┘
                            │ services/intake (Drive queue → gm packs)     │
                            │ aiur daemons (one per active game repo)      │          ┌──────────────────────┐
                            │ BlobStore (filesystem, signed URLs)          │          │ Creator's GitHub repo │
                            └──────────────────────────────────────────────┘          └──────────────────────┘
```

Secrets exist only in `~/.config/ogm/env/<unit>.env` and are read by the unit that owns them. The game iframe and the sandbox hold none. Only the commit service holds the GitHub App key.

## 2. Workspace layout

```
apps/web/                 React app (T09). public/town/ carries the title-town bundle; tools/deploy.sh
services/api/             Hono + Drizzle + SQLite: auth, policy, accounts, jobs, budgets, design log, branches,
                          releases, saves, analytics, notifications, build chat, blobs route, voice token
services/commit/          GitHub App writer: create repo, fold, fork, release, merge, visibility; ogm/boundary; publish gate
services/rooms/           Colyseus GameRoom relay
services/games-host/      static server for /g/<gameId>/<buildId>/ with CSP, no cookies
services/voice-host/      Elixir mix project hosting voice_converse with OGM ports (key-gated providers, FakeProvider for tests)
services/intake/          Drive queue consumer calling gm packs import; wraps scripts/py/drive-sync
services/builder/         aiur fleet manager: daemon units, config templates, preflight, game-repo provisioning
packages/contracts/       Zod schemas + generated JSON Schema + fixtures, one file per family:
                          api.ts, auth.ts, jobs.ts, budget.ts, analytics.ts, design-log.ts, branches.ts, releases.ts,
                          saves.ts, bridge.ts (engine), game.ts, input.ts, assets.ts (manifest, lockfile), card schemas,
                          room.ts, voice.ts (re-export of @aiur/contracts), commit.ts, chat.ts, events.ts
packages/policy/          authorize(actor, action, resource) with the A7 matrix as a test table
packages/db/              Drizzle schema and migrations (timestamped files)
packages/design-log/      apply/invert/replay/reduce/reapply/merge/fold/version
packages/aiur-client/     typed client for aiur's /api/v1 routes and the events feed
packages/blob-store/      BlobStore interface, FsBlobStore, signed URLs
packages/asset-cards/     C3 schemas, rights engine, licence table, style families, index
packages/gm-cli/          `gm` binary; commands registered by directory scan: assets/, packs/, maps/, build/, check/, run/,
                          shot/, perf/, docs/, progress/, chat/, checkpoint/, new/, test/, changes/, skills/
packages/gm-verify/       capture engine (Playwright, GPU flags), gates L0/L1, verify report, replay
packages/iframe-bridge/   MessageChannel RPC with origin check, size cap, rate limit
packages/sdk/             @gm/sdk: core, three, phaser, camera, input, assets, audio, mp, fx, nav, proc, saves, achievements,
                          analytics, test hooks
packages/host/            @gm/host: iframe creation, HostBridge, gamepad poller, touch overlay, viewport, SW cache
packages/sdk-conformance/ gm-sdk check
packages/room-protocol/   room types, Zod schemas, grant sign/verify
packages/voice-client/    TS port of the voice_converse browser client + dictation + read-aloud
packages/config/          env loader that validates names and never logs values
packages/health/          /healthz helper
skills/gm-*/              the skill pack (gm-core, gm-verify, gm-genre-platformer, gm-input, gm-ui-hud, gm-audio,
                          gm-multiplayer-ready, gm-scope-options, gm-editor-tuning, gm-repair, gm-build) + skills/vendor/
templates/game-2d/, game-3d/, game-multiplayer/   scaffold-only starters for gm new
scripts/py/{audio,maps,drive-sync}/  kept Python workers; scripts/assets/*.py until gm packs replaces them
ops/systemd/, ops/bin/, ops/backup/, docs/ops/   host units, slices, ingress, backup, runbook
third_party/pixelfx/      unchanged
prototypes/               frozen; studio-v0 and ui-v0 archived after apps/web deploys
```

Package names: `@ogm/<dir>` for app/service/platform packages; `@gm/sdk`, `@gm/host` for the open-source engine side (the engine packages never depend on `services/*`).

## 3. Interfaces and their owners

| Contract | Owner ticket (defines) | Consumers | Shape lives in |
|---|---|---|---|
| Engine bridge envelope, HostToGame/GameToHost, GameModule, GmTestHooks, ActionFrame, CameraRig, AssetManifest | OGM-020 engine-contracts | SDK, host, web app, verify, rooms client | `packages/contracts/{bridge,game,input,assets}.ts` |
| Transaction, DesignDoc, Patch, Branch, WorkingSet, ReapplyReport, MergePlan, Build, Release, SaveSlot | OGM-040 design-log core | API, web editor, rooms (relay), SDK saves | `packages/contracts/{design-log,branches,releases,saves}.ts` |
| Room protocol (RoomState, ClientMessage, ServerMessage, RoomGrant, DesignTx) | OGM-050 room-protocol | rooms service, host app, verify two-client | `packages/contracts/room.ts` |
| Jobs API, admission, budget tools, analytics events, reports, notifications | OGM-012 jobs/admission (contract first in OGM-010 api skeleton) | web, voice host, gm CLI, aiur hooks | `packages/contracts/{jobs,budget,analytics,reports}.ts` |
| AiurClient | OGM-030 aiur-client | API jobs, builder, chat bridge | `packages/aiur-client` |
| Commit ops and BoundaryVerdict | OGM-035 commit service | API releases/forks, builder provisioning | `packages/contracts/commit.ts` |
| Asset card, rights, lockfile, build manifest, style families, blocklist | OGM-060 asset-cards | gm CLI, SDK loader, commit gate, web creation | `packages/contracts/{card,assets}.ts`, `packages/asset-cards` |
| Build chat message, gm chat post, gm checkpoint | OGM-080 build-chat backend | web panel, gm CLI, skills | `packages/contracts/chat.ts` |
| Voice token, VoiceTarget, briefing push, instruct callback | OGM-085 voice host | web, API | `packages/contracts/voice.ts` |
| Verify report, GmTestHook needs, skill pack layout | OGM-090 gm run/shot/perf | skills, build chat, repair | `packages/gm-verify/report.ts` |
| Ingress map, unit layout, env names | OGM-002 host bootstrap | every service | `ops/`, `packages/config` |

Rule: a consumer may start against the reviewed contract file as soon as the owner's contract PR merges; the owner's implementation is not a prerequisite (contract-authority edges only). Producer tickets quote the exact TypeScript in their body; consumers copy it.

## 4. Key data flows

**Admission → build.** `POST /api/v1/jobs` → policy → allowance check (offers on 402) → reservation + slot → job row `queued|admitted` → builder ensures the repo's daemon unit is running → files the GitHub issue (markers, labels) → `PUT spend-cap` → `agent:todo` → `control todo` → daemon dispatches a Codex worker in the sandbox → `after_create` fetches the job bundle → worker builds with `gm-*` skills, posts to the chat with `gm chat post`, runs `gm check`/`gm test`/`gm run` → pushes a branch and opens a PR → `ogm/boundary` check → commit service merges when green → build artifact lands in the bucket → `Build.status = tested` → re-apply report → job `done` → notification.

**Edit.** Editor → transaction with `baseRev` + lease → `POST transactions` → SSE → host applies `design.apply` through the bridge → room relays `design.tx` to watchers.

**Publish.** `POST /games/:g/publish` → `gm check assets --publish` → fold(working set) → commit service `fold_design` + `release` (gate) → release row → pointer CAS → games host serves the new build.

**Room.** `POST rooms` → grant → invite link → friend signs in → `GET /join/:token` → host-app Colyseus client joins with the grant → watcher sync (snapshot at rev + `design.tx`) → `phase: playing` → inputs/snapshots relayed → bridge `net.*` messages into both iframes.

**Intake.** Drive listener → `queue.jsonl` → intake service → `gm packs import` (quarantine card, unpack, measure, previews) → `gm packs tag` (Python taggers, CLIP sheets) → index → `gm assets search`.

## 5. Lanes and parallelism

Lanes are thematic (epics), never barriers. Each lane's first ticket is a contract or a skeleton so the lane's implementation tickets fan out in wave 2–3.

| Lane | Spine (first ticket) | Then in parallel |
|---|---|---|
| platform | OGM-001 monorepo + CI → OGM-002 host bootstrap, OGM-003 config/secrets, OGM-004 contracts bootstrap (cards + rights) | OGM-005 blob store, OGM-006 ingress, OGM-007 games host, OGM-008 backups/status/runbook |
| backend | OGM-010 API skeleton | OGM-011 auth + age + proxy, OGM-012 accounts/policy/invites, OGM-013 admission/budgets, OGM-014 analytics ingest, OGM-015 reports + repair admission, OGM-016 notifications, OGM-017 admin API, OGM-018 voice budget tools |
| aiur | OGM-030 aiur-client (+ C0 spike) | OGM-031 job intake, OGM-032 event ingestion + projection, OGM-033 job controls + usage reconciliation, OGM-034 daemon fleet manager, OGM-036 game-repo provisioning template, OGM-037 sandbox policy + Codex profile + preflight, OGM-038 offline dependency store + proof suite |
| commit | OGM-035 commit service | OGM-039 boundary check run + publish gate |
| engine | OGM-020 engine-contracts | OGM-021 iframe-bridge, OGM-022 sdk core + hooks, OGM-023 three+rapier + 3D template, OGM-024 phaser + 2D template, OGM-025 camera rigs + input, OGM-026 asset loader + tiers, OGM-027 audio, OGM-028 host game frame, OGM-029 conformance, OGM-019 fx/nav/proc |
| design | OGM-040 design-log core | OGM-041 log API + lease + SSE, OGM-042 re-apply, OGM-043 branches, OGM-044 merge, OGM-045 builds/releases/publish/rollback, OGM-046 saves, OGM-047 achievements + creator analytics, OGM-048 forks |
| rooms | OGM-050 room-protocol | OGM-051 rooms service + GameRoom + lifecycle, OGM-052 invites + grants + join page, OGM-053 host-app room client + watcher sync, OGM-054 SDK net layer, OGM-055 gm-multiplayer-ready + template + two-client verify |
| assets | OGM-060 asset-cards + gm CLI skeleton | OGM-061 card migration + licences, OGM-062 lockfile/use/check/credits, OGM-063 gm build assets, OGM-064 gm packs import + intake service, OGM-065 taggers (audio, maps, CLIP sheets), OGM-066 style families, OGM-067 blocklist + maps search, OGM-068 tier-2 mirrors |
| web | OGM-070 web scaffold + Netlify delivery | OGM-071 shell (title town, sound, PWA, input, notifications, bug button), OGM-072 age/sign-in/connect, OGM-073 games picker, OGM-074 creation flow + scope chat, OGM-075 game host + editor framework, OGM-076 build chat panel, OGM-077 versions/releases/merge screens, OGM-078 multiplayer screens, OGM-079 admin + build analytics |
| chat+voice | OGM-080 build chat backend | OGM-081 gm chat post + checkpoint, OGM-082 checkpoints bridge, OGM-083 voice client + dictation + read-aloud, OGM-085 voice host (Elixir), OGM-086 budget-aware voice, OGM-087 narration (key-gated), OGM-088 scope session as an aiur ticket |
| skills | OGM-090 gm run/shot/perf + verify report | OGM-091 skill pack scaffold + gm-core + gm new, OGM-092 vendored reference layer + checker, OGM-093 gm-verify skill + L0/L1 gates, OGM-094 platformer skill + pattern cards + gm docs, OGM-095 skill wave 2 (six skills), OGM-096 repair loop, OGM-097 sameness eval |
| capstone | OGM-100 end-to-end proof (make, edit, branch, invite, publish on this machine) | OGM-101 archive prototypes |

Critical path (longest hard chain): OGM-001 → OGM-010 → OGM-013 → OGM-031 → OGM-034 → OGM-100, and OGM-001 → OGM-020 → OGM-022 → OGM-023 → OGM-029 → OGM-100. Both are five to six tickets deep; everything else hangs off wave 2 contracts.

## 6. Hot write surfaces and how tickets avoid each other

See `decisions.md` D-WRITE-SURFACES. Concretely: no ticket edits root `package.json` after OGM-001 except to add a workspace script; new packages add their own `package.json`; `packages/contracts/src/index.ts` is append-only (one line per family); `packages/gm-cli` scans `src/commands/*/` so no registry edits; `apps/web/src/routes/<screen>/route.tsx` is auto-collected; API routers mount from `services/api/src/<context>/routes.ts` by a directory scan; migrations are timestamped; `.aiur/config`, `CODEOWNERS`, `.gitignore`, `ci.yml` have `serializes_with` edges among the few tickets that touch them. Lockfile conflicts are resolved by re-running `pnpm install` (accepted).

## 7. What the 5:30am checkpoint can show

Whatever has merged: at minimum the monorepo scaffold with green CI and the host units, plus any wave-2 contract packages. The live site stays the current studio (title town included) until OGM-070/071 land; the deploy script then switches to `apps/web/dist`.
