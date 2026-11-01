#!/usr/bin/env bash
# B4 test 10, adapted: with no network, `pnpm install --offline` in a copied engine template completes from the
# seeded store (scripts/sandbox/seed-store.sh).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ws="$OGM_PROOF_WS_A"
store="${OGM_PNPM_STORE:-$HOME/.local/share/ogm/pnpm-store}"
template=""
for lock in "$OGM_REPO_ROOT"/templates/game-*/pnpm-lock.yaml; do
  [[ -f "$lock" ]] && template="$(dirname "$lock")" && break
done
if [[ -z "$template" ]]; then
  record t10 SKIP "no templates/game-*/pnpm-lock.yaml yet (OGM-023/024)"
  exit 0
fi
if [[ ! -d "$store" ]]; then
  record t10 SKIP "no store at $store: run scripts/sandbox/seed-store.sh"
  exit 0
fi
command -v pnpm >/dev/null 2>&1 || {
  record t10 SKIP "pnpm not on PATH"
  exit 0
}

name="templates/$(basename "$template")"
mkdir -p "$ws/game"
(cd "$template" && tar --exclude=node_modules -cf - .) | tar -xf - -C "$ws/game"
if ! grep -q '^offline=true$' "$ws/game/.npmrc" 2>/dev/null; then
  # The template convention (docs/ops/sandbox.md); OGM-023/024 ship these lines in each template.
  printf '%s\n' 'store-dir=${HOME}/.local/share/ogm/pnpm-store' offline=true prefer-offline=true >>"$ws/game/.npmrc"
fi

# The host step that precedes a game's first sandboxed install (pnpm writes a project link into the store).
bash "$OGM_PROOF_DIR/../seed-store.sh" --register "$ws/game" >/dev/null

rc=0
out="$(in_sandbox "$ws/game" "$(command -v pnpm)" install --offline --frozen-lockfile --ignore-workspace \
  --store-dir "$store" 2>&1)" || rc=$?
bash "$OGM_PROOF_DIR/../seed-store.sh" --unregister "$ws/game" >/dev/null
last="$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -1 | cut -c1-120 | tr '|' '/')"
if ((rc == 0)) && [[ -d "$ws/game/node_modules" ]]; then
  record t10 PASS "$name: exit 0, $last"
else
  record t10 FAIL "$name: exit $rc, $last"
fi
