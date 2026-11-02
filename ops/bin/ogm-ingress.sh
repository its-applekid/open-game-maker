#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf 'usage: ogm-ingress.sh [--dry-run] [--off] [--tailnet-only]\n' >&2
  exit 64
}

dry_run=0
mode=on
via=funnel
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --off) mode=off ;;
    --tailnet-only) via=serve ;;
    *) usage ;;
  esac
done

tailscale=${OGM_TAILSCALE:-tailscale}
env_dir=${OGM_ENV_DIR:-$HOME/.config/ogm/env}

# Read one port by name; the env files also hold secrets, so never source them or print other lines.
port() {
  local file=$env_dir/$1.env name=$2 value
  value=$(grep -E "^$name=" "$file" 2> /dev/null | tail -n 1 | cut -d= -f2- | tr -d "[:space:]\"'" || true)
  if [[ ! $value =~ ^[0-9]+$ ]] || ((value < 1 || value > 65535)); then
    printf 'ogm-ingress: missing or invalid %s in %s\n' "$name" "$file" >&2
    exit 1
  fi
  printf '%s' "$value"
}

# Port 443 and :80 serve other apps on this node; OGM owns only 8443 and 10000.
commands=()
if [[ $mode == on ]]; then
  api=$(port api OGM_API_PORT)
  rooms=$(port rooms OGM_ROOMS_PORT)
  voice=$(port voice-host OGM_VOICE_PORT)
  games=$(port games OGM_GAMES_PORT)
  commands+=(
    "$via --bg --yes --https=8443 http://127.0.0.1:$api"
    "$via --bg --yes --https=8443 --set-path=/ws/rooms http://127.0.0.1:$rooms"
    "$via --bg --yes --https=8443 --set-path=/ws/voice http://127.0.0.1:$voice"
    "$via --bg --yes --https=10000 http://127.0.0.1:$games"
  )
else
  commands+=(
    "serve --yes --https=10000 off"
    "serve --yes --https=8443 --set-path=/ws/voice off"
    "serve --yes --https=8443 --set-path=/ws/rooms off"
    "serve --yes --https=8443 off"
  )
fi

if ((dry_run)); then
  printf 'tailscale %s\n' "${commands[@]}"
  exit 0
fi

for command in "${commands[@]}"; do
  read -ra argv <<< "$command"
  if ! "$tailscale" "${argv[@]}"; then
    printf 'ogm-ingress: "tailscale %s" failed.\n' "$command" >&2
    printf 'If it was a permission error, Kevin runs: sudo tailscale set --operator=%s\n' "$(id -un)" >&2
    exit 1
  fi
done

"$tailscale" serve status
"$tailscale" funnel status
