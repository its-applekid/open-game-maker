#!/usr/bin/env bash
# Every Node service unit's entry: its start script names a file the build emits from a src/*.ts, and after
# `pnpm build` (CI builds before these tests) that file exists.

set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$test_dir" rev-parse --show-toplevel)
source "$test_dir/lib.sh"

built=0
[[ -n ${CI:-} || -d $repo/services/api/dist ]] && built=1

for service in api rooms games-host intake commit core-bump; do
  dir=$repo/services/$service
  entry=$("$repo/ops/bin/ogm-entry" "$dir") || fail "services/$service has no node start script"
  relative=${entry#"$dir/"}
  [[ $relative == dist/*.js ]] || fail "services/$service start entry is not under dist/: $relative"
  source_file=$dir/src/${relative#dist/}
  [[ -f ${source_file%.js}.ts ]] || fail "services/$service start entry $relative has no src/${relative#dist/} source"
  if (( built )); then
    [[ -f $entry ]] || fail "services/$service/$relative is missing after pnpm build"
  fi
done

if (( built )); then
  printf 'service entries: ok\n'
else
  printf 'service entries: ok (sources only; run pnpm build to check the built files)\n'
fi
