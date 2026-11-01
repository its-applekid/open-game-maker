#!/usr/bin/env bash
# Restore drill: back up, add a blob and a row, back up again, restore, compare.

set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$test_dir" rev-parse --show-toplevel)
source "$test_dir/lib.sh"

scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

backup=$repo/ops/backup/backup.sh
restore=$repo/ops/backup/restore.sh
helper=$repo/ops/backup/sqlite-backup.mjs

export HOME=$scratch/home
export OGM_DATA_DIR=$scratch/data
export OGM_BLOB_ROOT=$scratch/blobs
export OGM_BACKUP_STATE=$scratch/state
export OGM_BACKUP_TARGET=local:$scratch/target
set_dir=$scratch/target/ogm-backups
mkdir -p "$HOME/.config/ogm/env" "$OGM_DATA_DIR" "$OGM_BLOB_ROOT/blobs/sha256"
printf 'OGM_SECRET_VALUE=do-not-ship\n' > "$HOME/.config/ogm/env/api.env"

sql() {
  node --no-warnings -e 'const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]); const r = db.prepare(process.argv[2]).all();
    db.close(); if (r.length) process.stdout.write(String(Object.values(r[0])[0]));' "$@"
}

add_blob() {
  local hex
  hex=$(printf '%s' "$1" | sha256sum | cut -d' ' -f1)
  printf '%s' "$1" > "$OGM_BLOB_ROOT/blobs/sha256/$hex"
  printf '{"contentType":"text/plain"}\n' > "$OGM_BLOB_ROOT/blobs/sha256/$hex.json"
  printf '%s\n' "$hex"
}

source_sums() {
  (cd -- "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)
}

# The helper skips cleanly before OGM-010 creates the database.
helper_out=$(node --no-warnings "$helper" "$scratch/missing.db" "$scratch/x.sqlite")
assert_grep 'no database yet' <(printf '%s\n' "$helper_out")
[[ ! -e $scratch/x.sqlite ]] || fail 'helper wrote a snapshot for a missing database'

sql "$OGM_DATA_DIR/ogm.db" 'PRAGMA journal_mode=WAL' > /dev/null
sql "$OGM_DATA_DIR/ogm.db" 'CREATE TABLE t (n INTEGER)' > /dev/null
for n in 1 2 3; do sql "$OGM_DATA_DIR/ogm.db" "INSERT INTO t VALUES ($n)" > /dev/null; done
for content in alpha beta gamma; do add_blob "$content" > /dev/null; done

# The helper refuses to overwrite an existing snapshot.
touch "$scratch/exists.sqlite"
set +e
node --no-warnings "$helper" "$OGM_DATA_DIR/ogm.db" "$scratch/exists.sqlite" 2> /dev/null
status=$?
set -e
assert_eq 2 "$status" 'the helper should refuse an existing output'

# An unknown target scheme is named and refused.
set +e
OGM_BACKUP_TARGET=s3:bucket "$backup" > /dev/null 2> "$scratch/scheme.err"
status=$?
set -e
assert_eq 1 "$status" 'an unknown target scheme should fail'
assert_grep 'unknown backup target: s3:bucket' "$scratch/scheme.err"

"$backup" > "$scratch/run1.out"
stamp1=$(< "$OGM_BACKUP_STATE/last-stamp")
assert_grep "\"stamp\":\"$stamp1\",\"blobs\":3" "$scratch/run1.out"
[[ -f $OGM_BACKUP_STATE/last-ok ]] || fail 'last-ok missing after a verified ship'
assert_eq 6 "$(tar --zstd -tf "$set_dir/blobs-$stamp1.tar.zst" | wc -l)" 'first backup holds every blob and sidecar'
(cd -- "$set_dir" && node --no-warnings -e '
  const m = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const f of m.files) console.log(`${f.sha256}  ${f.name}`);' "manifest-$stamp1.json" | sha256sum -c --quiet) ||
  fail 'manifest checksums do not match the shipped files'
assert_grep '"api.env"' "$set_dir/manifest-$stamp1.json"
grep -rqF 'do-not-ship' "$set_dir" && fail 'an env value reached the backup set'

hex4=$(add_blob delta)
sql "$OGM_DATA_DIR/ogm.db" 'INSERT INTO t VALUES (4)' > /dev/null
"$backup" > "$scratch/run2.out"
stamp2=$(< "$OGM_BACKUP_STATE/last-stamp")
[[ $stamp2 != "$stamp1" ]] || fail 'second backup reused the first stamp'
assert_eq "$(printf 'sha256/%s\nsha256/%s.json' "$hex4" "$hex4")" \
  "$(tar --zstd -tf "$set_dir/blobs-$stamp2.tar.zst" | LC_ALL=C sort)" 'second backup holds exactly the new blob'
assert_grep "\"previous\": \"$stamp1\"" "$set_dir/manifest-$stamp2.json"

restored=$scratch/restored
"$restore" "$stamp2" --to "$restored" > "$scratch/restore.out"
assert_grep "restored 4 blobs" "$scratch/restore.out"
assert_eq 4 "$(sql "$restored/data/ogm.db" 'SELECT count(*) FROM t')" 'restored DB has every row'
assert_eq "$(source_sums "$OGM_BLOB_ROOT/blobs")" "$(source_sums "$restored/blobs/blobs")" 'restored blobs match the source'

# restore.sh never writes into a non-empty directory.
mkdir "$scratch/busy" && touch "$scratch/busy/keep"
set +e
"$restore" "$stamp2" --to "$scratch/busy" > /dev/null 2> "$scratch/busy.err"
status=$?
set -e
assert_eq 1 "$status" 'restore should refuse a non-empty --to'
assert_eq keep "$(ls -A "$scratch/busy")" 'restore wrote into a non-empty --to'

# A manifest checksum that does not match its file is named and nothing is restored.
cp -r "$scratch/target" "$scratch/tampered"
sed -i -E '0,/"sha256": "[0-9a-f]/s//"sha256": "x/' "$scratch/tampered/ogm-backups/manifest-$stamp2.json"
set +e
"$restore" "$stamp2" --to "$scratch/tampered-out" --target "local:$scratch/tampered" > /dev/null 2> "$scratch/tamper.err"
status=$?
set -e
assert_eq 1 "$status" 'restore should fail on a checksum mismatch'
assert_grep 'checksum mismatch: ' "$scratch/tamper.err"
[[ ! -e $scratch/tampered-out ]] || fail 'restore wrote output despite a checksum mismatch'

# A failed far-side check leaves last-ok and last-stamp where they were.
add_blob epsilon > /dev/null
before=$(stat -c %Y.%y "$OGM_BACKUP_STATE/last-ok")
set +e
OGM_BACKUP_FAKE_CORRUPT=1 "$backup" > /dev/null 2> "$scratch/corrupt.err"
status=$?
set -e
assert_eq 1 "$status" 'a far-side checksum mismatch should fail the backup'
assert_grep 'far-side checksum mismatch' "$scratch/corrupt.err"
assert_eq "$stamp2" "$(< "$OGM_BACKUP_STATE/last-stamp")" 'last-stamp advanced after a failed check'
assert_eq "$before" "$(stat -c %Y.%y "$OGM_BACKUP_STATE/last-ok")" 'last-ok advanced after a failed check'

# The ssh: target runs the same commands through ssh; a fake ssh runs them locally in a fake remote home.
mkdir -p "$scratch/bin" "$scratch/remote-home"
cat > "$scratch/bin/ssh" <<EOF
#!/usr/bin/env bash
while [[ \$1 == -o ]]; do shift 2; done
[[ \$1 == backup-node ]] || exit 255
cd "$scratch/remote-home" && exec bash -c "\$2"
EOF
chmod +x "$scratch/bin/ssh"
# The retry after the failed run re-ships everything since stamp2, epsilon included.
PATH=$scratch/bin:$PATH OGM_BACKUP_TARGET='ssh:backup-node:~/ogm' "$backup" > "$scratch/ssh.out"
assert_grep '"blobs":1' "$scratch/ssh.out"
stamp3=$(< "$OGM_BACKUP_STATE/last-stamp")
[[ -f $scratch/remote-home/ogm/ogm-backups/manifest-$stamp3.json ]] || fail 'ssh target did not receive the manifest'
cp "$set_dir"/* "$scratch/remote-home/ogm/ogm-backups/"
PATH=$scratch/bin:$PATH "$restore" "$stamp3" --to "$scratch/ssh-restored" --target 'ssh:backup-node:~/ogm' \
  > "$scratch/ssh-restore.out"
assert_grep 'restored 5 blobs' "$scratch/ssh-restore.out"
assert_eq "$(source_sums "$OGM_BLOB_ROOT/blobs")" "$(source_sums "$scratch/ssh-restored/blobs/blobs")" \
  'ssh restore matches the source'

printf 'backup-restore: ok\n'
