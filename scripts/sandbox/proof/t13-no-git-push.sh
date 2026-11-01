#!/usr/bin/env bash
# B4 test 13: git push from the sandbox fails (no network, no credential). --dry-run, so even a broken
# boundary pushes nothing.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ws="$OGM_PROOF_WS_A"
if [[ -z "$OGM_GIT" ]]; then
  record t13 SKIP "git not found"
  exit 0
fi

g=("$OGM_GIT" -c user.name=ogm-proof -c user.email=ogm-proof@localhost -C "$ws/repo")
in_sandbox "$ws" "$OGM_GIT" init -q "$ws/repo" >/dev/null
in_sandbox "$ws" "${g[@]}" commit -q --allow-empty -m proof >/dev/null
in_sandbox "$ws" "${g[@]}" remote add origin https://github.com/its-everdred/open-game-maker-2000.git

push_rc=0
push_err="$(in_sandbox "$ws" env GIT_TERMINAL_PROMPT=0 "${g[@]}" push --dry-run origin \
  "HEAD:refs/heads/ogm-proof-t13-$$" 2>&1 >/dev/null)" || push_rc=$?
cred="readable"
if ! in_sandbox "$ws" sh -c 'wc -c <"$1"' t13 "$HOME/.config/gh/hosts.yml" >/dev/null 2>&1; then
  cred="unreadable"
fi

observed="push: exit $push_rc, $(first_line "$push_err"); gh hosts.yml: $cred"
if ((push_rc != 0)) && [[ "$cred" == "unreadable" ]]; then
  record t13 PASS "$observed"
else
  record t13 FAIL "$observed"
fi
