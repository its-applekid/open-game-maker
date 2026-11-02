# Runbook

Everything runs as `orangekid` under `systemd --user`; nothing here needs sudo. Steps only Kevin can do are in
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

## Status

```
ops/bin/ogm-status            # units, placeholders, listeners, disk, sizes, backup, ingress
ops/bin/ogm-status --json
ops/bin/ogm-status --check    # exit 1 on a failed unit, a STRAY listener, or a backup older than 48 h
```

It prints names and sizes only, never env values. A listener is `STRAY` when an OGM process (any process in an `ogm`
cgroup), or a `python3 -m http.server`, listens on anything but `127.0.0.1` or `[::1]`. Stray listeners are reported,
not killed: stop the process that owns the pid.

## Placeholders

`PLACEHOLDER <service>` in the journal means `ops/bin/ogm-run` found no build (or no setup) for that unit and is
idling. It clears when the service's build lands and the unit restarts. drive-sync waits for the Drive setup steps in
`~/remind.md`. `ogm-aiur@<slug>` has no placeholder: a failing preflight keeps it from starting, and the reasons
are on its `game_daemons` row.

## Env files and rotation

Each unit reads `~/.config/ogm/env/<unit>.env` (mode 0600). Create one with
`pnpm --filter @ogm/config exec ogm-env-init <unit>`. Secrets shared between units (for example
`OGM_WS_TOKEN_SECRET` for api and rooms) are copied from whichever unit file already holds them.
The API file must set `OGM_APP_ORIGIN`, `OGM_COMMIT_INTERNAL_URL`, and `OGM_COMMIT_SERVICE_TOKEN`;
`OGM_GAME_TEMPLATE_REF` defaults to `game-2d@1` when left blank. Job admission defaults each member to
`OGM_DEFAULT_DAILY_ALLOWANCE_MICROUSD=5000000` and resets that allowance at midnight in
`OGM_RESET_ZONE_DEFAULT` (the host's IANA time zone when blank). Family budget settings override both defaults.

The commit file must also set the shared `OGM_INTERNAL_TOKEN` so boundary checks can read active repositories and
creator PII terms. `OGM_BLOCKLIST_FILE` defaults to `$OGM_DATA_DIR/blocklist.txt`. Set
`OGM_GITHUB_WEBHOOK_SECRET` when GitHub pull-request webhooks are exposed; the 60-second poller remains active as the
fallback when it is blank.

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
OGM_DATA_DIR=/home/orangekid/.local/share/ogm/data
OGM_BLOB_ROOT=/home/orangekid/.local/share/ogm/blobs
OGM_BACKUP_TARGET=ssh:orangekid:~/ogm-backups      # or local:<absolute path>; ~/ is the remote home
```

Each run writes, under `<target path>/ogm-backups/`:

- `db-<STAMP>.sqlite`: a `VACUUM INTO` snapshot of `$OGM_DATA_DIR/ogm.db`, safe while the API writes. Skipped (with
  `no database yet`) until the database exists.
- `blobs-<STAMP>.tar.zst`: every blob and sidecar changed since the last verified run (the first run takes them all).
  Blobs never change, so this is an exact delta.
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
ops/backup/restore.sh <stamp> --to /tmp/ogm-restore --target ssh:orangekid:~/ogm-backups
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

## Disk and journal

`ogm-status` shows the sizes of `~/.local/share/ogm`, `~/.local/state/ogm`, `~/.aiur`, `~/.local/share/aiur` and the
user journal. `~/.aiur` grows with agent workspaces and their `.claude/worktrees`; `git worktree prune` in a checkout
drops worktree entries whose directories are gone. A permanent journal cap (`SystemMaxUse`) is a sudo hand step.
