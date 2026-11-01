# OGM-002 plan — Host bootstrap: slices and user units

## 1. Problem frame

Everything server-side runs on this machine as `systemd --user` units (D-HOSTING). None of the services exist yet, but the units, slices, env-file convention and install script must land now so each service ticket only has to build to a known path, and so OGM-006/008/034 have a layout to point at. The trick is keeping units green before their programs exist: a launcher (`ogm-run`) that execs the built service when present and otherwise logs a placeholder and sleeps.

Requirements trace: R69 → every service a `systemd --user` unit with an env file it alone reads, agents under CPU weights below the services, backups by timer (the timer here, the content in OGM-008).

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/ogm-drive-sync.service`: the hardening lines (`UMask=0077`, `NoNewPrivileges=yes`, `Restart=on-failure`, `WantedBy=default.target`) and the install comment block; copy both.
- `~/.config/systemd/user/symphony.service` (host, outside the repo): `EnvironmentFile=` + `ExecStart=/home/orangekid/.local/bin/mise exec -- …` for an Elixir release; copy for `ogm-voice-host`.
- `/home/orangekid/github/aiur/packaging/npm/aiur-cli/libexec/aiur-daemon-supervisor.sh`: what the tmux supervisor did (restart budget, SIGTERM forwarding); `Restart=on-failure` + `KillMode=mixed` + `TimeoutStopSec=65` replace it (E11-12).
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/test_drive_sync.py`: the no-network, fake-everything test style; the shell tests here fake `systemctl` the same way.

## 3. Implementation units

### U1 Unit and slice files

Goal: eleven unit files under `ops/systemd/` that `systemd-analyze --user verify` accepts after `@REPO@` substitution.

Files: Create `ops/systemd/ogm.slice`, `ops/systemd/ogm-agents.slice`, `ops/systemd/ogm-api.service`, `ops/systemd/ogm-rooms.service`, `ops/systemd/ogm-games.service`, `ops/systemd/ogm-voice-host.service`, `ops/systemd/ogm-intake.service`, `ops/systemd/ogm-drive-sync.service`, `ops/systemd/ogm-aiur@.service`, `ops/systemd/ogm-backup.service`, `ops/systemd/ogm-backup.timer`.

Approach: one service file per name, identical apart from `Description`, the env file name and the `ogm-run` argument. The slices carry the weights from T11 §4. `ogm-backup.service` is `Type=oneshot` (no `Restart`). The template unit uses `%i` for the slug in the env file name and the `ogm-run aiur %i` argument.

Interface sketch (`ops/systemd/ogm-api.service`, whole file; the other five services differ only in the three marked lines):

```ini
# OGM API. Installed by ops/bin/ogm-host-setup.sh (replaces @REPO@). Logs: journalctl --user -u ogm-api -f
[Unit]
Description=OGM API                                   # <- per service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Slice=ogm.slice
Environment=OGM_REPO=@REPO@
EnvironmentFile=-%h/.config/ogm/env/api.env           # <- per service
ExecStart=@REPO@/ops/bin/ogm-run api                  # <- per service
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=yes
KillMode=mixed
TimeoutStopSec=30
LogRateLimitIntervalSec=30
LogRateLimitBurst=1000

[Install]
WantedBy=default.target
```

```ini
# ops/systemd/ogm-agents.slice
[Unit]
Description=OGM coding agents, builds and verify captures
[Slice]
CPUWeight=50
MemoryMax=16G
TasksMax=4096
```

```ini
# ops/systemd/ogm-aiur@.service (OGM-034 owns ExecStart/WorkingDirectory later)
[Unit]
Description=OGM game-builder aiur daemon (%i)
After=network-online.target
[Service]
Type=simple
Slice=ogm-agents.slice
Environment=OGM_REPO=@REPO@
EnvironmentFile=-%h/.config/ogm/env/aiur.env
EnvironmentFile=-%h/.config/ogm/env/aiur-%i.env
ExecStart=@REPO@/ops/bin/ogm-run aiur %i
Restart=on-failure
RestartSec=10
KillMode=mixed
TimeoutStopSec=65
UMask=0077
NoNewPrivileges=yes
```

```ini
# ops/systemd/ogm-backup.timer
[Unit]
Description=OGM nightly backup
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
```

Test scenarios:
- Given the eleven files with `@REPO@` replaced, when `systemd-analyze --user verify` runs on them, then it prints no error lines.
- Given `ogm-games.service`, when grepped, then it contains `Slice=ogm.slice`, `EnvironmentFile=-%h/.config/ogm/env/games.env`, `ogm-run games`.
- Given `ogm-aiur@.service`, when grepped, then it contains `Slice=ogm-agents.slice` and no `ProtectHome`.

### U2 The launcher `ops/bin/ogm-run`

Goal: one bash script that runs a service when built, otherwise a logged placeholder; the table in the ticket is the contract.

Files: Create `ops/bin/ogm-run` (executable).

Approach: `set -euo pipefail`; `name=$1; shift`; `OGM_REPO=${OGM_REPO:?}`; `case "$name"` over the table. Helper `placeholder() { echo "PLACEHOLDER $1: $2" >&2; exec sleep infinity; }` for long-running units and `placeholder_once()` (prints, `exit 0`) for `backup`. For `drive-sync`: `for d in "$OGM_REPO/scripts/py/drive-sync" "$OGM_REPO/scripts/drive-sync"; do [ -f "$d/drive_sync.py" ] && break; done`; require `$d/.venv/bin/python`, `~/.config/ogm/drive-sync.toml` and `~/.config/ogm/drive-sa.json` (paths from `scripts/drive-sync/README.md`), else placeholder with the reason. For `aiur`: `slug=$1`; `dir=$HOME/.local/share/ogm/repos/$slug`; when `$dir/.aiur/config` exists, `cd "$dir" && exec aiur run --container` (`aiur` at `~/.local/bin/aiur`, E12-15); else placeholder. Never `echo` any variable that could hold a secret; the script reads no env values except `OGM_REPO` and `HOME`. Allow `OGM_SLEEP=<cmd>` override so tests do not block (`exec ${OGM_SLEEP:-sleep infinity}`).

Interface sketch:

```
ogm-run <api|rooms|games|intake|voice-host|drive-sync|backup>   # env: OGM_REPO (required), HOME
ogm-run aiur <slug>
exit: execs the target (never returns) or, for placeholders, sleeps forever / exits 0 for backup
```

Test scenarios (`ops/test/ogm-run.sh`):
- Given `OGM_REPO` pointing at an empty temp dir, when `timeout 2 ogm-run api` runs, then stderr contains `PLACEHOLDER api` and the exit code is 124.
- Given `services/api/dist/index.js` created under the temp repo containing `process.stdout.write('api-up')`, when `ogm-run api` runs, then stdout is `api-up` and the exit code is 0 (the launcher exec'd node on the built file).
- Given no `drive-sync.toml` in a temp `HOME`, when `timeout 2 ogm-run drive-sync` runs, then stderr says `waiting for Drive setup`.
- Given `OGM_REPO` unset, when `ogm-run api` runs, then it exits non-zero with `OGM_REPO` in the message.
- Given `ogm-run backup` with no `ops/backup/backup.sh`, then it exits 0 after printing `PLACEHOLDER backup`.

### U3 The install script

Goal: `ops/bin/ogm-host-setup.sh` is idempotent, needs no sudo, and leaves `systemctl --user` green.

Files: Create `ops/bin/ogm-host-setup.sh` (executable).

Approach: `set -euo pipefail`; `REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)`; `SYSTEMCTL=${OGM_SYSTEMCTL:-systemctl}`; `UNIT_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user`. Steps: (1) `install -d -m 700 ~/.config/ogm ~/.config/ogm/env`; `install -d ~/.local/share/ogm/{data,blobs,games,repos} ~/.local/state/ogm`; (2) for each file in `ops/systemd/`, `sed "s#@REPO@#$REPO#g" > "$UNIT_DIR/<name>.tmp"` then `cmp -s` with the existing file and only `mv` when different (so the log shows what changed); (3) `$SYSTEMCTL --user daemon-reload`; (4) `$SYSTEMCTL --user enable --now ogm-api ogm-rooms ogm-games ogm-voice-host ogm-intake ogm-drive-sync ogm-backup.timer`; (5) `$SYSTEMCTL --user list-units 'ogm-*' --no-pager`. Flags: `--dry-run` prints the actions; `--stop` disables and stops everything (the runbook's uninstall). Never touches `/etc`, never calls `sudo`, never prints env values.

Interface sketch:

```
ops/bin/ogm-host-setup.sh [--dry-run] [--stop]
env: OGM_SYSTEMCTL (tests), XDG_CONFIG_HOME, HOME
```

Test scenarios (`ops/test/host-setup.sh`, using `ops/test/lib.sh` for `assert_eq`/`assert_grep`):
- Given temp `HOME`, `XDG_CONFIG_HOME` and a fake `systemctl` that appends its args to a log, when the script runs, then eleven files exist in the temp unit dir, none contains `@REPO@`, and the log is exactly `daemon-reload` followed by one `enable --now …` line naming the six services and the timer, then `list-units`.
- Given the same environment, when the script runs a second time, then `diff -r` of the unit dir before and after is empty and the log gained only the same three lines (idempotent; no `mv` happened).
- Given `--dry-run`, when run, then no file is written and the fake log is empty.
- Given `sudo` on PATH as a fake that exits 99, when the script runs, then the exit code is 0 (sudo never invoked).

Execution note: write `ops/test/host-setup.sh` first with the fake `systemctl`; it fails until U1 and U3 exist.

## 4. Verification

```
bash ops/test/host-setup.sh
bash ops/test/ogm-run.sh
tmp=$(mktemp -d) && for f in ops/systemd/*; do sed "s#@REPO@#$PWD#g" "$f" > "$tmp/$(basename "$f")"; done && systemd-analyze --user verify "$tmp"/*.service "$tmp"/*.timer
ops/bin/ogm-host-setup.sh && systemctl --user list-units 'ogm-*' --no-pager && journalctl --user -u ogm-api -n 3 --no-pager
```

Paste into `## Local tests`: the two shell test summaries, the `systemd-analyze` output (empty), the `list-units` table (six `active (running)`, timer `active (waiting)`) and the `PLACEHOLDER api` journal line.

## 5. Deferred to implementation

- `RandomizedDelaySec` on the timer: default 300 s.
- Whether to add an `ogm.target` wanting every service: default no; the runbook (OGM-008) lists the unit names.
- `After=network-online.target` for loopback-only services: default keep (Tailscale serve needs the socket up; harmless).
- Where `ogm-run` logs: default stderr only (journald captures it; E11-14 wants JSON lines from services, not from the launcher).

## 6. Scope boundaries

- Service entrypoints and `/healthz`: OGM-010 (api), OGM-051 (rooms), OGM-007 (games), OGM-085 (voice-host), OGM-064 (intake).
- Real aiur daemon lifecycle, config rendering, idle stop, token minting: OGM-034.
- Backup script and `ogm-status`: OGM-008. Ingress: OGM-006. Env names and `.env.example`: OGM-003.
- Python worker move and README fixes: OGM-009.

## 7. Risks

- Placeholders hide "not deployed yet" behind green status: `ogm-status` (OGM-008) greps the journal for `PLACEHOLDER` and lists them; the launcher's message is the contract it reads.
- `mise exec` path or Elixir release layout differs when OGM-085 lands: OGM-085 may change only the `voice-host` row of `ogm-run`'s table (one line) and must say so in its PR.
- `aiur run --container` keeps the dashboard and needs the cookie in the caller's env for `aiur status` (E11-12): documented in the runbook; the daemon-side cookie comes from `aiur.env`.
- Host load is already high (E11-4): weights are relative, not caps; the admission caps in OGM-013/037 are the real limiter.
