#!/usr/bin/env bash
# B4 test 11 (command half): only the job's workspace is writable. $HOME, /tmp, /usr, another daemon's
# workspace and a symlink out of the workspace are not.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

a="$OGM_PROOF_WS_A"
b="$OGM_PROOF_WS_B"
name="ogm-proof-t11.$$"
ln -s "$HOME" "$a/escape"

targets=("$HOME/.$name" "/tmp/$name" "/usr/$name" "$b/$name" "$a/escape/.$name-link")
labels=("\$HOME" "/tmp" "/usr" "ws-b" "symlink to \$HOME")
blocked=0
results=()
for i in "${!targets[@]}"; do
  if in_sandbox "$a" touch "${targets[$i]}" >/dev/null 2>&1; then
    results+=("${labels[$i]} written")
  else
    results+=("${labels[$i]} denied")
    blocked=$((blocked + 1))
  fi
done
# A broken boundary would have created these; remove exactly the names this run chose.
rm -f -- "$HOME/.$name" "/tmp/$name" "$b/$name" "$HOME/.$name-link" 2>/dev/null || true
rm -f -- "$a/escape"

ws_ok="denied"
if in_sandbox "$a" touch "$a/ok" >/dev/null 2>&1 && [[ -f "$a/ok" ]]; then
  ws_ok="ok"
fi

observed="$(IFS=,; printf '%s' "${results[*]}" | sed 's/,/, /g'); ws-a: $ws_ok"
if ((blocked == ${#targets[@]})) && [[ "$ws_ok" == "ok" ]]; then
  record t11 PASS "$observed"
else
  record t11 FAIL "$observed"
fi
