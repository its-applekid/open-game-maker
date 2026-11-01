# OGM-038 plan — Offline dependency store and sandbox proof suite

## 1. Problem frame

Agent commands in a game build have no network (OGM-037's policy), so a build can only install what is already on disk: the templates' lockfiles resolved against a seeded pnpm content-addressable store (E03-15). And the sandbox is a claim until it is exercised: B4 §6 lists the tests, written for a VM-per-job design; the ones that still mean something on a same-uid bwrap/landlock boundary are cross-workspace isolation (3), secret reads (6), egress (9), the write boundary (11), git push (13) and resource caps (14). This ticket ships the seeding script, the proof scripts, and the ops page that records what the boundary is, what it is not, and how a worker gets a new dependency without network.

**Requirements trace**
- R63 → the proof suite is the evidence that per-job isolation holds with what the host offers (no egress, no secret reads, workspace-only writes, resource caps); the offline store is what makes `networkAccess: false` livable for builds.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B4-sandboxing.md:185-218` — the test list; adapt wording, keep numbering so the ops page maps to it.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/README.md` — how this repo documents a host procedure (numbered one-time steps, exact commands, where logs go).
- `/home/orangekid/github/aiur/src/lib/aiur/init/agent_cli.ex:134-159` — `codex sandbox -- /bin/pwd` as the minimal probe; `lib.sh` generalizes it.
- OGM-037 `scripts/sandbox/probe.sh` — reuse its temp-`CODEX_HOME` setup and profile rendering; do not duplicate the path list (source it from a shared `scripts/sandbox/paths.txt` that OGM-037's probe also reads, or read `services/builder/sandbox/profile.toml`).
- T11 E11-3 — `systemd-run --user --scope -p MemoryMax=… -p TasksMax=…` measured working; t14 uses exactly that.

Repository conventions (state in every PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only through `packages/config` names; no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; a `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Store seeding
- Goal: one idempotent command that makes every template installable offline.
- Files: Create `scripts/sandbox/seed-store.sh`.
- Approach: `STORE="${OGM_PNPM_STORE:-$HOME/.local/share/ogm/pnpm-store}"`; refuse if `/proc/net/dev` shows only `lo` (we are inside a sandbox) with a clear message; `mkdir -p "$STORE"`; for each `templates/game-*/pnpm-lock.yaml` found with `find <repo> -maxdepth 3`: run `pnpm fetch --store-dir "$STORE" --dir <template>` in a subshell (never `cd` in the main shell); for `packages/sdk` run the same so workspace-linked deps resolve; for each extra `<pkg>@<ver>` argument run `pnpm store add --store-dir "$STORE" <pkg>@<ver>`; finish with `pnpm store status --store-dir "$STORE"` and `du -sh "$STORE"`. Print one line per template: `seeded templates/game-2d (n packages)`.
- Interface sketch: `bash scripts/sandbox/seed-store.sh [<pkg>@<ver> ...]` → exit 0; prints store size and counts.
- Template `.npmrc` lines this ticket fixes (OGM-023/024/055 copy them into `templates/game-*/.npmrc`):
  ```
  store-dir=${HOME}/.local/share/ogm/pnpm-store
  offline=true
  prefer-offline=true
  ```
- Test scenarios:
  - Given no template lockfiles then it prints `no template lockfiles; seeded packages/sdk only` and exits 0.
  - Given `zod@3.25.0` as an argument then `pnpm store add` runs once.
  - Given a sandboxed run (only `lo`) then it refuses with exit 2.

### U2 — Proof library and runner
- Goal: a uniform way to run a command in the game-builder sandbox and record PASS/FAIL/SKIP.
- Files: Create `scripts/sandbox/proof/lib.sh`, `scripts/sandbox/proof/run.sh`.
- Approach: `lib.sh` exports `in_sandbox <workspace> <cmd…>` = render a temp `CODEX_HOME` (copy `services/builder/sandbox/profile.toml`, substitute the deny list from `scripts/sandbox/paths.txt`), then `env CODEX_HOME=<tmp> codex sandbox -P gamebuilder --sandbox-state-disable-network -c 'sandbox_workspace_write.writable_roots=["<workspace>"]' -- <cmd…>` (the `-c` key is [I]; `lib.sh` reads the exact mechanism OGM-037's probe found from `docs/ops/sandbox.md`'s "mechanism" line or a `SANDBOX_FLAGS` env override); `record <id> <PASS|FAIL|SKIP> "<observed>"` appends to a results array; `scope <cmd…>` = `systemd-run --user --scope --quiet -p TasksMax=256 -p MemoryMax=2G -p CPUQuota=200% <cmd…>`. `run.sh`: creates two temp workspaces `ws-a`, `ws-b` under `${TMPDIR:-/tmp}/ogm-proof-$$`, runs each `t*.sh` (or `--only <id>`), collects rows, prints a Markdown table with the header fields (date, host, `codex --version`, `bwrap --version | head -1`, `git rev-parse --short HEAD`), and with `--write` replaces the `<!-- proof-results -->` block in `docs/ops/sandbox.md`. `--self-test` sets `SANDBOX_FLAGS=""` (no network disable) and expects t09 to FAIL, exiting 0 only if it did.
- Interface sketch: `bash scripts/sandbox/proof/run.sh [--only tNN] [--write] [--self-test]` → table on stdout; exit 1 if any FAIL (except under `--self-test`).
- Results table format written into `docs/ops/sandbox.md` between `<!-- proof-results -->` markers:
  ```
  Run: 2026-11-01 applekid · codex-cli 0.162.1 · bubblewrap 0.12.0 · scripts @ <sha>
  | id | test | result | observed |
  |---|---|---|---|
  | t03 | cross-workspace | PASS | ls ws-b: Permission denied |
  | t06 | secret reads | PASS | 9/9 DENIED |
  | t09 | egress | PASS | /proc/net/dev: lo only; curl exit 6 |
  | t11 | write boundary | PASS | $HOME, /tmp, /usr: EROFS; ws-a: ok |
  | t13 | git push | PASS | fatal: unable to access (no network) |
  | t14 | resource caps | PASS | fork bomb reaped 2.1 s; memory.max 2147483648; healthz 20/20 |
  ```
- `scripts/sandbox/paths.txt` (one path per line, `~` expanded at run time; the E03-9 list): `~/.config/gh/hosts.yml`, `~/.aiur/github-budget/agent-token`, `~/.codex/auth.json`, `~/.claude/.credentials.json`, `~/.claude-2/.credentials.json`, `~/.config/netlify/config.json`, `~/.config/ogm`, `~/.ssh`, `~/.aiur/.env`, `/home/orangekid/github/aiur/.env`, `<repo>/assets-local/catalog.json`.
- Test scenarios:
  - Given `codex` missing then every test SKIPs with `codex not on PATH` and exit 0.
  - Given `--self-test` then t09 FAILs and the runner exits 0.
  - Given a normal run then exit code reflects FAILs.

### U3 — The six tests
- Goal: each B4 test adapted so it can pass on this host and fail when the boundary is off.
- Files: Create `scripts/sandbox/proof/t03-cross-workspace.sh`, `t06-secret-reads.sh`, `t09-egress.sh`, `t11-write-boundary.sh`, `t13-no-git-push.sh`, `t14-resource-caps.sh`, `scripts/sandbox/paths.txt`.
- Approach:
  - t03: write `ws-b/secret.txt`; `in_sandbox ws-a sh -c 'ls <ws-b> && cat <ws-b>/secret.txt'` must fail (deny_read on other workspaces) → PASS; if the read succeeds but a write `in_sandbox ws-a sh -c 'touch <ws-b>/x'` fails, record FAIL with `read allowed, write denied` (the OGM-037 fallback state).
  - t06: for each line in `paths.txt` (the E03-9 list, `~` expanded) `in_sandbox ws-a sh -c 'test -r <p> && echo READ || echo DENIED'`; PASS only if all DENIED; the row lists which were READ (names only). Also `in_sandbox ws-a env | grep -Ei '(_TOKEN|_KEY|_SECRET|COOKIE)='` must print nothing.
  - t09: `in_sandbox ws-a sh -c 'cat /proc/net/dev'` must list only `lo`; `curl -sS --max-time 3 https://1.1.1.1` exit ≠ 0; `getent hosts github.com` exit ≠ 0; `sh -c 'exec 3<>/dev/udp/1.1.1.1/53'` fails.
  - t11: `touch $HOME/.ogm-proof` fails; `touch /tmp/ogm-proof` fails (excludeSlashTmp); `touch /usr/ogm-proof` fails; `touch ws-a/ok` succeeds; a symlink `ws-a/escape -> $HOME` then `touch ws-a/escape/x` fails.
  - t13: `git -C ws-a init && git remote add origin https://github.com/its-everdred/open-game-maker-2000.git`, then `in_sandbox ws-a git push origin HEAD` fails (no network) and `in_sandbox ws-a sh -c 'gh auth status'` reports not logged in or `gh` unusable (GH_CONFIG_DIR is agent-private under aiur, but here we run bare so the expectation is "no credential readable": `test -r ~/.config/gh/hosts.yml` DENIED from t06).
  - t14: `scope sh -c ':(){ :|:& };:'` returns within 10 s and `systemctl --user list-units --type=scope` shows the scope gone; `scope node -e "const a=[];for(;;)a.push(Buffer.alloc(1<<26))"` is killed (exit 137 or non-zero) with the scope's `memory.max` read back as 2147483648; if `ogm-api.service` is active, 20 `curl` of `/healthz` during the loop all return 200 (else SKIP that sub-check).
- Interface sketch: each script is `source lib.sh; …; record tNN PASS|FAIL|SKIP "<observed>"`.
- `t06-secret-reads.sh` as the pattern the others follow:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  source "$(dirname "$0")/lib.sh"
  ws="$1"; denied=0; total=0; readable=()
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    path="${p/#\~/$HOME}"; total=$((total+1))
    if in_sandbox "$ws" /bin/sh -c "test -r '$path'"; then readable+=("$p"); else denied=$((denied+1)); fi
  done < "$(dirname "$0")/../paths.txt"
  envhits="$(in_sandbox "$ws" /usr/bin/env | grep -Eic '(_TOKEN|_KEY|_SECRET|COOKIE)=' || true)"
  if [ "$denied" -eq "$total" ] && [ "$envhits" = "0" ]; then
    record t06 PASS "$denied/$total DENIED; env clean"
  else
    record t06 FAIL "readable: ${readable[*]:-none}; env hits: $envhits"
  fi
  ```
- Test scenarios: as listed; each test's FAIL path is exercised by `--self-test` (t09) or by running the command outside `in_sandbox` for t06/t11 (`--self-test` runs t06 and t11 bare and expects FAIL too).

### U4 — Ops document
- Goal: one page an operator reads to know what the sandbox is and how to feed it.
- Files: Create `docs/ops/sandbox.md`.
- Approach: sections: What isolates what (Layer A commands: Codex bwrap+landlock, network off, workspace-only writes, deny_read list; Layer B processes: `ogm-agents.slice`, per-daemon unit, `max_agent_duration_minutes`; identities: builder bot vs intake bot vs App), What it is not (same kernel, same uid, bot PAT residual E03-8; Kevin's `adduser` option E03-18), Probe result (copied from OGM-037's PR: mechanism and `deny_read` verdict), Proof results (`<!-- proof-results -->` block written by `run.sh --write`), Offline dependencies (seed command, `.npmrc` lines, how `gm new` installs), New dependency request path (the four steps with the exact commands), Re-running after upgrades (Codex CLI or aiur bump → rerun probe and proofs).
- Interface sketch: none.
- Test scenarios: Given `run.sh --write` then the block between the markers is replaced and nothing else in the file changes (checked with `git diff --stat`).

## 4. Verification

```
bash scripts/sandbox/seed-store.sh
bash scripts/sandbox/proof/run.sh --self-test
bash scripts/sandbox/proof/run.sh --write
git diff --stat docs/ops/sandbox.md
# offline install check (needs a template lockfile from OGM-023/024):
cp -r templates/game-2d "$TMPDIR/ogm-tpl" && CODEX_HOME=<tmp profile> codex sandbox --sandbox-state-disable-network -- sh -c 'cd "$TMPDIR/ogm-tpl" && pnpm install --offline'
```
Paste into `## Local tests`: the full results table; the self-test line (`t09 FAIL under --self-test: expected`); store size and package count; the offline install's last line or its SKIP reason.

## 5. Deferred to implementation

- The exact `codex sandbox` flag that sets the writable root (`-c sandbox_workspace_write.writable_roots=[…]` vs `--sandbox-state-json`): default read from OGM-037's recorded mechanism; `SANDBOX_FLAGS` override.
- Whether to seed Playwright browsers into a sandbox-readable path for `gm test` (E10-5): default the cache `~/.cache/ms-playwright` is readable (not in `deny_read`); verify is host-side anyway (D-VERIFY-GPU).
- Store location: default `~/.local/share/ogm/pnpm-store`; `OGM_PNPM_STORE` override for tests.

## 6. Scope boundaries

- Policy, profile, probe (OGM-037). Daemon units (OGM-034). Template lockfiles and `.npmrc` (OGM-023/024/055). Worker-facing skill text (OGM-091). The GitHub write boundary tests (OGM-039). Browser-side tests (OGM-028/T09).

## 7. Risks

- `deny_read` not honored (OGM-037 outcome) → t03/t06 FAIL by design; the page records the fallback and the residual; the suite stays red on those rows until Kevin's `adduser` or a Codex release fixes it (visible, not hidden).
- Templates' lockfiles not merged at pickup → offline check SKIPs; rerun when OGM-023/024 land (note in the PR).
- `pnpm fetch` needs network and the registry; run it on the host, never from a worker.
- Resource-cap test on a loaded host (load ~9 measured, E11-4) may take longer than 10 s to reap → default 30 s timeout, record the observed time.
