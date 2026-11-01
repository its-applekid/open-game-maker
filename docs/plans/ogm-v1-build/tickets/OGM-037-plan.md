# OGM-037 plan — Sandbox policy template, Codex permission profile and dispatch preflight

## 1. Problem frame

Creators' game builds run as Codex workers on this machine, same uid as everything else. The only zero-cost isolation is Codex CLI's own bwrap+landlock sandbox, configured through aiur's `agent.codex.turn_sandbox_policy`, plus a Codex permission profile that denies reads of the credential files an agent command could otherwise `cat` (E03-4, E03-9). aiur's defaults are network-open and read-everything, and the platform's own `.aiur/config` in this tree is the wrong example (E03-10). This ticket produces the renderer every game daemon's config comes from, the profile that closes the read hole, a probe that proves (or disproves) the profile, and the preflight that refuses to dispatch against a config that drifted. It also creates the `services/builder` package: `@ogm/builder` is a workspace package hosted inside the API process (T11 §4 lists no builder unit and D-DB gives the database to the API process alone); later lane tickets add one directory each.

**Requirements trace**
- R63 → the rendered policy gives per-job isolation with what the host offers (bwrap/landlock via Codex, cgroups via OGM-002's slices), no egress from agent commands (`networkAccess: false`), no secrets readable (`deny_read`), and a preflight that fails closed when the policy on disk is not the rendered one.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/src/examples/workflows/github-codex.yaml` — key order and comments of a complete `.aiur/config`; the renderer emits the same sections.
- `/home/orangekid/github/aiur/src/lib/aiur/config/schema/codex.ex:39-48` — the accepted `turn_sandbox_policy` keys and the note that `.agents` gets write access while `.codex` stays protected.
- `/home/orangekid/github/aiur/src/lib/aiur/config/codex_sandbox_policy.ex:66-83` — what aiur fills in when the policy is nil (so the renderer always sets it explicitly).
- `/home/orangekid/github/aiur/src/lib/aiur/config/schema.ex:195-209` — configured `writableRoots` must exist and be writable at load; OGM-034 must `mkdir -p` the workspace root before start.
- `/home/orangekid/github/aiur/src/lib/aiur/orchestrator/hosted_mode_check.ex:175-205` — the four checks to mirror in `preflight`: sandbox type `workspaceWrite|readOnly`, `networkAccess === false`, Claude `permission_mode !== bypassPermissions`, no `+remote` routes.
- `/home/orangekid/github/aiur/src/lib/aiur/init/agent_cli.ex:134-159` — how aiur probes `codex sandbox -- /bin/pwd`; the probe script extends this with the profile.
- `/home/orangekid/github/aiur/src/lib/aiur/accounts/shims/codex.ex:6-9` — `CODEX_HOME` is the profile dir; `config.toml` is a shared path, `auth.json` is never shared.
- `/home/orangekid/games/open-game-maker-2000/.aiur/config:60-75,96-106` (untracked working-tree file) — the anti-pattern: `/tmp` writable, `networkAccess: true`, `approval_policy: never`, `bypassPermissions`.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — `@ogm/builder` package scaffold
- Goal: `services/builder` exists so OGM-031/032/034/036 can add directories without touching each other's files.
- Files: Create `services/builder/package.json` (`"name": "@ogm/builder"`, scripts `build/test/typecheck/lint`), `services/builder/tsconfig.json`, `services/builder/src/index.ts` (re-exports `./policy/index.js` only).
- Approach: copy the shape of the first package OGM-001 created. Dependencies: `yaml`, `zod`. `src/index.ts` is append-only (one line per directory), like `packages/contracts/src/index.ts`.
- Interface sketch: `export * from "./policy/index.js";`
- Test scenarios: Given the workspace when `pnpm -r typecheck` runs then `@ogm/builder` builds with no sources beyond policy.

### U2 — Config renderer
- Goal: one deterministic function from facts to the daemon's `.aiur/config` text.
- Files: Create `services/builder/src/policy/types.ts`, `services/builder/src/policy/render.ts`, `services/builder/src/policy/index.ts`. Test `services/builder/test/policy/render.test.ts`, fixture `services/builder/test/fixtures/config.expected.yaml`.
- Approach: `RenderInput` is validated with zod (repo `owner/name`, absolute `workspaceRoot`, `port` 1024–65535, logins `^[A-Za-z0-9-]+$`, `denyReadRoots` absolute or `~/`). Build a plain object in the T02 §4 key order (`tracker`, `instance`, `merge_policy`, `polling`, `server`, `workspace`, `hooks_file`, `prompt_file`, `agent`, `events`, `observability`) and `yaml.stringify` it with `lineWidth: 0`. Fixed values: `tracker.kind: github`, `base_branch: main`, `active_states`/`terminal_states` as in the starter, `tracker.github.allowed_users: [input.intakeLogin]`, `trusted_accounts: [input.intakeLogin]`, `bot_account: input.botAccount`, `identity_mode: separate_account`, `human_mergers: []` (E02-13: OGM merges through its App), `instance: {mode: local, deployment_kind: operator, role: primary}`, `merge_policy: {ci: wait, local_tests: partial}`, `polling: {interval_seconds: 60, intervals: {dispatch: 60, review: 300, planning: 0}}`, `server: {host: 127.0.0.1, port: input.port, tailscale_funnel: false}`, `workspace: {root: input.workspaceRoot}`, `hooks_file: hooks`, `prompt_file: prompt.md`, the verbatim `agent` block with `writableRoots: [input.workspaceRoot]`, `max_dispatches_per_ticket: 3`, `max_turns_by_complexity: {1: 4, 2: 8, 3: 12, 4: 16, 5: 20}`, `max_agent_duration_minutes: input.kind === "new_game" ? 90 : 45` (B8 §5), `max_concurrent_agents: input.maxConcurrentAgents ?? 1` (1–2), `events: {export: {enabled: true}}`, `observability: {capture_label_prefixes: ["feature:"]}`. Guards (throw `PolicyViolation`): any override attempting `networkAccess !== false`, `excludeSlashTmp !== true`, `writableRoots` other than `[workspaceRoot]`, `approval_policy: never`, `claude` block present, `instance.mode: hosted`.
- Interface sketch:
  ```ts
  export type RenderInput = { repo: string; baseBranch?: "main"; workspaceRoot: string; port: number; intakeLogin: string; botAccount: string; kind: "new_game" | "feature" | "repair"; maxConcurrentAgents?: 1 | 2; denyReadRoots: string[]; instanceId?: string /* default: the daemon slug */ };
  export function renderAiurConfig(input: RenderInput): string;      // YAML text
  export function renderCodexProfile(input: RenderInput): string;    // TOML text
  ```
- Test scenarios:
  - Given the worked input when rendered then output equals the fixture.
  - Given two renders of the same input then the strings are identical.
  - Given `maxConcurrentAgents: 3` then zod rejects.
  - Given a crafted override with `networkAccess: true` then `PolicyViolation`.
  - Given `kind: "new_game"` then `max_agent_duration_minutes: 90`.
- Execution note: write the fixture by hand first from the T03/T02 §4 blocks, then make the renderer produce it (test-first keeps the key order honest).
- Fixture excerpt (`test/fixtures/config.expected.yaml`, the `tracker`, `instance`, `server`, `workspace` and `agent` sections for the worked input; the renderer emits the rest from the starter's defaults):
  ```yaml
  tracker:
    kind: github
    base_branch: main
    github:
      repo: everdred-games/castle-run
      bot_account: ogm-builder
      identity_mode: separate_account
      allowed_users: [ogm-intake]
      trusted_accounts: [ogm-intake]
      human_mergers: []
  instance: { mode: local, deployment_kind: operator, role: primary, id: everdred-games-castle-run }
  server: { host: 127.0.0.1, port: 4101, tailscale_funnel: false }
  workspace: { root: /home/orangekid/.local/share/ogm/daemons/everdred-games-castle-run/workspaces }
  hooks_file: hooks
  prompt_file: prompt.md
  events: { export: { enabled: true } }
  decisions: { supervisor_allowed_kinds: [decision.requested] }
  ```
  followed by the verbatim `agent` block with `writableRoots: ["/home/orangekid/.local/share/ogm/daemons/everdred-games-castle-run/workspaces"]`, `max_dispatches_per_ticket: 3`, `max_turns_by_complexity`, and `max_agent_duration_minutes: 90` for `kind: new_game`.

### U3 — Codex permission profile
- Goal: a profile file that denies the E03-9 paths and other daemons' workspaces to sandboxed commands.
- Files: Create `services/builder/sandbox/profile.toml` (the checked-in template with `{{DENY_READ}}` placeholder), `services/builder/src/policy/profile.ts`. Test `services/builder/test/policy/profile.test.ts`.
- Approach: `renderCodexProfile(input)` reads the template, substitutes a TOML array of `input.denyReadRoots` plus `~/.config/gh`, `~/.aiur/github-budget`, `~/.codex/auth.json`, `~/.claude`, `~/.claude-2`, `~/.config/ogm`, `~/.config/netlify`, `~/.ssh`, `~/.aiur/.env`, and emits the same list as `secret_file` entries. It drops any entry that is a prefix of `workspaceRoot` (a daemon must read its own workspace). The profile name is `gamebuilder`. `profileHash(text)` = sha256 hex for preflight.
- Interface sketch: `[permissions.gamebuilder.filesystem]\ndeny_read = [...]\nsecret_file = [...]` (keys [I] until U5 confirms; U5 may rename them and the test fixture follows).
- Test scenarios:
  - Given the worked input then every E03-9 path appears once in `deny_read`.
  - Given `denyReadRoots` containing `workspaceRoot` then it is omitted.
  - Given the same input twice then equal hashes.

### U4 — Preflight
- Goal: refuse dispatch when the daemon directory does not match the render.
- Files: Create `services/builder/src/policy/preflight.ts`. Test `services/builder/test/policy/preflight.test.ts` (uses a temp dir).
- Approach: `preflight(daemonDir, input)` reads `<daemonDir>/.aiur/config` and `<codexHome>/config.toml`; parses both; compares the guarded keys (`agent.codex.*`, `agent.priority`, `agent.accounts`, `instance.*`, `workspace.root`, `tracker.github.repo`, `tracker.github.allowed_users`, `hooks_file`, `prompt_file`, `events.export.enabled`) against the render with deep equality; compares the profile hash; mirrors the four hosted-mode checks on the parsed file regardless of the render (defense in depth). Returns `{ok: true}` or `{ok: false, reasons: string[]}` naming each key; a missing file is a reason, never an exception.
- Interface sketch: `export async function preflight(daemonDir: string, codexHome: string, input: RenderInput): Promise<{ ok: true } | { ok: false; reasons: string[] }>`.
- Test scenarios:
  - Given a temp dir with the rendered files then `ok`.
  - Given `networkAccess` edited to `true` on disk then `ok: false` with reason `agent.codex.turn_sandbox_policy.networkAccess`.
  - Given the profile file changed then reason `codex profile hash`.
  - Given no config file then reason `missing .aiur/config`.

### U5 — Probe script (spike S1)
- Goal: measured truth about `deny_read` on Codex CLI 0.162.1 on this host.
- Files: Create `scripts/sandbox/probe.sh` (bash, `set -euo pipefail`, no network).
- Approach: args `--codex-home <dir>` (default `~/.config/ogm/codex-gamebuilder`), `--profile gamebuilder`. It writes the rendered profile into a temp `CODEX_HOME` (never Kevin's `~/.codex`), copies nothing else, then for each path in the E03-9 list runs `codex sandbox -P gamebuilder --sandbox-state-disable-network -- /bin/sh -c 'test -r <path> && echo READ || echo DENIED'`, a network row (`/bin/sh -c 'cat /proc/net/dev'` must list only `lo`), a `/tmp` write row, a workspace write row (must be writable), and prints a Markdown table. Exit 0 always; the table is the result. If `-P` is rejected, retry with `-c 'permissions.gamebuilder.filesystem.deny_read=[...]'`, then record "profile mechanism: `-c` only". Also try the app-server path: `codex app-server` is what aiur runs, so note whether `agent.codex.command: codex -P gamebuilder app-server` is accepted (`codex --help` lists `-P` as a `sandbox` option only); this decides OGM-034's `command` line.
- Interface sketch: `bash scripts/sandbox/probe.sh [--codex-home DIR] [--profile NAME]` → Markdown table on stdout.
- Test scenarios:
  - Given this host when run then the table has one row per path and a network row reading `lo only`.
  - Given `codex` absent then it prints `codex not on PATH` and exits 0.

## 4. Verification

```
pnpm --filter @ogm/builder test
pnpm -r typecheck && pnpm -r lint
bash scripts/sandbox/probe.sh
```
Paste into `## Local tests`: Vitest counts; the full probe table; `codex --version` (expect `codex-cli 0.162.1`); whether `deny_read` held; which mechanism attaches a profile to `codex app-server`.

## 5. Deferred to implementation

- Exact TOML key names for the profile (`deny_read`, `secret_file`, `readable_roots`): default as in T03 §4; U5 corrects.
- How a profile binds to `codex app-server` turns (`-P` on the command, `-c permissions.…`, or a default profile key in `config.toml`): default `agent.codex.command: codex app-server -c <override>` rendered by OGM-034 from U5's finding.
- Whether `~` is expanded by aiur in `writableRoots`: default render absolute paths (aiur canonicalizes, `schema.ex:195-209`).
- `max_concurrent_agents` 1 vs 2 per daemon: default 1; OGM-034 passes 2 for a repo with a creation and an edit job admitted together.

## 6. Scope boundaries

- No daemon lifecycle, no env files, no `remote-instances.yaml` (OGM-034).
- No `hooks`, `prompt.md`, labels, CI workflow or skills links (OGM-036).
- No pnpm store seeding or proof suite (OGM-038).
- No commit boundary or content gate (OGM-035/039).
- No Claude profile (T03 C9; V1 builds are Codex-only until Kevin confirms the Claude fallback).

## 7. Risks

- `deny_read` unsupported or ignored (E03-4 [I]) — default: record; apply the T03 §6 S1 fallback; the bot PAT residual (E03-8) stays and is written into `docs/ops/sandbox.md` by OGM-038.
- A profile cannot be attached to app-server turns — default: `-c` overrides on `agent.codex.command`; if that also fails, OGM-034 renders a `CODEX_HOME` whose `config.toml` has the profile as default and the finding is logged.
- aiur rejects `writableRoots` that do not yet exist at config load — default: OGM-034 creates the workspace root before `systemctl start`; preflight also checks the directory exists.
- Elixir `mix`-style loopback needs that justified aiur's network-open default do not apply to game builds (Node/pnpm offline), so `networkAccess: false` is safe; if a template's `gm test` needs a loopback listener, Codex's sandbox still allows `lo` (E03-4 shows `lo` present).
