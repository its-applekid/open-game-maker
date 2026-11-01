# OGM-008 plan — Backups, status and runbook

## 1. Problem frame

One disk, no backup tooling installed, a database owned by one process and a content-addressed blob store (E11-13, D-DB, D-BUCKET). The zero-install answer is `tar --zstd` over Tailscale SSH for blobs and `VACUUM INTO` through `node:sqlite` for the database, with a restore script that is proven once in a temp directory. The same ticket gives the operator one status command (units, placeholders, loopback hygiene, sizes, last backup) and the runbook, plus the list of hand steps only Kevin can do.

Requirements trace: R69 → backups by file copy, a runbook, and the host-hygiene check that every OGM listener is loopback-only.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/ops/bin/ogm-host-setup.sh` and `ops/test/lib.sh` (OGM-002): script conventions, fake-binary tests.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/README.md` "One-time setup" and `~/remind.md` entries: the hand-step format (`- [ ] <date> \`command\` — reason`, then a `ctx:` line) for `docs/ops/hand-steps.md`.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B6-asset-storage-cdn.md` §6 "V1 minimum" item 6: nightly copy of new blobs plus one restore drill; the acceptance here.
- `/home/orangekid/games/open-game-maker-2000/packages/blob-store/src/fs-store.ts` (OGM-005): blob and sidecar naming the delta must include.

## 3. Implementation units

### U1 `sqlite-backup.mjs`

Goal: a consistent snapshot of a WAL database without the sqlite3 CLI.

Files: Create `ops/backup/sqlite-backup.mjs`.

Approach: `node --no-warnings ops/backup/sqlite-backup.mjs <src.db> <out.sqlite>`; if `src` is missing print `no database yet: <src>` and exit 0; open `new DatabaseSync(src)` (read-write open so `VACUUM INTO` is permitted on all versions; it writes nothing to the source), `db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`)`, close, print `snapshot <bytes> bytes`. Refuse an existing `out`.

Interface sketch: `sqlite-backup.mjs <src.db> <out.sqlite>` → exit 0 (snapshot or no-db), 1 on error, 2 if out exists.

Test scenarios (inside `ops/test/backup-restore.sh`):
- Given a DB with 3 rows in `t`, when the helper runs, then `out` opens with `node:sqlite` and `SELECT count(*) FROM t` is 3.
- Given a missing `src`, then exit 0 and `no database yet` on stdout.
- Given `out` exists, then exit 2 and no change.

### U2 `backup.sh`

Goal: snapshot + exact blob delta, shipped, verified, stamped.

Files: Create `ops/backup/backup.sh` (executable).

Approach: env (`OGM_DATA_DIR`, `OGM_BLOB_ROOT`, `OGM_BACKUP_TARGET`; from `backup.env` via the unit); `STATE=${OGM_BACKUP_STATE:-$HOME/.local/state/ogm/backup}`; `STAMP=$(date -u +%Y%m%dT%H%M%SZ)`; `WORK=$(mktemp -d)`; (1) `node --no-warnings ops/backup/sqlite-backup.mjs "$OGM_DATA_DIR/ogm.db" "$WORK/db-$STAMP.sqlite"`; (2) `find "$OGM_BLOB_ROOT/blobs" -type f ${PREV:+-newer "$STATE/last-ok"} -printf '%P\n' | sort > "$WORK/blobs.list"` (relative paths; the sidecar `.json` rides along because it is newer too); `tar --zstd -cf "$WORK/blobs-$STAMP.tar.zst" -C "$OGM_BLOB_ROOT/blobs" -T "$WORK/blobs.list"` (an empty list still produces a valid empty archive); (3) manifest JSON with `sha256sum` of each file, `previous` = last stamp; (4) ship: parse the target: `local:<path>` → `install -d` and `cp`; `ssh:<host>:<path>` → `ssh "$host" "mkdir -p '$path/ogm-backups'"` then `cat file | ssh "$host" "cat > '$path/ogm-backups/<name>'"` per file; (5) verify: far-side `sha256sum` (`ssh host sha256sum …` or local) compared to the manifest; `OGM_BACKUP_FAKE_CORRUPT=1` makes the comparison fail (test hook); (6) on success `echo $STAMP > $STATE/last-stamp` and `touch $STATE/last-ok`; print a one-line JSON summary (`{"stamp","blobs":n,"dbBytes","shipped":bytes}`); `rm -rf "$WORK"` in a trap.

Interface sketch:

```
ops/backup/backup.sh            # env: OGM_DATA_DIR OGM_BLOB_ROOT OGM_BACKUP_TARGET [OGM_BACKUP_STATE] [OGM_BACKUP_FAKE_CORRUPT]
exit 0 on verified ship; 1 otherwise; never deletes at the target
```

Test scenarios:
- Given 3 blobs and a DB, when run with `local:`, then the target holds `db-*.sqlite`, `blobs-*.tar.zst` (6 entries: 3 blobs + 3 sidecars) and `manifest-*.json` with matching sha256s; `last-ok` exists.
- Given a 4th blob added, when run again, then the new tar lists exactly that blob and its sidecar.
- Given `OGM_BACKUP_FAKE_CORRUPT=1`, then exit 1 and `last-stamp` unchanged.
- Given an unknown target scheme, then exit 1 naming it.

### U3 `restore.sh`

Goal: rebuild `OGM_DATA_DIR` and `OGM_BLOB_ROOT` from a stamp; proven once.

Files: Create `ops/backup/restore.sh` (executable).

Approach: `restore.sh <stamp> --to <dir> [--target <OGM_BACKUP_TARGET>]`; require `<dir>` empty; fetch `manifest-<stamp>.json`, walk `previous` links back to the first stamp (full backup), fetch each `blobs-*.tar.zst` oldest-first and extract into `<dir>/blobs/blobs/` (then the layout matches `OGM_BLOB_ROOT`), copy `db-<stamp>.sqlite` to `<dir>/data/ogm.db`, verify every fetched file's sha256 against its manifest, print `restored <n> blobs, db <bytes> bytes -> <dir>`; print the two env lines to point a service at it (`OGM_DATA_DIR=<dir>/data`, `OGM_BLOB_ROOT=<dir>/blobs`).

Test scenarios:
- Given the two backups from U2, when `restore.sh <stamp2> --to <empty>`, then the restored DB has 4 rows and `find blobs -type f | sort | xargs sha256sum` equals the source's.
- Given a non-empty `--to`, then exit 1 and nothing written.
- Given a manifest whose sha256 was altered, then exit 1 naming the file.

Execution note: `ops/test/backup-restore.sh` is the drill; write it first and make U1–U3 satisfy it.

### U4 `ogm-status`

Goal: one command for the operator, with fakes for the test.

Files: Create `ops/bin/ogm-status` (executable), `ops/test/status.sh`.

Approach: bash; binaries overridable by env (`OGM_SYSTEMCTL`, `OGM_JOURNALCTL`, `OGM_SS`, `OGM_DF`, `OGM_DU`, `OGM_TAILSCALE`). Sections: `units` (`systemctl --user list-units 'ogm-*' --no-pager --plain`); `placeholders` (`journalctl --user -u 'ogm-*' --since -10min -o cat | grep '^PLACEHOLDER' | sort -u`); `listeners` (`ss -tlnpH`; lines whose process is an OGM unit child or `python3 -m http.server`; `STRAY` when the local address is not `127.0.0.1:` nor `[::1]:`); `disk` (`df -h /home`); `sizes` (`du -sh ~/.local/share/ogm ~/.aiur ~/.local/share/aiur` and `journalctl --user --disk-usage`); `backup` (`last-stamp`, age in hours, size of the last manifest's files); `ingress` (`tailscale serve status` first lines; `not operator` if it errors). `--check` exit 1 on failed units, STRAY, or backup age > 48 h; `--json` emits the same as one object.

Test scenarios:
- Given fakes printing one `ogm-api … active running` line, a journal with `PLACEHOLDER rooms`, and `ss` output with `127.0.0.1:3100 node` and `0.0.0.0:8792 python3`, when `ogm-status` runs, then stdout has the seven section headers, `PLACEHOLDER rooms`, and one `STRAY 0.0.0.0:8792` line; `--check` exits 1.
- Given the stray line removed and `last-ok` touched now, then `--check` exits 0.
- Given `last-ok` 3 days old, then `--check` exits 1 with `backup stale`.

### U5 Runbook and hand steps

Goal: an operator page and the list Kevin needs.

Files: Create `docs/ops/runbook.md`, `docs/ops/hand-steps.md`.

Approach: `runbook.md` sections: install (`ops/bin/ogm-host-setup.sh`), start/stop/restart one or all units, logs (`journalctl --user -u ogm-api -f`), env files and rotation (`ogm-env-init <unit> --force` then restart; which units share a secret), ingress (link `docs/ops/ingress.md`), backup (timer, manual run, where the state is), restore (the drill commands), status (`ogm-status --check`), placeholders (what they mean, which ticket fills each), disk and journal housekeeping (`~/.aiur` size, `.claude/worktrees` pruning per E12-11), the daemon units (`ogm-aiur@<slug>`, cookie in the caller's env for `aiur status`). `hand-steps.md`: each item in the `remind` format: `sudo tailscale set --operator=orangekid` (GATE-TS-OPERATOR); approve Funnel on 8443/10000 or choose tailnet-only; confirm the backup node and SSH (GATE-BACKUP-TARGET); `chmod 600 ~/github/aiur/.env`; create a machine-user GitHub account for the builder bot and move Kevin's PAT out of `~/.aiur/.env` (E03-8); create the OGM GitHub App (GATE-GITHUB-APP); Google OAuth client (GATE-GOOGLE-OAUTH); optional `journald.conf SystemMaxUse=4G`; optional Blender install (R87); do not add `orangekid` to `docker`/`kvm` unless OGM-037 asks. The PR body asks the Executor to add them to `~/remind.md` with the `remind` skill (agents do not write to `$HOME` files outside the repo).

Test scenarios:
- Given `docs/ops/hand-steps.md`, when `grep -c '^- \[ \]'` runs, then ≥ 8, and each of `GATE-TS-OPERATOR`, `GATE-BACKUP-TARGET`, `GATE-GITHUB-APP`, `GATE-GOOGLE-OAUTH` appears once (add to `ops/test/status.sh` as a doc guard).

## 4. Verification

```
bash ops/test/backup-restore.sh
bash ops/test/status.sh
node --no-warnings ops/backup/sqlite-backup.mjs /nonexistent.db /tmp/x.sqlite; echo exit=$?
ops/bin/ogm-status            # on this host, pasted
# after GATE-BACKUP-TARGET:
OGM_BACKUP_TARGET=ssh:orangekid:~/ogm-backups OGM_DATA_DIR=~/.local/share/ogm/data OGM_BLOB_ROOT=~/.local/share/ogm/blobs ops/backup/backup.sh
ops/backup/restore.sh <stamp> --to /tmp/ogm-restore-drill
```

Paste into `## Local tests`: both shell test summaries, the `exit=0` line, the `ogm-status` output (names and sizes only), and when the gate is cleared the manifest summary and the restore line.

## 5. Deferred to implementation

- `VACUUM INTO` vs `node:sqlite` `backup()` API: default `VACUUM INTO` (works on every Node 24 build; one statement).
- Delta detection by `-newer last-ok` vs comparing against the previous manifest list: default `-newer` (exact for content-addressed files that never change); the manifest list is kept for audit.
- Compression level: default `zstd -3` (tar's `--zstd`).
- Whether `ogm-status` also prints aiur `status` for live daemons: default no (OGM-034 may add it).

## 6. Scope boundaries

- Timer and `ogm-run backup`: OGM-002. Blob layout: OGM-005. DB file name and migrations: OGM-010. Ingress doc: OGM-006.
- Retention of releases and artifacts: OGM-045 (D-ARTIFACTS keeps everything). Encryption at rest, Drive backup, off-site providers: deferred.
- Killing stray listeners, firewall, journald limits: Kevin (sudo) via hand steps.

## 7. Risks

- Far-side disk space on `orangekid` is unknown [U]: the manifest records sizes; `ogm-status` shows the local total; the gate asks Kevin to confirm space.
- The first full backup of a large blob root over the Funnel-less tailnet link may take hours: the timer is nightly and `Persistent=true`; the script is restartable by stamp.
- `node:sqlite` prints an experimental warning: silenced with `--no-warnings`; if a future Node drops the module, swap to `better-sqlite3` from `packages/db` (OGM-010) in `sqlite-backup.mjs` only.
- Backup of a DB while the API writes: `VACUUM INTO` reads a consistent snapshot under WAL; no API pause needed.
