#!/usr/bin/env bash
# B4 test 14: a fork bomb and a 4 GB allocation inside a systemd --user scope (TasksMax=256, MemoryMax=2G)
# are contained, the scope's limits read back from cgroupfs, and ogm-api stays as it was.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ws="$OGM_PROOF_WS_A"
if ! command -v systemd-run >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
  record t14 SKIP "no systemd --user manager"
  exit 0
fi

caps=(-p TasksMax=256 -p MemoryMax=2G -p MemorySwapMax=0 -p CPUQuota=100%)
unit="ogm-proof-t14-$$"
api_before="$(systemctl --user is-active ogm-api 2>/dev/null || true)"

# Fork bomb: runs for at most 20 s, is sampled while it fills the scope, then the scope is stopped.
sandbox_argv "$ws" bash -c 'b() { b | b & }; b; sleep 30'
systemd-run --user --scope --quiet --unit="$unit-fork" "${caps[@]}" timeout -s KILL 20 "${SB[@]}" \
  >/dev/null 2>&1 &
runner=$!

cg=""
for _ in $(seq 1 50); do
  cg="$(systemctl --user show -p ControlGroup --value "$unit-fork.scope" 2>/dev/null || true)"
  [[ -n "$cg" && -r "/sys/fs/cgroup$cg/pids.max" ]] && break
  sleep 0.1
done
if [[ -z "$cg" || ! -r "/sys/fs/cgroup$cg/pids.max" ]]; then
  wait "$runner" 2>/dev/null || true
  record t14 FAIL "scope $unit-fork.scope never appeared"
  exit 0
fi
sleep 4
pids_max="$(cat "/sys/fs/cgroup$cg/pids.max")"
pids_peak="$(cat "/sys/fs/cgroup$cg/pids.peak" 2>/dev/null || cat "/sys/fs/cgroup$cg/pids.current")"
mem_max="$(cat "/sys/fs/cgroup$cg/memory.max")"
host_fork="ok"
/bin/true || host_fork="failed"
started=$SECONDS
systemctl --user stop "$unit-fork.scope" >/dev/null 2>&1 || true
wait "$runner" 2>/dev/null || true
reaped=$((SECONDS - started))
fork_left="$(systemctl --user is-active "$unit-fork.scope" 2>/dev/null || true)"

# 4 GB allocation against MemoryMax=2G with no swap: the kernel must kill it.
sandbox_argv "$ws" node -e \
  'const a = []; for (let i = 0; i < 64; i++) a.push(Buffer.alloc(64 << 20, 1)); console.log("allocated");'
mem_rc=0
mem_out="$(systemd-run --user --scope --quiet --unit="$unit-mem" "${caps[@]}" timeout -s KILL 60 "${SB[@]}" \
  2>/dev/null)" || mem_rc=$?
mem_result="$(systemctl --user show -p Result --value "$unit-mem.scope" 2>/dev/null || true)"
systemctl --user reset-failed "$unit-mem.scope" >/dev/null 2>&1 || true

api_after="$(systemctl --user is-active ogm-api 2>/dev/null || true)"
if [[ "$api_before" == "active" ]]; then
  api_text="ogm-api: active before, $api_after after"
else
  api_text="ogm-api: not running (check skipped)"
fi

observed="fork bomb: pids.peak $pids_peak/$pids_max, host fork $host_fork, scope stopped in ${reaped}s"
observed+=" (${fork_left:-gone}); memory.max $mem_max; 4 GB alloc: exit $mem_rc, scope result ${mem_result:-unknown}; $api_text"
if [[ "$pids_max" == "256" && "$pids_peak" -le 256 && "$host_fork" == "ok" && "$fork_left" != "active" &&
  "$mem_max" == "2147483648" && "$mem_rc" -ne 0 && "$mem_out" != *allocated* && "$mem_result" == "oom-kill" &&
  ("$api_before" != "active" || "$api_after" == "active") ]]; then
  record t14 PASS "$observed"
else
  record t14 FAIL "$observed"
fi
