#!/usr/bin/env bash
# B4 test 3: a command in workspace A cannot list, read or write workspace B.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

a="$OGM_PROOF_WS_A"
b="$OGM_PROOF_WS_B"
printf 'canary\n' >"$b/secret.txt"

denied=0
results=()
for check in list read write; do
  case "$check" in
    list) argv=(ls -A "$b") ;;
    read) argv=(cat "$b/secret.txt") ;;
    write) argv=(touch "$b/from-a") ;;
  esac
  if in_sandbox "$a" "${argv[@]}" >/dev/null 2>&1; then
    results+=("$check allowed")
  else
    results+=("$check denied")
    denied=$((denied + 1))
  fi
done
rm -f -- "$b/from-a"

observed="ws-b from ws-a: ${results[0]}, ${results[1]}, ${results[2]}"
if ((denied == 3)); then
  record t03 PASS "$observed"
else
  record t03 FAIL "$observed"
fi
