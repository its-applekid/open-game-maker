#!/usr/bin/env bash
# Nightly OGM backup: SQLite snapshot + exact blob delta, shipped to OGM_BACKUP_TARGET and verified there.
# env: OGM_DATA_DIR OGM_BLOB_ROOT OGM_BACKUP_TARGET [OGM_BACKUP_STATE] [OGM_BACKUP_FAKE_CORRUPT=1 (test hook)]
# exit 0 on a verified ship, 1 otherwise. Never deletes anything at the target.

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/target.sh"

: "${OGM_DATA_DIR:?OGM_DATA_DIR must be set}"
: "${OGM_BLOB_ROOT:?OGM_BLOB_ROOT must be set}"
: "${OGM_BACKUP_TARGET:?OGM_BACKUP_TARGET must be set}"
target_parse "$OGM_BACKUP_TARGET"

state=${OGM_BACKUP_STATE:-$HOME/.local/state/ogm/backup}
install -d -m 0700 "$state"
previous=
[[ -f $state/last-stamp && -f $state/last-ok ]] && previous=$(< "$state/last-stamp")

stamp=$(date -u +%Y%m%dT%H%M%SZ)
while [[ $stamp == "$previous" ]]; do
  sleep 1
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
done

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

# Taken before the blob scan: a blob written during this run is newer than the marker and rides in the next delta.
touch "$state/run-marker"

files=()
node --no-warnings "$script_dir/sqlite-backup.mjs" "$OGM_DATA_DIR/ogm.db" "$work/db-$stamp.sqlite"
[[ -f $work/db-$stamp.sqlite ]] && files+=("db-$stamp.sqlite")

# Blobs are content-addressed and never change, so "changed since the last verified run" is an exact delta.
# -cnewer (inode change time) also catches a blob whose temp file was written earlier and renamed in later.
blob_dir=$OGM_BLOB_ROOT/blobs
if [[ -d $blob_dir ]]; then
  find "$blob_dir" -type f ${previous:+-cnewer "$state/last-ok"} -printf '%P\n' | LC_ALL=C sort > "$work/blobs.list"
else
  blob_dir=$work
  : > "$work/blobs.list"
fi
tar --zstd -cf "$work/blobs-$stamp.tar.zst" -C "$blob_dir" -T "$work/blobs.list"
files+=("blobs-$stamp.tar.zst")

repo_sha=$(git -C "$script_dir" rev-parse HEAD 2>/dev/null || echo unknown)
env_files=$(find "$HOME/.config/ogm/env" -maxdepth 1 -name '*.env' -printf '%f\n' 2>/dev/null | LC_ALL=C sort || true)

(cd -- "$work" && sha256sum -- "${files[@]}") > "$work/files.sha256"
STAMP=$stamp PREVIOUS=$previous HOST=$(hostname) REPO_SHA=$repo_sha ENV_FILES=$env_files WORK=$work \
  node --no-warnings - > "$work/manifest-$stamp.json" <<'EOF'
const { readFileSync, statSync } = require('node:fs');
const e = process.env;
const files = readFileSync(`${e.WORK}/files.sha256`, 'utf8').trim().split('\n').map((line) => {
  const [sha256, name] = line.split(/\s+\*?/);
  return { name, bytes: statSync(`${e.WORK}/${name}`).size, sha256 };
});
const list = readFileSync(`${e.WORK}/blobs.list`, 'utf8').split('\n').filter(Boolean);
const db = files.find((f) => f.name.startsWith('db-'));
const manifest = {
  stamp: e.STAMP,
  previous: e.PREVIOUS || null,
  files,
  blobCount: list.filter((p) => !p.endsWith('.json')).length,
  dbBytes: db ? db.bytes : 0,
  host: e.HOST,
  repoSha: e.REPO_SHA,
  envFiles: e.ENV_FILES.split('\n').filter(Boolean),
};
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
EOF
files+=("manifest-$stamp.json")

for name in "${files[@]}"; do
  target_put "$work/$name" "$name"
done

(cd -- "$work" && sha256sum -- "${files[@]}") > "$work/expected.sha256"
if [[ ${OGM_BACKUP_FAKE_CORRUPT:-} == 1 ]]; then
  sed -i '1s/^./x/' "$work/expected.sha256"
fi
if ! target_sha256 "${files[@]}" | sed 's/ \*/  /' | cmp -s - "$work/expected.sha256"; then
  printf 'far-side checksum mismatch for %s; last-ok not advanced\n' "$stamp" >&2
  exit 1
fi

mv -f -- "$state/run-marker" "$state/last-ok"
printf '%s\n' "$stamp" > "$state/last-stamp"

shipped=0
for name in "${files[@]}"; do
  shipped=$((shipped + $(stat -c %s "$work/$name")))
done
printf '{"stamp":"%s","blobs":%d,"dbBytes":%d,"shipped":%d}\n' "$stamp" \
  "$(grep -vc '\.json$' "$work/blobs.list" || true)" \
  "$( [[ -f $work/db-$stamp.sqlite ]] && stat -c %s "$work/db-$stamp.sqlite" || echo 0)" "$shipped" | tee "$state/last-summary"
