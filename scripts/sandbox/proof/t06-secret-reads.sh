#!/usr/bin/env bash
# B4 test 6: the E03-9 credential paths are unreadable and env carries no secret-named variable.
# Readability is tested with wc -c (fstat only) and ls -A to /dev/null; no value is ever printed.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ws="$OGM_PROOF_WS_A"
denied=0
readable=0
missing=0
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  path="${entry/#\~/$HOME}"
  path="${path/#<repo>/$OGM_REPO_ROOT}"
  if [[ ! -e "$path" ]]; then
    missing=$((missing + 1))
    detail t06 "\`$entry\` MISSING"
    continue
  fi
  if [[ -d "$path" ]]; then
    argv=(ls -A "$path")
  else
    argv=(sh -c 'wc -c <"$1"' t06 "$path")
  fi
  if in_sandbox "$ws" "${argv[@]}" >/dev/null 2>&1; then
    readable=$((readable + 1))
    detail t06 "\`$entry\` READ"
  else
    denied=$((denied + 1))
    detail t06 "\`$entry\` DENIED"
  fi
done <"$OGM_PROOF_DIR/../paths.txt"

env_names="$(in_sandbox "$ws" env | cut -d= -f1 | grep -Ei '(TOKEN|_KEY|SECRET|PASSWORD|COOKIE)' | sort -u |
  tr '\n' ' ' || true)"
env_names="${env_names% }"

observed="$denied DENIED, $readable READ, $missing MISSING; env: ${env_names:-no secret-named variables}"
if ((readable == 0 && denied > 0)) && [[ -z "$env_names" ]]; then
  record t06 PASS "$observed"
else
  record t06 FAIL "$observed"
fi
