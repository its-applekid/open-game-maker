#!/usr/bin/env bash
# Rebuild an OGM data directory from a backup set.
# usage: restore.sh <stamp> --to <empty dir> [--target <OGM_BACKUP_TARGET>]
# Writes <dir>/data/ogm.db and <dir>/blobs/blobs/...; every fetched file is checked against its manifest first.

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/target.sh"

usage() {
  printf 'usage: restore.sh <stamp> --to <empty dir> [--target ssh:<host>:<path>|local:<path>]\n' >&2
  exit 64
}

stamp=
to=
target=${OGM_BACKUP_TARGET:-}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) [[ $# -ge 2 ]] || usage; to=$2; shift 2 ;;
    --target) [[ $# -ge 2 ]] || usage; target=$2; shift 2 ;;
    -*) usage ;;
    *) [[ -z $stamp ]] || usage; stamp=$1; shift ;;
  esac
done
[[ -n $stamp && -n $to && -n $target ]] || usage
[[ $stamp =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { printf 'bad stamp: %s\n' "$stamp" >&2; exit 64; }

if [[ -e $to ]] && [[ ! -d $to || -n $(ls -A -- "$to") ]]; then
  printf 'refusing to restore into non-empty %s\n' "$to" >&2
  exit 1
fi
target_parse "$target"

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

# manifest_field <manifest> <field>: prints a top-level field (empty for null).
manifest_field() {
  node --no-warnings -e 'const v = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    process.stdout.write(v == null ? "" : String(v));' "$1" "$2"
}

# fetch_verified <manifest> <prefix>: fetches the manifest's file starting with <prefix>, prints its local path.
fetch_verified() {
  local manifest=$1 prefix=$2 line name sha
  line=$(node --no-warnings -e 'const m = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const f = m.files.find((x) => x.name.startsWith(process.argv[2]));
    if (f) process.stdout.write(`${f.name} ${f.sha256}`);' "$manifest" "$prefix")
  [[ -n $line ]] || return 0
  name=${line% *}
  sha=${line#* }
  target_get "$name" "$work/$name"
  if [[ $(sha256sum -- "$work/$name" | cut -d' ' -f1) != "$sha" ]]; then
    printf 'checksum mismatch: %s\n' "$name" >&2
    exit 1
  fi
  printf '%s\n' "$work/$name"
}

# Walk previous links back to the first (full) backup.
chain=()
current=$stamp
while [[ -n $current ]]; do
  target_get "manifest-$current.json" "$work/manifest-$current.json"
  chain=("$current" "${chain[@]}")
  current=$(manifest_field "$work/manifest-$current.json" previous)
done

tars=()
for s in "${chain[@]}"; do
  t=$(fetch_verified "$work/manifest-$s.json" "blobs-$s.tar.zst")
  tars+=("$t")
done
db=$(fetch_verified "$work/manifest-$stamp.json" "db-$stamp.sqlite")

install -d -m 0700 "$to" "$to/data" "$to/blobs/blobs"
for t in "${tars[@]}"; do
  tar --zstd -xf "$t" -C "$to/blobs/blobs"
done
db_bytes=0
if [[ -n $db ]]; then
  cp -- "$db" "$to/data/ogm.db"
  db_bytes=$(stat -c %s "$to/data/ogm.db")
fi

# Content addressing doubles as the final check: every blob's sha256 is its file name.
blobs=0
while IFS= read -r -d '' blob; do
  hex=${blob##*/}
  if [[ $(sha256sum -- "$blob" | cut -d' ' -f1) != "$hex" ]]; then
    printf 'restored blob does not match its name: %s\n' "$blob" >&2
    exit 1
  fi
  blobs=$((blobs + 1))
done < <(find "$to/blobs/blobs" -type f ! -name '*.json' -print0)

printf 'restored %d blobs, db %d bytes -> %s (verified)\n' "$blobs" "$db_bytes" "$to"
printf 'OGM_DATA_DIR=%s/data\nOGM_BLOB_ROOT=%s/blobs\n' "$to" "$to"
