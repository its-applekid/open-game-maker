#!/usr/bin/env python3
"""Build the OGM V1 planning pack's graph artifacts from one table.

Writes build-order.json (aiur-build legacy pack shape, used here as the typed graph and ticket index) and graph.md
(wave table, critical path, per-lane earliest start, serialization pairs) from TICKETS below. Phases are computed as
longest-path levels of the hard-dependency graph, never chosen by hand.

    python3 -I docs/plans/ogm-v1-build/tools/make_pack.py
"""
import json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
RESEARCHED = "9508c1c46735e442a2e07a1bffad2bb9f190da8d"

LANES = {
    "platform": ("Platform", "server-stack", "Monorepo, host units, ingress, blob store, games host, config, backups"),
    "backend": ("Backend", "circle-stack", "API: auth, accounts, policy, admission, budgets, analytics, reports, notifications"),
    "aiur": ("aiur", "cpu-chip", "Driving aiur: client, job intake, events, controls, daemon fleet, repo provisioning, sandbox policy"),
    "commit": ("Commit", "lock-closed", "GitHub App commit service, boundary check run, publication content gate"),
    "engine": ("Engine", "cube", "Engine contracts, bridge, SDK (three, phaser, camera, input, assets, audio), host frame, conformance"),
    "design": ("Design state", "pencil-square", "Transaction log, overrides, branches, merge, releases, saves, achievements, analytics, forks"),
    "rooms": ("Rooms", "users", "Colyseus relay rooms, invites, watcher sync, SDK net layer, multiplayer-ready"),
    "assets": ("Assets", "photo", "Asset cards, gm CLI, lockfile, build tiers, import, taggers, style families, blocklist"),
    "web": ("Web app", "device-phone-mobile", "React app on Netlify: shell, sign-in, picker, creation, game host, editor, chat, admin"),
    "chat-voice": ("Chat and voice", "chat-bubble-left-right", "Build chat, checkpoints, voice client, voice host, budget-aware voice, narration"),
    "skills": ("Skills", "academic-cap", "gm run/shot/perf, skill pack, vendored references, gm-verify gates, genre skills, repair, eval"),
    "capstone": ("Capstone", "flag", "End-to-end proof on this machine and prototype archive"),
}

# id, lane, cx, title, outcome, depends_on, serializes_with, suggested_after, requirement_refs, write_surfaces, contract_surfaces, decision_refs, external_gates
T = []
def t(id, lane, cx, title, outcome, deps=(), ser=(), sug=(), reqs=(), writes=(), contracts=(), decs=(), gates=(), kind="executable", risk="medium"):
    T.append(dict(id=id, lane=lane, cx=cx, title=title, outcome=outcome, deps=list(deps), ser=list(ser), sug=list(sug), reqs=list(reqs),
                  writes=list(writes), contracts=list(contracts), decs=list(decs), gates=list(gates), kind=kind, risk=risk))

# ---- platform
t("OGM-001", "platform", 2, "Monorepo scaffold and CI", "pnpm workspace (apps/*, packages/*, services/*), tsconfig base, Vitest, ESLint, Prettier, .gitignore rewrite, ci / required green on the empty workspace, AGENTS.md naming the commands.",
  reqs=["R120", "R122", "R123"], writes=["package.json", "pnpm-workspace.yaml", "tsconfig.base.json", ".github/workflows/ci.yml", ".gitignore", "AGENTS.md"], contracts=["workspace layout"], decs=["D-STACK", "D-MONOREPO-FIRST", "D-WRITE-SURFACES"], risk="low")
t("OGM-002", "platform", 2, "Host bootstrap: slices and user units", "ops/systemd slices and unit files for api, rooms, games, voice-host, intake, drive-sync, aiur@ template and the backup timer; an idempotent no-sudo install script; systemctl --user status green with placeholders.",
  deps=["OGM-001"], reqs=["R69"], writes=["ops/systemd/*", "ops/bin/ogm-host-setup.sh"], contracts=["unit and slice layout", "env file names"], decs=["D-HOSTING"])
t("OGM-003", "platform", 1, "Config and secrets loader", "packages/config validates named env vars at startup, never logs values; .env.example with names only; ~/.config/ogm/env/<unit>.env convention documented.",
  deps=["OGM-001"], reqs=["R69"], writes=["packages/config/*", ".env.example"], contracts=["env names"], decs=["D-SECRETS"], risk="low")
t("OGM-004", "platform", 3, "Contracts package bootstrap with asset-card schemas and rights engine", "packages/contracts with the append-only barrel, Zod→JSON Schema emit, the C3 schemas, 16 examples and 4 negatives moved in, validate.mjs ported to TypeScript (effective rights, layout metrics) with the fixtures as tests, a shim at the old path, Python callers updated; cards gain processing: local-only|any.",
  deps=["OGM-001"], reqs=["R121", "R51"], writes=["packages/contracts/*", "docs/research/v0.5/schemas/tools/validate.mjs", "scripts/audio/build_audio_cards.py"], contracts=["asset card", "layout spec", "rights"], decs=["D-CARDS"])
t("OGM-005", "platform", 3, "Filesystem blob store with signed URLs", "packages/blob-store: BlobStore interface (put, head, signedGet, delete), FsBlobStore under OGM_BLOB_ROOT with blobs/sha256/<hex>, HMAC day-rounded signed GET verification helper, GC of unreferenced blobs by a roots list; property tests.",
  deps=["OGM-001"], reqs=["R56"], writes=["packages/blob-store/*"], contracts=["BlobStore", "signed URL"], decs=["D-BUCKET"])
t("OGM-006", "platform", 2, "Ingress: Tailscale serve/funnel and Netlify proxy", "ops/bin/ogm-ingress.sh applies the serve/funnel map (8443 api+ws+blobs, 10000 games) leaving 443 untouched; documented _redirects/_headers lines for the app; an external curl reaches /healthz.",
  deps=["OGM-002"], reqs=["R69"], writes=["ops/bin/ogm-ingress.sh", "docs/ops/ingress.md"], contracts=["ingress map"], decs=["D-HOSTING", "D-ORIGIN"], gates=["GATE-TS-OPERATOR"])
t("OGM-007", "platform", 3, "Games origin host", "services/games-host serves /g/<gameId>/<buildId>/ from the release directory layout it defines, with CSP, COOP, immutable caching, no cookies, 127.0.0.1 bind; cross-site test against the app origin.",
  deps=["OGM-001"], reqs=["R40", "R69"], writes=["services/games-host/*"], contracts=["release directory layout", "games origin CSP"], decs=["D-GAMES-ORIGIN"])
t("OGM-008", "platform", 2, "Backups, status and runbook", "ogm-backup.service/timer: SQLite online backup + incremental blob tar to the tailnet node over SSH; restore script proven once; ops/bin/ogm-status (units, ports, disk, journal, stray listeners); docs/ops/runbook.md and remind entries for Kevin's hand steps.",
  deps=["OGM-002", "OGM-005"], reqs=["R69"], writes=["ops/backup/*", "ops/bin/ogm-status", "docs/ops/runbook.md"], decs=["D-HOSTING"], gates=["GATE-BACKUP-TARGET"], risk="low")
t("OGM-009", "platform", 1, "Python workers convention and CI job", "scripts/py/{audio,maps,drive-sync} with per-tool requirements, documented venv paths, make test; a second workflow runs the venv-free tests (drive-sync unittest) in CI; the audio/maps venv path contract for the gm CLI.",
  deps=["OGM-001"], reqs=["R120", "R80"], writes=["scripts/py/*", ".github/workflows/ci-python.yml", "Makefile"], decs=["D-STACK"], risk="low")

# ---- backend
t("OGM-010", "backend", 3, "API skeleton: Hono, Drizzle, SQLite, directory-scanned routes, contracts for jobs/budget/analytics/reports", "services/api boots under the unit, GET /healthz, migrations run, packages/db schema package, routes mounted by scanning services/api/src/<context>/routes.ts, and the shared contract files jobs.ts, budget.ts, analytics.ts, reports.ts, notifications.ts committed with fixtures so other tickets can start against them.",
  deps=["OGM-001", "OGM-003", "OGM-004"], reqs=["R120", "R121"], writes=["services/api/*", "packages/db/*", "packages/contracts/{api,jobs,budget,analytics,reports,notifications}.ts"], contracts=["jobs API", "budget tools", "analytics events", "reports", "notifications"], decs=["D-DB", "D-API"])
t("OGM-011", "backend", 3, "Auth: Better Auth with magic link, passkey, Google; age gate; same-origin proxy config", "Sign-up refused under 18 via the signed age cookie; passkey and Google work from the Netlify origin through the /auth proxy; MailSender interface with the admin-inbox default; session and bearer-token middleware for direct WebSocket services.",
  deps=["OGM-010"], reqs=["R1", "R2"], writes=["services/api/src/auth/*", "packages/db (auth tables)", "docs/ops/netlify-proxy.md"], contracts=["auth routes", "age cookie"], decs=["D-AUTH", "D-ORIGIN", "D-MAIL"], gates=["GATE-GOOGLE-OAUTH"])
t("OGM-012", "backend", 3, "Accounts, families, games, invitations and the policy module", "packages/policy authorize() with the A7 matrix as a test table; families, members, roles, owner rules; games table with GitHub repo fields; invitations with kinds member/play/room and the family allowlist switch.",
  deps=["OGM-010"], reqs=["R3", "R4", "R5", "R6"], writes=["packages/policy/*", "services/api/src/{accounts,games,invites}/*"], contracts=["authorize()", "games API", "invitations"], decs=["D-AUTH"])
t("OGM-013", "backend", 4, "Job admission, budgets, allowance and aiur spend-cap reconciliation", "jobs state machine (queued→admitted→filed→running→paused_budget|done|failed|cancelled), slots 1+3 with repairs sharing edit, reservations by size class, per-member daily allowance with local-midnight reset, the four offers on 402, hard cap mirrored to aiur through the AiurClient contract, queued-at-reset scheduler, platform cap visible to admins.",
  deps=["OGM-010", "OGM-012", "OGM-030"], reqs=["R10", "R11", "R12", "R13", "R14"], writes=["services/api/src/{jobs,budget}/*"], contracts=["jobs API (implementation)"], decs=["D-BUDGET-UNIT", "D-JOB-BUS"], risk="high")
t("OGM-014", "backend", 3, "Build-analytics ingestion, aiur join and admin read API", "POST /api/v1/analytics/events with the nine-activity taxonomy and allow-listed meta; join to aiur run ids; per-build timeline merging aiur phases with activities; per-game and per-member roll-ups.",
  deps=["OGM-010"], reqs=["R66"], writes=["services/api/src/analytics/*"], decs=["D-JOB-BUS"])
t("OGM-015", "backend", 3, "Bug-report intake, dedupe, routing and repair admission", "reports and signatures tables, deterministic classifier (game_repair / platform / editor_hint / stored), private bundle upload through the blob store, repair job through admission with kind=repair sharing edit slots, platform route handed to a pluggable IssueWriter.",
  deps=["OGM-013", "OGM-005"], reqs=["R68"], writes=["services/api/src/reports/*"], contracts=["reports API", "IssueWriter"], decs=["D-COMMIT"])
t("OGM-016", "backend", 2, "Notifications: Web Push and SSE feed", "VAPID keys generated at first boot into the env dir, push_subscriptions and notifications tables, GET /api/v1/notifications/stream, the three triggers wired (build done, queued job started, intake report).",
  deps=["OGM-010"], reqs=["R67"], writes=["services/api/src/notify/*"], decs=["D-HOSTING"], risk="low")
t("OGM-017", "backend", 2, "Admin API", "Admin-only routes for membership, peer admins, invites, allowances and reset zone, concurrency, the platform cap, game listing and delisting, Drive intake status; policy-checked and table-tested.",
  deps=["OGM-012", "OGM-013"], reqs=["R3", "R84"], writes=["services/api/src/admin/*"], risk="low")
t("OGM-018", "backend", 2, "Voice budget tools and estimate model", "GET budget/status, POST budget/estimate with the seeded size-class table refined from job history, and jobs start=at_reset; the briefing push payload for the voice host.",
  deps=["OGM-013"], reqs=["R12", "R21"], writes=["services/api/src/budget/estimate.ts", "services/api/src/voice/briefing-push.ts"], contracts=["briefing push"], decs=["D-BUDGET-UNIT"], risk="low")

# ---- aiur integration
t("OGM-030", "aiur", 2, "aiur-client package and zero-cost spike", "packages/aiur-client: typed client for /api/v1 (issue, usage, progress, spend cap, cancel, pause/resume, message, control todo, accounts, events) with Origin and X-Aiur-Request on writes, zod schemas for the versioned contracts, the WebSocket events:feed subscriber; the C0 spike (memory tracker + fake provider: issue→claim latency, cancel confirmation, spend-cap trip) recorded in evidence/T02-spike.md.",
  deps=["OGM-001"], reqs=["R60"], writes=["packages/aiur-client/*", "docs/plans/ogm-v1-build/evidence/T02-spike.md"], contracts=["AiurClient"], decs=["D-JOB-BUS"])
t("OGM-031", "aiur", 3, "Job intake to aiur", "Admitted job → GitHub issue in the game repo with gm-job/gm-ticket markers, complexity and feature:gm-<jobId> labels → PUT spend-cap → agent:todo → control todo nudge; idempotent on markers; uses the builder bot credential.",
  deps=["OGM-030", "OGM-013"], reqs=["R26"], writes=["services/builder/src/intake/*", "services/builder/src/github/issues.ts"], contracts=["ticket filing"], decs=["D-JOB-BUS", "D-SECRETS"], gates=["GATE-MACHINE-USERS"])
t("OGM-032", "aiur", 3, "aiur event ingestion and job projection", "events:feed subscriber per daemon plus progress polling → job stage, progress and usage rows; lifecycle→creator words mapping; budget-exhausted handled; decisions polled for checkpoints.",
  deps=["OGM-030", "OGM-010"], reqs=["R27"], writes=["services/builder/src/events/*", "services/api/src/jobs/projection.ts"], contracts=["job state projection"], decs=["D-JOB-BUS"])
t("OGM-033", "aiur", 2, "Job controls and usage reconciliation", "Cancel with confirmed exit, pause/resume, send message, answer decision from the OGM API; periodic /usage reconciliation into ledger rows with run_id; reservation release on terminal states.",
  deps=["OGM-030", "OGM-013"], reqs=["R13", "R27"], writes=["services/api/src/jobs/controls.ts", "services/api/src/budget/aiur-usage.ts"], decs=["D-JOB-BUS"], risk="low")
t("OGM-034", "aiur", 4, "Daemon fleet manager", "One ogm-aiur@<slug> unit per active game repo rendered from the policy template: start on first admitted job, stop after 30 min idle, cap 4 live, mint a client token per daemon, register in remote-instances, health via /healthz; fleet admission respects 1+3.",
  deps=["OGM-002", "OGM-030", "OGM-037"], reqs=["R61"], writes=["services/builder/src/fleet/*", "ops/systemd/ogm-aiur@.service"], contracts=["GameDaemon record"], decs=["D-DAEMONS", "D-AIUR-MODE"], gates=["GATE-MACHINE-USERS"], risk="high")
t("OGM-035", "commit", 3, "Commit service with GitHub App auth", "services/commit: @octokit/auth-app installation tokens, Git Data API CAS writes for create_repo, fold_design, fork, release, merge, set_visibility; loopback-only POST /internal/commit with the backend service token; audit row per op; packages/contracts/commit.ts.",
  deps=["OGM-001"], reqs=["R64"], writes=["services/commit/*", "packages/contracts/commit.ts"], contracts=["CommitOp", "BoundaryVerdict"], decs=["D-COMMIT"], gates=["GATE-GITHUB-APP"], risk="high")
t("OGM-036", "aiur", 3, "Game-repo provisioning template", "A new game repo gets .aiur/{config,hooks,prompt.md} rendered from the game-builder template, labels, ci.yml with ci / required, .claude/skills/gm-*, .codex/skills and .agents/skills links, AGENTS.md, skills.lock; the after_create hook fetches the job bundle with a per-daemon secret.",
  deps=["OGM-035", "OGM-037"], sug=["OGM-091"], reqs=["R62", "R65", "R106"], writes=["packages/game-repo-template/*", "services/builder/src/provision.ts", "services/api/src/internal/bundle.ts"], contracts=["after_create bundle"], decs=["D-SKILLS-IN-REPO", "D-DAEMONS"])
t("OGM-037", "aiur", 3, "Sandbox policy template, Codex permission profile and dispatch preflight", "renderAiurConfig(repo, workspaceRoot, denyReadRoots) emits the game-builder policy (networkAccess false, writable root = workspace, no /tmp, dedicated CODEX_HOME); the Codex permission profile with deny_read over the credential paths proven by a probe script (spike S1); preflight refuses dispatch unless the rendered config matches.",
  deps=["OGM-001"], reqs=["R63"], writes=["services/builder/src/policy/*", "services/builder/sandbox/profile.toml", "scripts/sandbox/probe.sh"], contracts=["game-builder aiur policy"], decs=["D-SBX"], risk="high")
t("OGM-038", "aiur", 2, "Offline dependency store and sandbox proof suite", "Seeded pnpm store and pnpm install --offline for the game templates; the new-dependency request path; B4 §6 proof tests adapted to bwrap/Codex (no network, no secret reads, workspace-only writes, resource caps) runnable here with logged results.",
  deps=["OGM-037"], sug=["OGM-091"], reqs=["R63"], writes=["scripts/sandbox/*", "docs/ops/sandbox.md"], decs=["D-SBX"])
t("OGM-039", "commit", 3, "Boundary check run and publication content gate", "ogm/boundary check on every game-repo PR (paths, size, lockfile rights, secret/PII scan, hash blocklist); the publish gate at Publish and visibility flips with explainable BoundaryVerdict reasons.",
  deps=["OGM-035", "OGM-062"], reqs=["R64", "R53"], writes=["services/commit/src/{boundary,publish-gate}/*"], decs=["D-COMMIT"])

# ---- engine
t("OGM-020", "engine", 3, "Engine contracts", "packages/contracts/{bridge,game,input,assets}.ts: versioned envelope, HostToGame/GameToHost unions, GameModule/GameInstance, GmTestHooks, ActionFrame, CameraRig, AssetManifest and lockfile types, emitted JSON Schemas and golden fixtures.",
  deps=["OGM-004"], reqs=["R40", "R42", "R45"], writes=["packages/contracts/{bridge,game,input,assets}.ts", "packages/contracts/schemas/*.v1.json", "packages/contracts/fixtures/*"], contracts=["engine bridge", "GameModule", "GmTestHooks", "AssetManifest"], decs=["D-HOOKS"])
t("OGM-021", "engine", 2, "iframe-bridge", "A ~150-line MessageChannel RPC: hello with origin check, port transfer, id-correlated requests, 256 KB cap, 120 msg/s limit, unknown-type drop; unit tests with two jsdom windows.",
  deps=["OGM-020"], reqs=["R40"], writes=["packages/iframe-bridge/*"], decs=["D-HOOKS"], risk="low")
t("OGM-022", "engine", 3, "SDK core and test hooks", "@gm/sdk core: GameModule runtime, fixed-step clock, seeded RNG, applyDesign dispatch, serialize/restore/migrate plumbing, GmTestHooks over the bridge and gated window globals, pure-fixture tests.",
  deps=["OGM-020", "OGM-021"], reqs=["R41", "R42"], writes=["packages/sdk/src/core/*", "packages/sdk/src/test/*"], decs=["D-HOOKS"])
t("OGM-023", "engine", 3, "three + rapier wrapper and the 3D scaffold template", "@gm/sdk/three: renderer setup with DPR caps, Rapier fixed step with snapshots, GLTF loader wired to meshopt/KTX2; templates/game-3d grey-box scaffold that boots headless and passes the hooks.",
  deps=["OGM-022", "OGM-026"], reqs=["R41"], writes=["packages/sdk/src/three/*", "templates/game-3d/*"], decs=["D-STACK"])
t("OGM-024", "engine", 3, "phaser wrapper and the 2D scaffold template", "@gm/sdk/phaser: Scale FIT/EXPAND presentation, scene lifecycle to GameInstance, 2D camera presets; templates/game-2d from template-vite-ts that boots headless and passes the hooks.",
  deps=["OGM-022"], reqs=["R41"], writes=["packages/sdk/src/phaser/*", "templates/game-2d/*"], decs=["D-STACK"])
t("OGM-025", "engine", 3, "Camera rigs and input merge", "Seven CameraRigs with input mappings and occlusion handling (cutaway proven for iso), one instance per local player; ActionFrame merge of host frames and in-iframe keys/pointer; editor camera and view-as-player hook.",
  deps=["OGM-023", "OGM-024"], reqs=["R43", "R44"], writes=["packages/sdk/src/camera/*", "packages/sdk/src/input/*"], decs=["D-HOOKS"])
t("OGM-026", "engine", 2, "Device-tier asset loader", "pickTier() from capability signals with frame-time downgrade and ?tier= override; AssetLoader over AssetManifest with parallel deduped fetches and lazy KTX2; never derives file names.",
  deps=["OGM-020"], reqs=["R45"], writes=["packages/sdk/src/assets/*"], decs=["D-TIERS"], risk="low")
t("OGM-027", "engine", 2, "Audio module", "SDK-owned AudioContext with buses, unlock on first pointerup and audioSession playback, ZzFX, optional Tone.js song.json player, renderCue over OfflineAudioContext, audio.relay fallback.",
  deps=["OGM-022"], reqs=["R46"], writes=["packages/sdk/src/audio/*"], decs=["D-HOOKS"], risk="low")
t("OGM-028", "engine", 4, "Host game frame (@gm/host)", "Iframe creation with the sandbox/allow attributes, HostBridge with Zod validation and a role-check hook, the only gamepad poller with playerIndex, touch overlay from declared actions in its own pointer layer, viewport/safe-area, settings broadcast, service-worker asset cache.",
  deps=["OGM-020", "OGM-021"], reqs=["R40", "R44"], writes=["packages/host/*"], contracts=["host frame API"], decs=["D-HOOKS"], risk="high")
t("OGM-029", "engine", 3, "SDK conformance (gm-sdk check)", "The nine A4 checks plus B7's two as a Node + Playwright runner on the GPU flags with a SwiftShader fallback; runs green on both templates and the multiplayer template when it exists.",
  deps=["OGM-022", "OGM-023", "OGM-024", "OGM-028"], reqs=["R47"], writes=["packages/sdk-conformance/*"], decs=["D-VERIFY-GPU"])
t("OGM-019", "engine", 2, "fx, nav and proc helpers", "@gm/sdk/fx (pixelfx adapter for 2D, data-driven 3D sprite port of fx.js), @gm/sdk/nav (grid A*, recast lazily behind a capability), @gm/sdk/proc (seeded FastNoise Lite).",
  deps=["OGM-022"], reqs=["R48"], writes=["packages/sdk/src/{fx,nav,proc}/*"], decs=["D-STACK"], risk="low")

# ---- design state
t("OGM-040", "design", 3, "Design-log core package", "packages/design-log and packages/contracts/{design-log,branches,releases,saves}.ts: Transaction, DesignDoc, Patch, Branch, WorkingSet, ReapplyReport, MergePlan, Build, Release, SaveSlot types; apply/invert with immer; replay(branch) with fork points; reduce(log)→WorkingSet; validation against manifest controls; property tests.",
  deps=["OGM-020", "OGM-004"], reqs=["R31"], writes=["packages/design-log/*", "packages/contracts/{design-log,branches,releases,saves}.ts"], contracts=["Transaction", "Branch", "Release", "SaveSlot"], decs=["D-LOG"])
t("OGM-041", "design", 3, "Design-log API, lease and watcher stream", "Tables for transactions, branches, leases; POST/GET transactions with baseRev and lease fencing (409/423); design snapshot at a revision; SSE stream per branch; lease acquire/heartbeat/takeover between the owner's devices.",
  deps=["OGM-010", "OGM-040"], reqs=["R31", "R32", "R35", "R36"], writes=["services/api/src/design/*"], decs=["D-LOG"])
t("OGM-042", "design", 3, "Re-apply overrides across builds", "On Build.status=tested compute the ReapplyReport with manifest hints and targetControls supersession; GET /branches/:b/reapply/:buildId; needs-a-choice answers as system transactions.",
  deps=["OGM-041"], reqs=["R33"], writes=["services/api/src/design/reapply.ts", "packages/design-log/src/reapply.ts"], decs=["D-LOG"])
t("OGM-043", "design", 3, "Branches: create, switch, archive, per-branch builds, version numbers", "Branch rows with fork points, branch/<id> refs through the commit contract, cap 5 active, archive, builds keyed by branch, the derived counter version number.",
  deps=["OGM-041"], sug=["OGM-035"], reqs=["R37", "R39", "R91"], writes=["services/api/src/branches/*", "packages/design-log/src/version.ts"], decs=["D-BRANCH-BASE", "D-VERSION"])
t("OGM-044", "design", 4, "Three-way design merge with voice-guided conflicts", "MergePlan computation, conflict classification (both_changed, delete_vs_edit, control_removed), resolution endpoints and the T06 tool shape, merge transaction, preview build request, land/abandon, inverse on rollback.",
  deps=["OGM-043"], reqs=["R38"], writes=["packages/design-log/src/merge.ts", "services/api/src/branches/merge.ts"], decs=["D-LOG"], risk="high")
t("OGM-045", "design", 4, "Builds, releases, publish, fold, rollback, update indicator", "Build, OverrideSnapshot and Release rows; deterministic fold to design/*.json through the commit contract behind the gate; .gm/changes assembly; GET /published with ETag; CAS pointer; rollback with affected-save counts; every artifact kept.",
  deps=["OGM-041"], sug=["OGM-035", "OGM-062", "OGM-007"], reqs=["R90", "R92", "R93"], writes=["services/api/src/releases/*", "packages/design-log/src/fold.ts"], decs=["D-ARTIFACTS", "D-VERSION", "D-COMMIT"], risk="high")
t("OGM-046", "design", 3, "Cloud saves", "Save tables and endpoints (OCC If-Match, Idempotency-Key, 409/423/413), SDK-side outbox (idb) and state machine, lazy one-step migration at load, rollback status marking.",
  deps=["OGM-010", "OGM-022"], reqs=["R94"], writes=["services/api/src/saves/*", "packages/sdk/src/saves/*"], decs=["D-LOG"])
t("OGM-047", "design", 3, "Achievements and creator analytics", "achievements.json lint, award/progress endpoints, draft no-op with test toasts; creator analytics ingestion with HMAC pseudonymisation, nightly rollups, creator query endpoints, draft exclusion, 90-day retention.",
  deps=["OGM-010", "OGM-022"], reqs=["R96"], writes=["services/api/src/{achievements,creator-analytics}/*", "packages/sdk/src/{achievements,analytics}.ts"], risk="low")
t("OGM-048", "design", 3, "Forks", "POST /games/:g/fork {releaseId}: new game row with provenance, new repo and tag push through the commit contract, snapshot and achievement-def copy, uploads copy, rights re-check; never saves, awards or analytics.",
  deps=["OGM-045", "OGM-062"], reqs=["R95"], writes=["services/api/src/forks.ts"], decs=["D-COMMIT"], risk="low")

# ---- rooms
t("OGM-050", "rooms", 3, "Room protocol package", "packages/room-protocol and packages/contracts/room.ts: RoomPin, RoomGrant, Membership, Presence, RoomState, ClientMessage, ServerMessage, DesignTx validation, size and rate tables, HS256 grant sign/verify helpers; fixtures.",
  deps=["OGM-004"], reqs=["R71", "R72"], writes=["packages/room-protocol/*", "packages/contracts/room.ts"], contracts=["room protocol", "RoomGrant"], decs=["D-ROOMS"])
t("OGM-051", "rooms", 3, "Rooms service: GameRoom relay and lifecycle", "services/rooms on Colyseus 0.18 as a user unit: onAuth grant verification, owner-only messages, playerIndex stamping, caps, privateMode zeroing, phase broadcast, reconnection windows, owner second device, host-leave end-and-record, draft load/ready, idle dispose, revocation list; @colyseus/testing tests for every rule.",
  deps=["OGM-050"], reqs=["R70", "R71", "R74", "R75", "R76", "R77"], writes=["services/rooms/*"], decs=["D-ROOMS"], risk="high")
t("OGM-052", "rooms", 3, "Invite links, room grants and the join page", "POST rooms, POST invites, GET /join/:token (sign-in, age screen, allowlist) returning the grant, revoke, the internal ended callback; the /join route in the app that lands in the room.",
  deps=["OGM-012", "OGM-050", "OGM-070"], reqs=["R4", "R72"], writes=["services/api/src/rooms/*", "apps/web/src/routes/join/*"], decs=["D-ROOMS"])
t("OGM-053", "rooms", 4, "Host-app room client and watcher sync", "Colyseus client in the host app forwarding net.* bridge messages, phase UI, watcher catch-up from the design snapshot plus design.tx with resync on gaps, host-left end state.",
  deps=["OGM-050", "OGM-028", "OGM-041", "OGM-070"], reqs=["R73", "R74"], writes=["apps/web/src/net/*"], decs=["D-ROOMS"], risk="high")
t("OGM-054", "rooms", 4, "SDK net layer", "gm.net: host/peer roles, localPlayerIndex, players, onPlayerJoined/Left, onInput, fixed-rate sendSnapshot/applySnapshot with interpolation, events, per-player HUD and camera binding; single player = one host.",
  deps=["OGM-022", "OGM-025", "OGM-050"], reqs=["R75", "R78"], writes=["packages/sdk/src/net/*"], decs=["D-ROOMS"], risk="high")
t("OGM-055", "rooms", 3, "gm-multiplayer-ready, multiplayer template, conversion job and two-client verify", "The skill with the eight rules and a checker, templates/game-multiplayer with two spawns and two HUDs, the single→multiplayer edit-job recipe, and the two-client Playwright scenario (welcome, design equality, canary, play within 500 ms, input moves avatar, host leave, draft load).",
  deps=["OGM-054", "OGM-051", "OGM-091", "OGM-090"], reqs=["R78", "R76"], writes=["skills/gm-multiplayer-ready/*", "templates/game-multiplayer/*", "packages/gm-verify/scenarios/two-client.ts"], decs=["D-ROOMS"])

# ---- assets
t("OGM-060", "assets", 3, "gm CLI skeleton and asset search over cards", "packages/gm-cli with directory-scanned commands, --json, exit codes; packages/asset-cards (index builder over existing cards, facets, rights-aware search); gm assets search|facets|info|sheet|list over the 414 packs.",
  deps=["OGM-004"], reqs=["R50", "R51", "R88"], writes=["packages/gm-cli/*", "packages/asset-cards/*"], contracts=["gm CLI conventions", "asset index"], decs=["D-CARDS"])
t("OGM-061", "assets", 2, "Card migration for all 414 packs and the licence table", "Every pack has a schema-valid collection card with SPDX or LicenseRef-* licences; the 8 uncarded packs and Sidetrax drafts resolved; install_itch_pack.py fixed; processing: local-only defaults applied.",
  deps=["OGM-060"], reqs=["R52"], writes=["packages/asset-cards/src/licenses.ts", "scripts/assets/build_collection_cards.py", "scripts/assets/install_itch_pack.py"], decs=["D-CARDS"], risk="low")
t("OGM-062", "assets", 3, "Lockfile, gm assets use/register/why, gm check assets, credits", "assets.lock.json written by gm assets use, CREDITS.md, refusals with reasons, gm check assets validating lockfile vs index vs rights at build and at publish (exit 1 on violation).",
  deps=["OGM-060", "OGM-061"], reqs=["R53"], writes=["packages/gm-cli/src/commands/assets/{use,register,why}.ts", "packages/gm-cli/src/commands/check/assets.ts", "packages/contracts/assets.ts (lock)"], contracts=["assets.lock.json"], decs=["D-CARDS"])
t("OGM-063", "assets", 3, "gm build assets: tiers, manifest and budgets", "A game's used assets become kit GLBs / per-tier GLBs / MP3s with content-hashed names and assets/manifest.json carrying licence per asset (weld, quantize, meshopt, WebP; KTX2 behind a flag); the mobile budget fails the build.",
  deps=["OGM-062", "OGM-020"], reqs=["R54"], writes=["packages/gm-cli/src/commands/build/assets/*"], decs=["D-TIERS"])
t("OGM-064", "assets", 4, "gm packs import and the intake service over the Drive queue", "A settled drop becomes a quarantined collection card, safely unpacked, measured (glTF geometry, rig, clips, images, fonts), previewed; services/intake consumes queue.jsonl and writes intake.json; gm-asset-intake shrinks to licence judgment.",
  deps=["OGM-060", "OGM-061"], sug=["OGM-009"], reqs=["R80", "R81", "R82", "R85", "R87"], writes=["packages/gm-cli/src/commands/packs/import.ts", "packages/asset-measure/*", "services/intake/*", ".claude/skills/gm-asset-intake/SKILL.md"], decs=["D-BUCKET"], risk="high")
t("OGM-065", "assets", 4, "Local taggers: audio, maps and CLIP on contact sheets", "gm packs tag runs the Python workers through the JSONL contract; a contact-sheet renderer plus CLIP lift-ranking produces measured|tagged 3D/2D asset cards with no spend; respects processing: local-only.",
  deps=["OGM-064"], reqs=["R52", "R86"], writes=["packages/gm-cli/src/commands/packs/tag.ts", "packages/asset-previews/*", "scripts/py/audio/* (--json)", "scripts/py/maps/tag_maps.py (--json)", "scripts/py/tag/tag_sheets.py"], decs=["D-CARDS"], risk="high")
t("OGM-066", "assets", 2, "Style families and family enforcement in search", "style-families.json with the seven families, views and coverage; gm assets search defaults to the game's family with a logged exception flag; GET /api/catalog/style-families for the creation flow.",
  deps=["OGM-060"], reqs=["R55", "R20"], writes=["packages/asset-cards/data/style-families.json", "packages/asset-cards/src/families.ts", "services/api/src/catalog/routes.ts"], decs=["D-FAMILIES"], risk="low")
t("OGM-067", "assets", 2, "Hash blocklist feed and map layout search", "gm packs blocklist unions redistribution: none hashes into one sorted feed for the commit service; gm maps search over layout specs behind the derive-layout right; the blob store import of assets-local previews and private manifests.",
  deps=["OGM-060", "OGM-005"], reqs=["R53", "R83"], writes=["packages/gm-cli/src/commands/packs/{blocklist,index}.ts", "packages/gm-cli/src/commands/maps/*"], decs=["D-BUCKET"], risk="low")
t("OGM-068", "assets", 2, "Tier-2 mirrors (gm packs sync)", "KayKit, LPC, game-icons and Fontsource pinned mirrors imported with per-item licences; no live API adapters.",
  deps=["OGM-064"], reqs=["R57"], writes=["packages/gm-cli/src/commands/packs/sync.ts"], decs=["D-CARDS"], risk="low")

# ---- web
t("OGM-070", "web", 2, "Web app scaffold and Netlify delivery", "apps/web (Vite 7, React 19, TS, react-router, TanStack Query, zustand, Vitest, Playwright) builds, tests and deploys to the existing site with _redirects (SPA + /api proxy), _headers, tokens.css from studio-v0, the two-cache sw.js, manifest and icons, window.__ogmHost behind ?test, tools/deploy.sh with the frame-by-frame load check.",
  deps=["OGM-001"], reqs=["R110", "R113", "R114"], writes=["apps/web/*", "apps/web/tools/deploy.sh"], contracts=["route table", "screen module convention"], decs=["D-LOOK", "D-ORIGIN"])
t("OGM-071", "web", 3, "Shell: title town, sound, PWA, input, notifications, bug button", "Title with poster→town reveal and the sfx/tap relay from public/town/, sound.ts port, gamepad poller and focus zones (Norigin exception), notification permission and push subscribe, the global bug-report button posting to the reports API.",
  deps=["OGM-070"], sug=["OGM-016", "OGM-015"], reqs=["R111", "R112", "R113"], writes=["apps/web/src/routes/title/*", "apps/web/src/lib/{sound,input,notify}/*", "apps/web/src/features/bug-report/*", "apps/web/public/town/*"], decs=["D-LOOK"])
t("OGM-072", "web", 2, "Age screen, sign-in and GitHub connect", "Neutral 18+ screen before any collection; email + passkey + Google through the Better Auth client; GitHub connect with the public/private pick.",
  deps=["OGM-070", "OGM-011"], reqs=["R2", "R1", "R6"], writes=["apps/web/src/routes/{age,signin,connect}/*", "apps/web/src/lib/api/auth.ts"], risk="low")
t("OGM-073", "web", 2, "Games picker", "Tiles and spotlight from real games, versions on the card, Play/Edit, building state from the job stream, keyboard and controller browsing.",
  deps=["OGM-070", "OGM-012"], reqs=["R112"], writes=["apps/web/src/routes/games/*"], risk="low")
t("OGM-074", "web", 3, "Creation flow and scope chat", "Steps from catalog data (genre, vibe, style family, world, players, point of view), Other by typing or dictation, the scope chat (text, dictation, voice when flagged) ending in an admitted job, budget offers as choices, image upload with EXIF strip.",
  deps=["OGM-070", "OGM-013", "OGM-066", "OGM-088"], reqs=["R20", "R21", "R25", "R12"], writes=["apps/web/src/routes/new/*", "apps/web/src/features/scope-chat/*"], decs=["D-VOICE-ZERO"])
t("OGM-075", "web", 4, "Game host and editor framework", "Separate-origin iframe through @gm/host, Play/Edit, platform HUD (pause, saves, achievements, settings), the editor framework (rail, palette, inspector with scope labels, tools, gizmo overlay, snap prefs) over the design log with undo/redo and the Saved indicator, edit while building, draft vs published, update indicator.",
  deps=["OGM-070", "OGM-028", "OGM-041"], reqs=["R30", "R34", "R112"], writes=["apps/web/src/routes/game/*", "apps/web/src/features/editor/*"], decs=["D-LOG"], risk="high")
t("OGM-076", "web", 3, "Build chat panel", "Replaces the prototype tracker: FAB → bar → list, per-job chat with text, dictation and voice modes, media cards, progress rows, usage in friendly units, checkpoint cards, queued-at-reset jobs with edit and cancel, phone layout.",
  deps=["OGM-070", "OGM-080", "OGM-083"], reqs=["R22", "R24"], writes=["apps/web/src/features/build-chat/*"], decs=["D-BUILD-CHAT"])
t("OGM-077", "web", 3, "Versions, releases and merge screens", "New version from here, switch, play either, cap 5; publish from main with the derived version and editable changelog; rollback with the affected-saves warning; merge flow with side-by-side previews and per-conflict choices.",
  deps=["OGM-075", "OGM-043", "OGM-044", "OGM-045"], reqs=["R37", "R38", "R90", "R92"], writes=["apps/web/src/routes/game/{versions,releases,merge}/*"], decs=["D-VERSION"])
t("OGM-078", "web", 3, "Multiplayer screens", "Invite button with share sheet, /join landing through sign-in into the room, watcher mode (follow camera or free look, 'talking to the builder…'), version badge, host-left end state.",
  deps=["OGM-075", "OGM-052", "OGM-053"], reqs=["R70", "R73", "R77"], writes=["apps/web/src/features/room/*"], decs=["D-ROOMS"])
t("OGM-079", "web", 3, "Admin and build analytics screens", "Members, peer admins, invites, allowance and reset, concurrency, platform cap, oversight list and actions, Drive intake status; build analytics: aiur phase timeline plus activity breakdown per build and roll-ups.",
  deps=["OGM-072", "OGM-017", "OGM-014"], reqs=["R3", "R66", "R84"], writes=["apps/web/src/routes/admin/*"], risk="low")

# ---- chat and voice
t("OGM-080", "chat-voice", 3, "Build chat backend", "Message store, media upload to the blob store, SSE stream, creator text → aiur messages through the AiurClient contract, aiur progress and lifecycle events → system rows; packages/contracts/chat.ts with BuildChatMessage.",
  deps=["OGM-010", "OGM-005", "OGM-030"], reqs=["R22", "R24"], writes=["services/api/src/build-chat/*", "packages/contracts/chat.ts"], contracts=["BuildChatMessage", "chat stream"], decs=["D-BUILD-CHAT"])
t("OGM-081", "chat-voice", 3, "gm chat post and gm checkpoint", "Agents post stills and clips from inside a build and open checkpoints (option ids = candidate media ids, --recommend, --blocking) that emit decision.requested through the aiur agent tools; gm checkpoint wait prints the chosen option.",
  deps=["OGM-060", "OGM-080"], reqs=["R22", "R23"], writes=["packages/gm-cli/src/commands/{chat,checkpoint}/*"], decs=["D-BUILD-CHAT"])
t("OGM-082", "chat-voice", 3, "Direction checkpoints bridge", "Open aiur Commands for a job become checkpoint cards with candidate media; answers go to /decide; notification; non-blocking by default; the ≤3 per creation / ≤1 per feature budget enforced in the design skill text and the card.",
  deps=["OGM-080", "OGM-032"], reqs=["R23"], writes=["services/api/src/checkpoints/*", "apps/web/src/features/build-chat/checkpoint-card.tsx"], decs=["D-BUILD-CHAT"])
t("OGM-083", "chat-voice", 2, "Voice client, dictation and read-aloud", "packages/voice-client: TS port of the voice_converse browser client (AudioWorklet capture, PCM playback, captions, drafts) typed from @aiur/contracts; Web Speech push-to-talk dictation with partial/final captions and review-before-send; speechSynthesis read-aloud with sentence highlighting.",
  deps=["OGM-001"], reqs=["R21"], writes=["packages/voice-client/*"], decs=["D-VOICE-ZERO"], risk="low")
t("OGM-085", "chat-voice", 3, "Voice host service (Elixir)", "services/voice-host: a supervised voice_converse instance pinned to aiur 0f692a45b with OGM ports, HMAC token secret shared with the API, loopback WebSocket, transcript: :none, privacy policy, briefing cache and internal HTTP (briefing push, instruct callback); e2e test with FakeProvider; POST /api/voice/token in the API.",
  deps=["OGM-002", "OGM-003", "OGM-010"], reqs=["R21"], writes=["services/voice-host/*", "services/api/src/voice/token.ts"], contracts=["voice token", "VoiceTarget", "briefing push"], decs=["D-VOICE-ZERO"], gates=["GATE-MIX-DEPS"])
t("OGM-086", "chat-voice", 3, "Budget-aware voice agent", "Budget section and extra block in the briefing, the creator role file (trim, split, queue, ask an admin; quiet when it fits), confirmed drafts routed to admission with now|at_reset, mid-build overrun announcement; tested with FakeProvider.",
  deps=["OGM-085", "OGM-018"], reqs=["R12", "R21"], writes=["services/voice-host/lib/ogm_voice/ports/*", "services/voice-host/roles/creator.md", "services/api/src/voice/instruct.ts"], decs=["D-VOICE-ZERO"])
t("OGM-087", "chat-voice", 3, "Narration pipeline (key-gated)", "render_to_file behind the host's internal HTTP; OGM renders dialogue lines once by content hash to the blob store; SDK SpokenText player with sentence highlighting; works end to end with FakeProvider and switches to a real adapter when a key and upstream render_speech exist.",
  deps=["OGM-085", "OGM-005", "OGM-027"], reqs=["R21"], writes=["services/voice-host/lib/ogm_voice/http/narration.ex", "services/api/src/narration/*", "packages/sdk/src/audio/spoken-text.ts"], decs=["D-VOICE-ZERO"], gates=["GATE-PROVIDER-KEY"], risk="low")
t("OGM-088", "chat-voice", 3, "Scope session as an aiur ticket", "A short scope ticket in the game repo whose worker runs the scope conversation through aiur messages (loading gm-scope-options) and ends by writing the agreed scope to the API; the voice session targets the same ticket when a key exists.",
  deps=["OGM-031", "OGM-036"], sug=["OGM-095"], reqs=["R20", "R21"], writes=["services/builder/src/scope/*", "services/api/src/scope/*"], decs=["D-VOICE-ZERO"])

# ---- skills and verify
t("OGM-090", "skills", 3, "gm run, gm shot, gm perf and the verify report", "TypeScript port of capture.mjs, loadtime.mjs and loadrec.mjs on the GPU flags with SwiftShader fallback: stills at desktop and phone, tiled timeline, H.264 clip, renderer string, console dedupe, tier budgets, the verify report JSON, a host-wide capture semaphore of 2.",
  deps=["OGM-060", "OGM-020"], reqs=["R102"], writes=["packages/gm-verify/*", "packages/gm-cli/src/commands/{run,shot,perf}/*"], contracts=["verify report"], decs=["D-VERIFY-GPU"])
t("OGM-091", "skills", 3, "Skill pack scaffold, gm-core and gm new", "gm new writes the scaffold from templates/, .claude/skills, .codex/skills links, .agents/skills, skills.lock, AGENTS.md; gm-core ≤120 lines (tier order, gm cheat sheet, done rule, show-as-you-go, anti-sameness rules, activity taxonomy); gm-build with pnpm install --offline.",
  deps=["OGM-060"], sug=["OGM-023", "OGM-024", "OGM-038"], reqs=["R100", "R101", "R104"], writes=["skills/gm-core/*", "skills/gm-build/*", "packages/gm-cli/src/commands/new/*", "packages/gm-cli/src/commands/skills/*"], contracts=["skill pack layout"], decs=["D-SKILLS-IN-REPO"])
t("OGM-092", "skills", 2, "Vendored engine reference layer and API-name checker", "Phaser official, CloudAI three.js (minus R3F) and awesome-gamedev adaptations vendored at pinned SHAs with licence front matter, skills.lock, and tools/skills/check-api-names.ts with a test.",
  deps=["OGM-001"], reqs=["R100"], writes=["skills/vendor/*", "tools/skills/check-api-names.ts"], decs=["D-SKILLS-IN-REPO"], risk="low")
t("OGM-093", "skills", 3, "gm-verify skill, gm check and gm test gates", "The rewritten skill (look rules, defect checklist, budgets, unchecked list, loopback bind rule); L0 static (typecheck, lint banning Math.random/Date.now in simulation, hook present) and L1 smoke (boot, 3,600 ticks, state round-trip, HUD still) as gm check and gm test.",
  deps=["OGM-090", "OGM-022"], reqs=["R103"], writes=["skills/gm-verify/*", "packages/gm-cli/src/commands/{check,test}/*", "packages/gm-verify/gates/*"], decs=["D-VERIFY-GPU"])
t("OGM-094", "skills", 2, "Platformer skill, pattern cards and gm docs pattern", "gm-genre-platformer with four to six themeless cards (jump buffer and coyote, deadzone camera, one-way platforms, hit feedback tiers) each with an advanceTime test; gm docs pattern.",
  deps=["OGM-091", "OGM-092", "OGM-024"], reqs=["R104"], writes=["skills/gm-genre-platformer/*", "packages/gm-cli/src/commands/docs/*"], decs=["D-SKILLS-IN-REPO"], risk="low")
t("OGM-095", "skills", 3, "Skill wave 2: gm-input, gm-ui-hud, gm-audio, gm-scope-options, gm-editor-tuning", "Five short skills written to the B14 verdicts against the SDK's input map, HUD model, audio module (ZzFX, Tone getTransport), the creation options and the editor manifest; one PR each inside one umbrella ticket.",
  deps=["OGM-091", "OGM-025", "OGM-027"], reqs=["R100"], writes=["skills/gm-{input,ui-hud,audio,scope-options,editor-tuning}/*"], decs=["D-SKILLS-IN-REPO"], risk="low")
t("OGM-096", "skills", 4, "Repair loop: triage, gm-repair and promise tests", "Signature dedupe, headless replay classification, editor-fix routing, the repair ticket body and after_create diagnostics, promises/*.spec.ts generator, attempts and reservation as config.",
  deps=["OGM-090", "OGM-093", "OGM-015", "OGM-034"], reqs=["R68"], writes=["services/repair/*", "skills/gm-repair/*", "packages/gm-verify/replay.ts"], decs=["D-BUILD-CHAT"], risk="high")
t("OGM-097", "skills", 3, "Sameness eval harness", "Ten briefs, with_skill vs baseline configs, M1 (jscpd), M4 (unasked mechanics) and M5 (card-default fingerprint) assertions, benchmark.md; runs on demand on the signed-in agents, never in CI.",
  deps=["OGM-090", "OGM-094"], reqs=["R105"], writes=["evals/skills/*", "tools/skills/eval.ts"], decs=["D-SKILLS-IN-REPO"], risk="low")

# ---- capstone
t("OGM-100", "capstone", 3, "End-to-end proof on this machine", "Kevin's flow proven with evidence: sign in on a phone, make a game by text, see stills arrive, play the draft, edit while a second build runs, branch, invite a family member, publish; all services on this machine; recorded clips and a checklist in docs/plans/ogm-v1-build/acceptance.md.",
  deps=["OGM-034", "OGM-036", "OGM-045", "OGM-053", "OGM-075", "OGM-076", "OGM-096", "OGM-029", "OGM-074", "OGM-006"], reqs=["R120"], writes=["docs/plans/ogm-v1-build/acceptance.md"], decs=["D-MONOREPO-FIRST"], kind="capstone")
t("OGM-101", "capstone", 1, "Archive the prototypes", "prototypes/README.md and the studio-v0/ui-v0 READMEs point at their successors; title-city sources move under apps/web as the built asset; the old deploy script is retired.",
  deps=["OGM-070", "OGM-071"], reqs=["R124"], writes=["prototypes/README.md", "apps/web/title-town/*"], decs=["D-LOOK"], risk="low")

GATES = {
    "GATE-TS-OPERATOR": ("Kevin runs `sudo tailscale set --operator=orangekid` and approves Funnel on 8443/10000", "Kevin"),
    "GATE-GITHUB-APP": ("Kevin creates the OGM GitHub App (free) and installs it on his account; App id, installation id and PEM path go in the commit service env file", "Kevin"),
    "GATE-GOOGLE-OAUTH": ("Kevin creates a Google OAuth client (testing mode) for sign-in; passkey and magic link work without it", "Kevin"),
    "GATE-BACKUP-TARGET": ("Kevin confirms the tailnet node for backups and SSH access from this account", "Kevin"),
    "GATE-MIX-DEPS": ("A one-time `mix deps.get` for the voice host (network); check aiur/src/deps first", "Executor with Kevin's go-ahead"),
    "GATE-PROVIDER-KEY": ("A voice provider key; not in V1 unless Kevin approves spend", "Kevin"),
    "GATE-MACHINE-USERS": ("Kevin creates two free GitHub machine users, ogm-intake (files issues, in allowed_users) and ogm-builder (the daemons' bot_account, collaborator on game repos only), and puts their PATs in the builder env file; his own PAT then leaves ~/.aiur/.env", "Kevin"),
}

def build():
    ids = {x["id"] for x in T}
    for x in T:
        for d in x["deps"] + x["ser"] + x["sug"]:
            assert d in ids, f"{x['id']} references unknown {d}"
        assert x["id"] not in x["deps"]
    # longest-path levels
    level = {}
    def lv(i):
        if i in level: return level[i]
        x = next(y for y in T if y["id"] == i)
        level[i] = 1 + max([lv(d) for d in x["deps"]], default=0)
        return level[i]
    for x in T: lv(x["id"])
    # critical path
    best = {}
    def cp(i):
        if i in best: return best[i]
        x = next(y for y in T if y["id"] == i)
        preds = [cp(d) for d in x["deps"]]
        chain = max(preds, key=len) if preds else []
        best[i] = chain + [i]
        return best[i]
    for x in T: cp(x["id"])
    longest = max(best.values(), key=len)
    # reverse edges
    blocks = defaultdict(list)
    for x in T:
        for d in x["deps"]: blocks[d].append(x["id"])
    reqs_all = sorted({r for x in T for r in x["reqs"]}, key=lambda s: int(s[1:]))
    pack = {
        "schema_version": 1,
        "build_order_id": "its-everdred/open-game-maker-2000:ogm-v1",
        "ticket_prefix": "OGM",
        "plan_version": 1,
        "repository": "its-everdred/open-game-maker-2000",
        "researched_at_commit": RESEARCHED,
        "workstreams": [{"id": k, "title": v[0], "icon": v[1], "summary": v[2], "wave": i} for i, (k, v) in enumerate(LANES.items())],
        "github_root": None,
        "github_reconciliation": None,
        "label_projection": {
            "build_order": "build-order",
            "workstreams": {k: f"build-lane:{k}" for k in LANES},
            "phases": {str(p): f"phase:{p}" for p in sorted(set(level.values()))},
            "complexities": {str(c): f"complexity:{c}" for c in sorted({x['cx'] for x in T})},
            "required_ticket_labels": ["agent:queued", "feature:ogm-v1"],
            "forbidden_labels": ["agent:in-progress", "agent:rework", "agent:merging"],
        },
        "feature_boundary": {
            "acceptance_criteria": [
                "An adult signs in on a phone, makes a game by text, watches stills arrive, plays the draft, edits while a second build runs, branches, invites a family member into a room, and publishes, with every service on this machine and no money spent.",
                "Every requirement in requirements.md has one disposition; every ticket is merged, green on main, and documented.",
            ],
            "critical_path_ticket_ids": longest,
            "required_documentation": ["docs/ops/runbook.md", "AGENTS.md", "docs/plans/ogm-v1-build/acceptance.md"],
            "required_cleanup": ["prototypes archived (OGM-101)"],
            "end_to_end_proof": ["OGM-100 acceptance checklist with recorded clips"],
            "completion_condition": "OGM-100 passes on current main with its evidence committed; the deferred-findings ledger holds everything else.",
        },
        "external_gates": [{"id": k, "title": v[0], "owner": v[1], "resolution_criteria": v[0]} for k, v in GATES.items()],
        "design_evidence": [],
        "decisions": [{"id": d, "summary": d, "status": "accepted", "rationale": "see decisions.md", "design_evidence_refs": []} for d in sorted({d for x in T for d in x["decs"]})],
        "requirements": [{"id": r, "summary": r, "disposition": "ticket", "ticket_ids": [x["id"] for x in T if r in x["reqs"]], "reason": None} for r in reqs_all],
        "tickets": [],
        "epic_acceptance": {"owner_ticket_id": "OGM-100", "evidence": ["docs/plans/ogm-v1-build/acceptance.md with clips"]},
        "graph_summary": {"levels": level, "blocks": dict(blocks), "critical_path": longest, "phase_count": max(level.values()), "ticket_count": len(T)},
    }
    for x in T:
        pack["tickets"].append({
            "id": x["id"], "kind": x["kind"], "provenance": "planned", "introduced_in_plan_version": 1, "discovered_from": None,
            "title": x["title"], "document": f"tickets/{x['id']}.md", "outcome": x["outcome"],
            "scope": [x["outcome"]], "non_goals": ["Anything owned by a sibling ticket; see the ticket document"],
            "phase_hint": level[x["id"]], "complexity_points": x["cx"], "complexity_rationale": "see the ticket document",
            "risk": x["risk"], "capability_requirements": [x["lane"]], "workstream": x["lane"], "requirement_refs": x["reqs"],
            "depends_on": x["deps"], "serializes_with": x["ser"], "suggested_after": x["sug"], "contains": [],
            "external_gates": x["gates"], "read_surfaces": [], "write_surfaces": x["writes"], "contract_surfaces": x["contracts"],
            "safety_surfaces": [], "conflict_exceptions": [], "decision_refs": x["decs"], "design_evidence_refs": [],
            "acceptance": {"agent_gate": ["see the ticket document"], "at_merge_gate": ["ci / required green on current main"], "human_or_e2e": []},
            "github": None,
        })
    with open(os.path.join(PACK, "build-order.json"), "w") as f:
        json.dump(pack, f, indent=1); f.write("\n")
    # graph.md
    by_level = defaultdict(list)
    for x in T: by_level[level[x["id"]]].append(x)
    lines = ["# Graph: waves, critical path, lanes", "",
             f"Generated by `tools/make_pack.py` from {len(T)} tickets at `{RESEARCHED[:7]}`. Phases are longest-path levels of the hard `depends_on` graph: every phase is an antichain, so each member is dispatchable the moment the previous phase completes. Lanes are thematic only.", "",
             "## Wave table", "", "| Phase | Tickets (lane, cx) |", "|---|---|"]
    for p in sorted(by_level):
        lines.append(f"| {p} | " + ", ".join(f"{x['id']} ({x['lane']}, {x['cx']})" for x in sorted(by_level[p], key=lambda y: y['id'])) + " |")
    lines += ["", f"Phase count: {max(level.values())} (budget 5–10). Width per phase: " + ", ".join(f"{p}:{len(by_level[p])}" for p in sorted(by_level)) + ".", "",
              "## Critical path", "", " → ".join(longest), "", "## Per-lane earliest start", "", "| Lane | First phase | Spine ticket |", "|---|---|---|"]
    for k in LANES:
        xs = [x for x in T if x["lane"] == k]
        first = min(xs, key=lambda y: (level[y["id"]], y["id"]))
        lines.append(f"| {k} | {level[first['id']]} | {first['id']} {first['title']} |")
    lines += ["", "## Top fan-out (spine) tickets", "", "| Ticket | Directly unblocks |", "|---|---|"]
    for i, outs in sorted(blocks.items(), key=lambda kv: -len(kv[1]))[:10]:
        lines.append(f"| {i} | {len(outs)}: {', '.join(sorted(outs))} |")
    lines += ["", "## Serialization pairs", "", "None declared: write surfaces were split instead (D-WRITE-SURFACES). Lockfile conflicts are resolved by re-running `pnpm install`.", "",
              "## Advisory ordering (`suggested_after`)", ""]
    for x in T:
        if x["sug"]: lines.append(f"- {x['id']} after {', '.join(x['sug'])}")
    lines += ["", "## External gates", ""] + [f"- {k}: {v[0]} (owner: {v[1]})" for k, v in GATES.items()]
    with open(os.path.join(PACK, "graph.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{len(T)} tickets, {max(level.values())} phases, critical path {len(longest)}: {' → '.join(longest)}")
    for p in sorted(by_level): print(f"phase {p}: {len(by_level[p])}")

if __name__ == "__main__":
    build()
