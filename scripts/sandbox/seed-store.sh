#!/usr/bin/env bash
# Fills the offline pnpm store that sandboxed game builds install from (`pnpm install --offline`).
#   bash scripts/sandbox/seed-store.sh [<pkg>@<exact-version> ...]
#   bash scripts/sandbox/seed-store.sh --register|--unregister <game-dir>
# Fetches every templates/game-*/pnpm-lock.yaml (and the workspace lockfile when packages/sdk exists) into
# OGM_PNPM_STORE (default ~/.local/share/ogm/pnpm-store), adds any named packages, and prints the store's size
# and package count. Idempotent. Needs the registry, so it refuses to run without network.
# --register: pnpm 10 links every project it installs into <store>/projects, which a sandboxed install cannot
# write (the store is read-only there). The host registers a game directory once, before the first sandboxed
# `pnpm install --offline`, and pnpm then finds the link already in place; --unregister removes the link.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
store="${OGM_PNPM_STORE:-$HOME/.local/share/ogm/pnpm-store}"

# The link pnpm's registerProject would create: projects/<sha256(dir)[0:32]> -> dir, relative.
project_link() {
  local store_v="$1" dir="$2"
  printf '%s/projects/%s' "$store_v" "$(printf '%s' "$dir" | sha256sum | cut -c1-32)"
}

if [[ "${1:-}" == "--register" || "${1:-}" == "--unregister" ]]; then
  if [[ $# -ne 2 || ! -d "$2" ]]; then
    echo "usage: $0 $1 <existing game directory>" >&2
    exit 2
  fi
  game="$(realpath "$2")"
  [[ -d "$store" ]] || {
    echo "no store at $store: seed it first" >&2
    exit 2
  }
  store_v="$(pnpm store path --store-dir "$store")"
  link="$(project_link "$store_v" "$game")"
  if [[ "$1" == "--unregister" ]]; then
    rm -f -- "$link"
    echo "unregistered $game"
    exit 0
  fi
  mkdir -p "$store_v/projects"
  ln -sfnr -- "$game" "$link"
  echo "registered $game"
  exit 0
fi

for spec in "$@"; do
  if [[ ! "$spec" =~ ^(@[a-z0-9._-]+/)?[a-z0-9._-]+@[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
    echo "not <pkg>@<exact-version>: $spec" >&2
    exit 2
  fi
done
if [[ "$store" != /* ]]; then
  echo "OGM_PNPM_STORE must be an absolute path: $store" >&2
  exit 2
fi
if ! awk -F: 'NR > 2 {gsub(/ /, "", $1); if ($1 != "lo") found = 1} END {exit found ? 0 : 1}' /proc/net/dev; then
  echo "no network interface but lo: run this on the host, not inside the sandbox" >&2
  exit 2
fi
command -v pnpm >/dev/null 2>&1 || {
  echo "pnpm not on PATH" >&2
  exit 2
}

mkdir -p "$store"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/ogm-seed.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT

# pnpm fetch also writes a virtual store next to the lockfile, so fetch from a scratch copy: nothing is written
# outside the store and the scratch directory.
fetch_lockfile() {
  local label="$1" dir="$2"
  local work="$scratch/$(basename "$dir")"
  mkdir -p "$work"
  cp "$dir/pnpm-lock.yaml" "$work/"
  # Without its own pnpm-workspace.yaml a scratch copy must not attach to a workspace found above it.
  local scope=(--ignore-workspace)
  if [[ -f "$dir/pnpm-workspace.yaml" ]]; then
    cp "$dir/pnpm-workspace.yaml" "$work/"
    scope=()
  fi
  if ! pnpm fetch "${scope[@]}" --dir "$work" --store-dir "$store" >"$scratch/fetch.log" 2>&1; then
    echo "pnpm fetch failed for $label:" >&2
    tail -n 20 "$scratch/fetch.log" >&2
    exit 1
  fi
  echo "seeded $label"
  rm -f -- "$(project_link "$(pnpm store path --store-dir "$store")" "$work")"
  rm -rf -- "$work"
}

seeded=0
for lock in "$repo_root"/templates/game-*/pnpm-lock.yaml; do
  [[ -f "$lock" ]] || continue
  dir="$(dirname "$lock")"
  fetch_lockfile "templates/$(basename "$dir")" "$dir"
  seeded=$((seeded + 1))
done
if [[ -d "$repo_root/packages/sdk" ]]; then
  # The SDK is a workspace package with no lockfile of its own; the workspace lockfile covers its deps.
  fetch_lockfile "packages/sdk (workspace lockfile)" "$repo_root"
  seeded=$((seeded + 1))
fi
if ((seeded == 0)); then
  echo "no template lockfiles and no packages/sdk yet: nothing to seed from lockfiles"
fi

if (($# > 0)); then
  if ! pnpm store add --store-dir "$store" "$@" >"$scratch/add.log" 2>&1; then
    echo "pnpm store add failed:" >&2
    tail -n 20 "$scratch/add.log" >&2
    exit 1
  fi
  printf 'added %s\n' "$@"
fi

store_v="$(pnpm store path --store-dir "$store")"
count="$( { find "$store_v/index" -type f -name '*.json' 2>/dev/null || true; } | wc -l)"
echo "store: $store_v"
echo "size: $(du -sh "$store" | cut -f1)"
echo "packages: $count"
