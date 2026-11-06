# Runbook

Everything runs as `<user>` under `systemd --user`; nothing here needs sudo. Steps only Kevin can do are in
[hand-steps.md](hand-steps.md).

## Install

```
ops/bin/ogm-host-setup.sh --dry-run   # what it would do
ops/bin/ogm-host-setup.sh             # dirs, units into ~/.config/systemd/user, enable services + backup timer
ops/bin/ogm-host-setup.sh --stop      # disable and stop them all
```

Units are rendered from `ops/systemd/` with this checkout's path; re-run after pulling unit changes. A service whose
build is missing runs `ops/bin/ogm-run`'s placeholder instead (see Placeholders).

## Start, stop, logs

```
systemctl --user status 'ogm-*'
systemctl --user restart ogm-api            # one unit
systemctl --user restart 'ogm-*'            # all of them
journalctl --user -u ogm-api -f             # follow one unit
journalctl --user -u 'ogm-*' --since -1h    # everything recent
```

Builder daemons run as `ogm-aiur@<slug>`, one per active game repo, at most four live. The API's fleet manager
(`@ogm/builder`) renders `~/.local/share/ogm/daemons/<slug>/` and `~/.config/ogm/env/ogm-aiur@<slug>.env`, starts the
unit on the first admitted job and stops it after 30 min with no active job; stopping keeps `workspaces/`. Each daemon
is registered in `~/.aiur/remote-instances.yaml` with a read token, so
`~/github/aiur/scripts/aiurdev --instance <slug> status` works without the cookie.

Two launchers exist for the same daemon: `ops/systemd/ogm-aiur@.service` runs `%h/github/aiur/scripts/aiurdev run
--container` (what the fleet manager starts), and `ops/bin/ogm-run aiur <slug>` runs `~/.local/bin/aiur run --container`.
Setup step 3 links `~/.local/bin/aiur` to `~/github/aiur/scripts/aiurdev`, so both start the same checkout. Which one is
canonical is open (setup-site plan, open question 3) until Kevin answers.

## Status

```
ops/bin/ogm-status            # units, placeholders, listeners, disk, sizes, backup, ingress
ops/bin/ogm-status --json
ops/bin/ogm-status --check    # exit 1 on a failed unit, a STRAY listener, a missing service build, or a backup over 48 h
```

It prints names and sizes only, never env values. A listener is `STRAY` when an OGM process (any process in an `ogm`
cgroup), or a `python3 -m http.server`, listens on anything but `127.0.0.1` or `[::1]`. Stray listeners are reported,
not killed: stop the process that owns the pid.

## Placeholders

`PLACEHOLDER <service>` in the journal means `ops/bin/ogm-run` found no build (or no setup) for that unit and is
idling. Node units run the file their package's `start` script names; `ogm-status --check` reports a missing one, and a
unit still idling after its build lands. It clears when the unit restarts. drive-sync waits for the Drive setup steps in
`~/remind.md`. `ogm-aiur@<slug>` has no placeholder: a failing preflight keeps it from starting, and the reasons
are on its `game_daemons` row.

## Env files and rotation

Each unit reads `~/.config/ogm/env/<unit>.env` (mode 0600). Create one with
`pnpm --filter @ogm/config exec ogm-env-init <unit>`. The commit unit is the exception: it reads `ogm-commit.env`,
copied from `services/commit/ops/ogm-commit.env.example` ([services/commit/README.md](../../services/commit/README.md)). Secrets shared between units (for example
`OGM_WS_TOKEN_SECRET` for api and rooms) are copied from whichever unit file already holds them.
The API file must set `OGM_APP_ORIGIN`, `OGM_COMMIT_INTERNAL_URL`, and `OGM_COMMIT_SERVICE_TOKEN`;
`OGM_GAME_TEMPLATE_REF` defaults to `game-2d@1` when left blank. Job admission defaults each member to
`OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD=5000000` and resets that allowance at midnight in
`OGM_RESET_ZONE_DEFAULT` (the host's IANA time zone when blank). Family budget settings override both defaults.

The commit file must also set the shared `OGM_INTERNAL_TOKEN` so boundary checks can read active repositories and
creator PII terms. `OGM_BLOCKLIST_FILE` defaults to `$OGM_DATA_DIR/blocklist.txt`. Set
`OGM_GITHUB_WEBHOOK_SECRET` when GitHub pull-request webhooks are exposed; the 60-second poller remains active as the
fallback when it is blank.

### Per-unit values

`ogm-env-init` generates the secrets. These are the non-secret values a new host fills in each file, from the
`[unit]` tags in `.env.example`; an optional name has a default or turns its feature off when blank. Paths are absolute (systemd does not expand
`~`).

| Unit file | Fill | Optional |
| --- | --- | --- |
| `api.env` | `OGM_API_PORT`, `OGM_PUBLIC_ORIGIN`, `OGM_APP_ORIGIN`, `OGM_GAMES_ORIGIN`, `OGM_DATA_DIR`, `OGM_BLOB_ROOT`, `OGM_ROOMS_INTERNAL_URL`, `OGM_COMMIT_INTERNAL_URL`, `OGM_BUILDER_BOT_LOGIN`, `OGM_INTAKE_BOT_LOGIN`, `OGM_VAPID_SUBJECT`; tokens you obtain: `OGM_BUILDER_BOT_TOKEN`, `OGM_INTAKE_GITHUB_TOKEN` | `OGM_GAMES_ROOT`, `OGM_ASSETS_ROOT`, `OGM_INTAKE_DIR`, `OGM_VOICE_HOST_INTERNAL_URL`, `OGM_VOICE_WS_URL`, `OGM_BUILDER_WORKSPACES_ROOT`, `OGM_VAPID_KEY_FILE`, `OGM_GAME_TEMPLATE_REF`, `OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD`, `OGM_RESET_ZONE_DEFAULT`, `OGM_ANALYTICS_RETENTION_DAYS`, `OGM_REPORT_BUNDLE_MAX_BYTES`, `OGM_NARRATION_CONCURRENCY`, `OGM_INTAKE_SWEEP_SECONDS`, `OGM_CHAT_POLL_MS`, `OGM_CHECKPOINT_POLL_MS`, `OGM_ALLOWED_EMAILS`, `OGM_MAINTAINER_EMAILS`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `SMTP_URL`/`SMTP_FROM` |
| `rooms.env` | `OGM_ROOMS_PORT`, `OGM_GAMES_ORIGIN`, `OGM_API_INTERNAL_URL` | |
| `games.env` | `OGM_GAMES_PORT`, `OGM_GAMES_ROOT`, `OGM_APP_ORIGIN` | `OGM_GAMES_SW` (defaults to the workspace's built `packages/host/dist/game-cache.js`) |
| `voice-host.env` | `OGM_VOICE_PORT`, `OGM_VOICE_INTERNAL_PORT`, `OGM_API_INTERNAL_URL`, `OGM_VOICE_PROVIDER` (`fake`) | `OGM_VOICE_LLM`, `OGM_VOICE_MAX_SESSIONS`, `OGM_VOICE_RENDER_DIR`, `OGM_VOICE_NARRATION_ENABLED` |
| `intake.env` | `OGM_ASSETS_ROOT`, `OGM_STATE_DIR` | |
| `drive-sync.env` | none; the worker reads `~/.config/ogm/drive-sync.toml` and `drive-sa.json` (`scripts/py/drive-sync/README.md`) | |
| `backup.env` | `OGM_DATA_DIR`, `OGM_BLOB_ROOT`, `OGM_BACKUP_TARGET` | |
| `ogm-commit.env` | `OGM_COMMIT_PORT`, `OGM_DATA_DIR`, `OGM_API_INTERNAL_URL`, `OGM_PLATFORM_ISSUE_REPO`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`, `OGM_BUILDER_BOT_LOGIN` | `OGM_BLOCKLIST_FILE`, `OGM_GITHUB_WEBHOOK_SECRET` |
| `repair.env` | `OGM_API_INTERNAL_URL`, `OGM_GAMES_ROOT`; no unit runs `services/repair` yet | |
| `core-bump.env` | `OGM_CORE_BUMP_REPOS`, `OGM_CORE_BUMP_CORE_REPO`; the App credentials come from `ogm-commit.env` | `OGM_CORE_BUMP_CORE_BRANCH`, `OGM_CORE_BUMP_WORK_DIR` |

Names read by more than one unit must hold the same value in each file:

| Name | Files |
| --- | --- |
| `OGM_DATA_DIR` | `api`, `backup`, `ogm-commit` |
| `OGM_BLOB_ROOT` | `api`, `backup` |
| `OGM_GAMES_ROOT` | `api`, `games`, `repair` |
| `OGM_APP_ORIGIN` | `api`, `games` |
| `OGM_GAMES_ORIGIN` | `api`, `rooms` |
| `OGM_ASSETS_ROOT` | `api`, `intake` |
| `OGM_API_INTERNAL_URL` | `rooms`, `voice-host`, `ogm-commit`, `repair` (the API's port) |
| `OGM_BUILDER_BOT_LOGIN` | `api`, `ogm-commit` |
| `OGM_WS_TOKEN_SECRET`, `OGM_ROOMS_INTERNAL_SECRET` | `api`, `rooms` |
| `OGM_VOICE_TOKEN_SECRET`, `OGM_VOICE_INTERNAL_SECRET` | `api`, `voice-host` |
| `OGM_COMMIT_SERVICE_TOKEN` | `api`, `ogm-commit` |
| `OGM_INTERNAL_TOKEN` | `api`, `ogm-commit`, `repair` |
| `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH` | `ogm-commit`, `core-bump` (the core-bump unit loads `ogm-commit.env`) |

The API's internal URLs carry the other units' ports: `OGM_ROOMS_INTERNAL_URL` uses `OGM_ROOMS_PORT`,
`OGM_VOICE_HOST_INTERNAL_URL` uses `OGM_VOICE_INTERNAL_PORT`, `OGM_COMMIT_INTERNAL_URL` uses `OGM_COMMIT_PORT`.
`ogm-env-init` writes every `[shared]` name into every file; a unit ignores the ones it does not read.
`AIUR_ERLANG_COOKIE` and `GITHUB_TOKEN` (`[aiur]`) go in `~/.aiur/.env`; the fleet writes them into each
`ogm-aiur@<slug>.env`. `AIUR_API_URL` and `AIUR_API_TOKEN` are read by no unit today, and
the `[gm]` names belong to the `gm` CLI, not a unit.

### Rotation

`ogm-env-init` only generates a secret no unit file holds yet, and `--force` keeps existing secrets while blanking
non-secret values. To rotate a secret, replace its value by hand in every file that has it, then restart those units:

```
grep -l '^OGM_SESSION_SECRET=' ~/.config/ogm/env/*.env   # which files
openssl rand -hex 32                                    # new value; paste it into each file
systemctl --user restart ogm-api
```

## Ingress

See [ingress.md](ingress.md): `ops/bin/ogm-ingress.sh` mounts 8443 and 10000 on Tailscale, after Kevin's operator hand
step.

## Backup

`ogm-backup.timer` runs `ops/backup/backup.sh` nightly at 03:30 (`Persistent=true`, so a missed run happens at the next
boot). It reads `~/.config/ogm/env/backup.env` (systemd does not expand `~` there, so local paths are absolute):

```
OGM_DATA_DIR=/home/<user>/.local/share/ogm/data
OGM_BLOB_ROOT=/home/<user>/.local/share/ogm/blobs
OGM_BACKUP_TARGET=ssh:<backup-host>:~/ogm-backups      # or local:<absolute path>; ~/ is the remote home
```

Each run writes, under `<target path>/ogm-backups/`:

- `db-<STAMP>.sqlite`: a `VACUUM INTO` snapshot of `$OGM_DATA_DIR/ogm.db`, safe while the API writes. Skipped (with
  `no database yet`) until the database exists.
- `blobs-<STAMP>.tar.zst`: every blob and sidecar changed since the last verified run (the first run takes them all).
  Blobs never change, so this is an exact delta. The blob store also holds every game's tier-3 assets (agent-made or
  edited; game repos keep only their sha in `assets.lock.json`), so this backup is their only copy off the host.
- `manifest-<STAMP>.json`: the previous stamp, each file's size and sha256, the blob count, the host, the repo commit and
  the env file names (never their values).

The stamp (UTC `yyyymmddTHHMMSSZ`) is recorded in `~/.local/state/ogm/backup/last-stamp` and `last-ok` only after the
far-side sha256 of every file matches. A failed or interrupted run leaves them as they were, so the next run ships the
same delta again. The script never deletes anything at the target; prune old sets there by hand if space runs out.

Run one now:

```
systemctl --user start ogm-backup && journalctl --user -u ogm-backup -n 5
```

## Restore

```
ops/backup/restore.sh <stamp> --to /tmp/ogm-restore --target ssh:<backup-host>:~/ogm-backups
```

It follows the manifests back to the first full backup, checks every file's sha256 before writing, extracts the blob
tars oldest first, copies that stamp's database, checks that each restored blob's sha256 is its name, and prints the two
lines that point a service at the result:

```
OGM_DATA_DIR=/tmp/ogm-restore/data
OGM_BLOB_ROOT=/tmp/ogm-restore/blobs
```

It refuses a `--to` that is not empty. To put a restore in place: stop the units, move the old directories aside, move
the restored `data` and `blobs` to the paths in the env files, start the units. Env files are not in the backup;
recreate the ones the manifest lists with `ogm-env-init`.

`bash ops/test/backup-restore.sh` runs the same drill against a `local:` target in temp directories (CI runs it).

## Core bump

`ogm-core-bump.timer` runs `services/core-bump` every 15 minutes (`OnBootSec=5min`, then every 15 minutes after that).
Each tick reads
the core repository's branch head and compares it with the commit an instance repository pins in its `vendor/core.json`;
when they differ it runs that repository's `scripts/bump-core.sh` in a scratch clone and opens a `core-bump/<sha>` pull
request. It never merges: the instance repository's own checks gate the merge. A repository without `vendor/core.json`,
and one that already has a core bump pull request open, are left alone.

```
systemctl --user list-timers ogm-core-bump.timer
journalctl --user -u ogm-core-bump -f
systemctl --user start ogm-core-bump        # one tick now
```

`core-bump.env` names the instance repositories (`OGM_CORE_BUMP_REPOS`, comma-separated owner/repository) and the core
(`OGM_CORE_BUMP_CORE_REPO`). The unit also reads `ogm-commit.env`, so the GitHub App installed on the instance
repositories is the same one the commit service uses. The core repository must be public: its head commit is read
without a token. Scratch clones live in `OGM_CORE_BUMP_WORK_DIR` (`~/.local/state/ogm/core-bump`). Details:
[services/core-bump/README.md](../../services/core-bump/README.md).

## Disk and journal

`ogm-status` shows the sizes of `~/.local/share/ogm`, `~/.local/state/ogm`, `~/.aiur`, `~/.local/share/aiur` and the
user journal. `~/.aiur` grows with agent workspaces and their `.claude/worktrees`; `git worktree prune` in a checkout
drops worktree entries whose directories are gone. A permanent journal cap (`SystemMaxUse`) is a sudo hand step.
