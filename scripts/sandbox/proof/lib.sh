# shellcheck shell=bash
# Shared helpers for the sandbox proof tests. run.sh exports:
#   OGM_PROOF_WS_A, OGM_PROOF_WS_B   two temp workspaces (A is the job's, B another daemon's)
#   OGM_PROOF_CODEX_HOME             temp CODEX_HOME holding the rendered gamebuilder profile
#   OGM_PROOF_MODE                   normal | network-on | bare (the last two only under --self-test)

OGM_PROOF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OGM_REPO_ROOT="$(cd "$OGM_PROOF_DIR/../../.." && pwd)"
OGM_SANDBOX_PROFILE="gamebuilder"

# The real git, not an agent wrapper earlier on PATH.
OGM_GIT="$(PATH=/usr/local/bin:/usr/bin:/bin command -v git || true)"

# Fills SB with the argv that runs "$@" in the game-builder sandbox with workspace $1. This is OGM-037's
# probe invocation: codex sandbox -P gamebuilder --sandbox-state-disable-network -- <cmd>.
sandbox_argv() {
  local ws="$1"
  shift
  local flags=(--sandbox-state-disable-network)
  if [[ "${OGM_PROOF_MODE:-normal}" == "network-on" ]]; then
    # Deliberately wrong: drop the flag and open the profile's own network switch too (the profile denies
    # network by itself, so dropping the flag alone leaves egress blocked).
    flags=(-c "permissions.${OGM_SANDBOX_PROFILE}.network.enabled=true")
  fi
  SB=(env "XDG_RUNTIME_DIR=$OGM_PROOF_CODEX_HOME/runtime" "CODEX_HOME=$OGM_PROOF_CODEX_HOME"
    codex sandbox -P "$OGM_SANDBOX_PROFILE" "${flags[@]}" -C "$ws" -- "$@")
}

# in_sandbox <workspace> <cmd...>: run a command the way a game-builder agent command runs.
in_sandbox() {
  local ws="$1"
  shift
  if [[ "${OGM_PROOF_MODE:-normal}" == "bare" ]]; then
    (cd "$ws" && "$@")
    return
  fi
  sandbox_argv "$ws" "$@"
  "${SB[@]}"
}

# record <id> <PASS|FAIL|SKIP> <observed>: one result row on stdout for run.sh.
record() {
  printf '%s\t%s\t%s\n' "$1" "$2" "$3"
}

# detail <id> <text>: an extra line run.sh lists under the table.
detail() {
  printf '%s\tDETAIL\t%s\n' "$1" "$2"
}

# first_line <text>: the first non-empty line, for an observed cell.
first_line() {
  printf '%s\n' "$1" | sed -n '/[^[:space:]]/{p;q}' | cut -c1-120 | tr '|' '/'
}
