# OGM-034 plan — Daemon fleet manager

## 1. Problem frame

aiur serves one repository per daemon (E02-12), creators each get their own game repo (A11), and the host can carry about four agents beside the services (E11-4). So OGM runs one `ogm-aiur@<slug>.service` per *active* game repo, starts it on the first admitted job, stops it after idle, caps the live count at four, and gives each daemon its own directory, cookie, write token and bot credential (D-DAEMONS, D-AIUR-MODE). This ticket is the host-side lifecycle; OGM-037 renders what goes in the directory, OGM-036 provides hooks and prompt, OGM-031/032/033 use the client each daemon exposes. `@ogm/builder` is hosted in the API process (T11's unit layout has no builder unit; D-DB keeps the database with the API), so `systemctl --user` calls run from the API process under `ogm-api.service`.

**Requirements trace**
- R61 → template unit, start on first admitted job, stop after idle, cap 4, config rendered per repo with `instance.mode: local`, `priority`, per-ticket limits, hooks and events export; one write token per daemon (R60's "one write token per daemon" is minted here).

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/ogm-drive-sync.service` — the unit hardening lines and the `%h`-relative `ExecStart` style.
- `/home/orangekid/github/aiur/website/docs-app/reference/cli-launch.md:41,66` — `aiur run --container` semantics (no tmux, SIGTERM forwarded, cookie ≥16 chars, `AIUR_CONTAINER_STOP_GRACE_TICKS`), and `:38` for `token create`.
- `/home/orangekid/github/aiur/website/docs-app/reference/cli-options.md:58-75` — `remote-instances.yaml` format (`url`, `token_env` or `token_file` 0600, HTTP for loopback).
- `/home/orangekid/github/aiur/website/docs-app/reference/configuration-daemon.md:20-32` — env layering and `AIUR_SECRETS_FROM_ENV=1`, `AIUR_GITHUB_ALLOW_PAT=1`.
- `/home/orangekid/github/aiur/src/lib/aiur/client_tokens.ex:9-24,67-70` — tokens are `aiur_` + 32 random bytes, hashed into the instance's `client-tokens.json`; mint from the daemon dir so the hash lands in the right instance.
- `/home/orangekid/github/aiur/scripts/aiurdev:1-60` — `--instance` must be the first argument; `AIUR_REPO_ROOT` pins the checkout.
- `/home/orangekid/github/aiur/packaging/npm/aiur-cli/libexec/aiur-daemon-supervisor.sh:25-65` — the restart budget (5 per 600 s) this unit reproduces with `StartLimitIntervalSec=600 StartLimitBurst=5`.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Schema and record
- Goal: the `GameDaemon` record persists across API restarts.
- Files: Create `packages/db/migrations/<YYYYMMDDHHMM>_game_daemons.sql`, `packages/db/src/schema/game-daemons.ts`, `services/builder/src/fleet/types.ts`. Test `services/builder/test/fleet/types.test.ts`.
- Approach: table `game_daemons(slug PK, repo UNIQUE, checkout_path, unit, env_file, port UNIQUE, status, last_health_at, last_error, started_at, idle_since, max_concurrent_agents, created_at)`; the token is not a column. `types.ts` re-exports the verbatim `GameDaemon` type plus `DaemonRow` (Drizzle `$inferSelect`) and `slugFor(repo)`.
- Interface sketch: `export function slugFor(repo: string): string; // "owner/name" → "owner-name"`.
- Test scenarios:
  - Given `Everdred-Games/Castle_Run` then slug `everdred-games-castle-run`.
  - Given a 60-char name then truncated to 48 and still unique with a 4-char hash suffix.

### U2 — Daemon directory and secrets
- Goal: a complete, preflight-passing daemon directory from one call.
- Files: Create `services/builder/src/fleet/daemon-dir.ts`, `services/builder/src/fleet/secrets.ts`. Test `services/builder/test/fleet/daemon-dir.test.ts` (temp `$HOME`).
- Approach: `materialize(row, files: DaemonFiles)`: `mkdir -p <dir>/.aiur <dir>/workspaces` (0700); write `.aiur/config` = `renderAiurConfig(inputFor(row))` where `inputFor` builds OGM-037's `RenderInput` (`workspaceRoot: <dir>/workspaces`, `port`, `intakeLogin: OGM_INTAKE_BOT_LOGIN`, `botAccount: OGM_BUILDER_BOT_LOGIN`, `denyReadRoots`: the E03-9 list + `assets-local` + every *other* daemon's `workspaces`); write `.aiur/hooks` and `.aiur/prompt.md` from `files` (default provider: the clone+branch hook from `src/examples/workflows/github-codex.yaml` plus the bundle `curl` line from OGM-036's contract, and a copy of `github-codex.prompt.md`); write `<codexHome>/config.toml` = `renderCodexProfile(input)` where `codexHome` is aiur's profile dir for `gamebuilder` (`aiur login` created it; find it under aiur's accounts root, default `~/.config/ogm/codex-gamebuilder`). `secrets.ts`: generate `AIUR_ERLANG_COOKIE` with `crypto.randomBytes(32).toString('hex')` once per slug (reuse on restart), write the env file (`AIUR_ERLANG_COOKIE`, `GITHUB_TOKEN=<OGM_BUILDER_BOT_TOKEN>`, `AIUR_SECRETS_FROM_ENV=1`, `AIUR_GITHUB_ALLOW_PAT=1`, `OGM_HOOK_SECRET_FILE=~/.config/ogm/daemons/<slug>/hook-secret`, `OGM_INTERNAL_URL=http://127.0.0.1:<api port>`) with `mode: 0o600`, and the hook secret (32 random bytes, base64url) to its file. Every write is atomic (temp + rename).
- Interface sketch: `export type DaemonFiles = { hooks: string; prompt: string }; export async function materialize(row: DaemonRow, files: DaemonFiles, env: FleetEnv): Promise<{ dir: string; codexHome: string }>`.
- Test scenarios:
  - Given a fresh slug then the six files exist with the right modes.
  - Given a second materialize then the cookie is unchanged.
  - Given two rows then each config's `denyReadRoots` includes the other's workspaces and not its own.
  - Given `OGM_BUILDER_BOT_TOKEN` unset then it throws naming the variable, never a value.

### U3 — systemctl, tokens and registry
- Goal: start/stop a unit, mint tokens, register the instance, with every external call injectable.
- Files: Create `services/builder/src/fleet/systemctl.ts`, `services/builder/src/fleet/registry.ts`, `ops/systemd/ogm-aiur@.service`. Test `services/builder/test/fleet/systemctl.test.ts`, `test/fleet/registry.test.ts`.
- Approach: `Runner = (cmd: string, args: string[], opts: {cwd?, env?}) => Promise<{code, stdout, stderr}>` injected; `systemctl.start(slug)` = `systemctl --user start ogm-aiur@<slug>.service`; `isActive`; `stop`; `restart`. `mintTokens(dir)`: run `/home/orangekid/github/aiur/scripts/aiurdev token create ogm-api --scope write` and `… token create operator --scope read` with `cwd: dir` and the daemon env; parse the single printed token line; write to the 0600 files; if the daemon must be running first (E02 [I]), start, mint, continue. `registry.write(rows)`: `yaml.stringify({version: 1, instances: {[slug]: {url, token_file}}})` to `~/.aiur/remote-instances.yaml` via temp + rename, preserving entries whose slug does not start with the OGM prefix. The unit file text is in the ticket; add `StartLimitIntervalSec=600`, `StartLimitBurst=5`, `Environment=AIUR_REPO_ROOT=/home/orangekid/github/aiur`, `Environment=CODEX_HOME=%h/.config/ogm/codex-gamebuilder` only if U2's probe-derived mechanism needs it (OGM-037 U5 finding), `LogRateLimitIntervalSec=30`, `LogRateLimitBurst=1000`.
- Interface sketch: `export function createSystemctl(run: Runner): { start(slug): Promise<void>; stop(slug): Promise<void>; restart(slug): Promise<void>; isActive(slug): Promise<boolean> }`.
- The unit file (`ops/systemd/ogm-aiur@.service`):
  ```ini
  [Unit]
  Description=Open Game Maker 2000: aiur game-builder daemon for %i
  After=network-online.target
  StartLimitIntervalSec=600
  StartLimitBurst=5

  [Service]
  Type=simple
  Slice=ogm-agents.slice
  WorkingDirectory=%h/.local/share/ogm/daemons/%i
  EnvironmentFile=%h/.config/ogm/env/ogm-aiur@%i.env
  Environment=AIUR_REPO_ROOT=/home/orangekid/github/aiur
  ExecStart=/home/orangekid/github/aiur/scripts/aiurdev run --container
  Restart=on-failure
  RestartSec=10
  KillMode=mixed
  TimeoutStopSec=65
  UMask=0077
  NoNewPrivileges=yes
  LogRateLimitIntervalSec=30
  LogRateLimitBurst=1000

  [Install]
  WantedBy=default.target
  ```
- Test scenarios:
  - Given a fake runner then `start` invokes exactly `systemctl --user start ogm-aiur@x.service`.
  - Given `token create` output `aiur_abc…` then the file content is that token with mode 0600.
  - Given an existing registry with a foreign `nuc` entry then it survives a rewrite.

### U4 — Fleet policy: ensure, capacity, idle, health
- Goal: the public functions OGM-031/032 call, with the 4-live cap and 30-min idle stop.
- Files: Create `services/builder/src/fleet/fleet.ts`, `services/builder/src/fleet/health.ts`, `services/builder/src/fleet/index.ts`. Modify `services/builder/src/index.ts` (append one export line). Test `services/builder/test/fleet/fleet.test.ts`, `test/fleet/health.test.ts`.
- Approach: `ensureDaemon(repo, kind)`: row or create (allocate port = max(port)+1 starting 4101, bind-probe); if `status === 'running'` return; if live count ≥ 4 return `{status:'waiting_capacity'}`; materialize; `preflight(dir, codexHome, input)` → on failure store reasons, return `{status:'stopped', reasons}`; `mintTokens` if missing; `registry.write`; `systemctl.start`; set `starting`; `health.waitReady(port, 120_000)` polls `createAiurClient({baseUrl, token}).healthz()` every 10 s; `running` or `restart` once then `stopped` + `lastError`. `maxConcurrentAgents`: 2 when the jobs table shows both a `new_game` and an edit job admitted for this repo, else 1; a change re-renders config and calls aiur `set_setting` through `nudge`-style control (`aiur set agent.max_concurrent_agents`, a live key) so no restart is needed. `stopIdleDaemons()` (called by a 5-min interval the API owns): for each `running|idle` row with no job in `filed|running|paused` for that repo and `idle_since` older than 30 min → `systemctl.stop`, `status = stopped`. `daemonFor(repo)` returns `{row, client}` where `client = createAiurClient({baseUrl: http://127.0.0.1:<port>, token: readFile(client-token), supervisorToken: OGM_AIUR_SUPERVISOR_TOKEN})`. `health.monitor()`: 60 s poll per running daemon; three misses → restart; six → `stopped` + alert via OGM-016's `notify('admin', …)` when present.
- Interface sketch:
  ```ts
  export type EnsureResult = { status: 'running'; daemon: GameDaemon } | { status: 'waiting_capacity'; live: number } | { status: 'stopped'; reasons: string[] };
  export function createFleet(deps: { db; systemctl; runner; fetch; env: FleetEnv; files: () => Promise<DaemonFiles> }): {
    ensureDaemon(repo: string, kind: 'new_game'|'feature'|'repair'): Promise<EnsureResult>;
    daemonFor(repo: string): Promise<{ daemon: GameDaemon; client: AiurClient & AiurClientExtensions } | null>;
    listDaemons(status?: GameDaemon['status']): Promise<GameDaemon[]>;
    stopIdleDaemons(now?: Date): Promise<string[]>;
  };
  ```
- Test scenarios:
  - Given no row when `ensureDaemon` then port 4101, files written, preflight called, unit started, health polled, status `running`.
  - Given four live rows then `waiting_capacity` and no systemctl call.
  - Given preflight `{ok:false}` then no start and reasons stored.
  - Given a running daemon idle 31 min with no active jobs then stopped.
  - Given one idle 31 min with a `running` job then not stopped.
  - Given health misses 3× then restart called once.
- Execution note: write the capacity and idle tests first; they are the behavior admission depends on.

## 4. Verification

```
pnpm --filter @ogm/builder test
pnpm -r typecheck && pnpm -r lint
# host (after Kevin's two hand steps), from the API dev process or a one-off script:
node -e "import('@ogm/builder').then(m => m.createFleet(...).ensureDaemon('its-everdred/ogm-scratch','feature'))"
systemctl --user status 'ogm-aiur@*'
/home/orangekid/github/aiur/scripts/aiurdev --instance its-everdred-ogm-scratch status
systemctl --user stop ogm-aiur@its-everdred-ogm-scratch
```
Paste into `## Local tests`: Vitest counts; the `systemctl --user status` block (no secrets appear in it); the `aiurdev --instance … status` header; disk layout `ls -la ~/.local/share/ogm/daemons/<slug>/.aiur` and modes of the env and token files (`stat -c %a`).

## 5. Deferred to implementation

- Whether `aiurdev token create` works before the first daemon boot in that directory: default start first, then mint, then restart is not needed (tokens are read per request).
- Where aiur's `gamebuilder` Codex profile directory lives: default `~/.config/ogm/codex-gamebuilder`; if `aiur login` placed it elsewhere, symlink and record.
- Port range: default 4101–4199.
- Idle interval owner: default a `setInterval` registered in the API's startup (OGM-010's lifecycle hook) calling `stopIdleDaemons`.

## 6. Scope boundaries

- No policy or profile text (OGM-037); no hooks/prompt text beyond the built-in default (OGM-036).
- No issue filing or `agent:todo` (OGM-031); no feed consumption (OGM-032); no controls (OGM-033).
- No slice files, no `ogm-host-setup.sh`, no `ogm-status` (OGM-002/OGM-008); this ticket adds one template unit under `ops/systemd/`.
- No Claude profile; `agent.priority: [codex]`.

## 7. Risks

- Per-daemon BEAM memory (E02-12 unmeasured; ~1.2 GB for the platform daemon per T11) — default cap 4 and `MemoryMax=16G` on the slice (OGM-002); measure during the human check and lower the cap if needed.
- `aiurdev run --container` rebuilds the release when stale (first start slow) — default: accept; OGM-008's runbook notes `aiurdev build` after an aiur pull.
- The platform-build daemon and a game daemon share `~/.aiur` state roots — default: distinct `./.aiur/config` per daemon dir; `instance.id` set to the slug in the render (OGM-037 input) so coordination keys never collide.
- The builder bot PAT in every daemon env file (E03-8) — accepted residual; the machine user has no access to the platform repo.
