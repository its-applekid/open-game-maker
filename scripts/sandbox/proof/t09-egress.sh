#!/usr/bin/env bash
# B4 test 9: no egress. Only lo exists; TCP to a raw IP, DNS and UDP/53 all fail.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ws="$OGM_PROOF_WS_A"
ifaces="$(in_sandbox "$ws" awk -F: 'NR > 2 {gsub(/ /, "", $1); print $1}' /proc/net/dev 2>/dev/null | tr '\n' ' ' ||
  true)"
ifaces="${ifaces% }"

status_of() {
  local rc=0
  in_sandbox "$ws" "$@" >/dev/null 2>&1 || rc=$?
  printf '%s' "$rc"
}
curl_rc="$(status_of curl -sS --max-time 5 -o /dev/null https://1.1.1.1)"
dns_rc="$(status_of getent hosts github.com)"
udp_rc="$(status_of bash -c 'exec 3<>/dev/udp/1.1.1.1/53 && printf x >&3')"

iface_text="${ifaces:-none}"
[[ "$ifaces" == "lo" ]] && iface_text="lo only"
observed="/proc/net/dev: $iface_text; curl: exit $curl_rc; getent: exit $dns_rc; udp/53: exit $udp_rc"
if [[ "$ifaces" == "lo" ]] && ((curl_rc != 0 && dns_rc != 0 && udp_rc != 0)); then
  record t09 PASS "$observed"
else
  record t09 FAIL "$observed"
fi
