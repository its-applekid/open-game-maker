#!/usr/bin/env bash
set -euo pipefail

profile_name="gamebuilder"
configured_codex_home="${HOME}/.config/ogm/codex-gamebuilder"

while (($# > 0)); do
  case "$1" in
    --codex-home)
      if (($# < 2)); then
        echo "--codex-home requires a directory" >&2
        exit 0
      fi
      configured_codex_home="$2"
      shift 2
      ;;
    --profile)
      if (($# < 2)); then
        echo "--profile requires a name" >&2
        exit 0
      fi
      profile_name="$2"
      shift 2
      ;;
    -h | --help)
      echo "usage: $0 [--codex-home DIR] [--profile NAME]"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: $0 [--codex-home DIR] [--profile NAME]" >&2
      exit 0
      ;;
  esac
done

if [[ ! "$profile_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "profile name must contain only letters, numbers, underscores, or hyphens" >&2
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex not on PATH"
  exit 0
fi

probe_home="$(mktemp -d "${TMPDIR:-/tmp}/ogm-sandbox-probe.XXXXXX")"
chmod 700 "$probe_home"
trap 'rm -rf -- "$probe_home"' EXIT
mkdir -p "$probe_home/app-server-control" "$probe_home/app-server-daemon" "$probe_home/runtime"
chmod 700 "$probe_home/app-server-control" "$probe_home/app-server-daemon" "$probe_home/runtime"
: >"$probe_home/diagnostics"

credential_paths=(
  "${HOME}/.config/gh"
  "${HOME}/.aiur/github-budget"
  "${HOME}/.codex/auth.json"
  "${HOME}/.claude"
  "${HOME}/.claude-2"
  "${HOME}/.config/ogm"
  "${HOME}/.config/netlify"
  "${HOME}/.ssh"
  "${HOME}/.aiur/.env"
  "${HOME}/github/aiur/.env"
  "${PWD}/assets-local"
)

toml_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

{
  printf 'default_permissions = "%s"\n\n' "$profile_name"
  printf '[permissions.%s]\n' "$profile_name"
  printf 'extends = ":workspace"\n\n'
  printf '[permissions.%s.filesystem]\n' "$profile_name"
  printf '":slash_tmp" = "deny"\n'
  for path in "${credential_paths[@]}"; do
    printf '%s = "deny"\n' "$(toml_quote "$path")"
  done
} >"$probe_home/config.toml"

last_error=""
run_sandbox() {
  local output
  local status

  set +e
  output="$(
    XDG_RUNTIME_DIR="$probe_home/runtime" CODEX_HOME="$probe_home" \
      codex sandbox -P "$profile_name" --sandbox-state-disable-network -- "$@" \
      2>"$probe_home/last-error"
  )"
  status=$?
  set -e
  last_error="$(tr '\n' ' ' <"$probe_home/last-error" | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"

  if ((status == 0)); then
    printf '%s' "$output"
  else
    printf 'sandbox: %s\n' "$last_error" >>"$probe_home/diagnostics"
    printf 'ERROR'
  fi
}

probe_path() {
  local path="$1"
  local result

  if [[ ! -e "$path" ]]; then
    printf 'MISSING'
    return
  fi

  result="$(
    run_sandbox /bin/sh -c \
      'if [ -d "$1" ]; then ls -A "$1" >/dev/null 2>&1; else cat "$1" >/dev/null 2>&1; fi && echo READ || echo DENIED' \
      probe "$path"
  )"
  printf '%s' "$result"
}

printf '| Check | Result |\n'
printf '|---|---|\n'
for path in "${credential_paths[@]}"; do
  result="$(probe_path "$path")"
  printf '| `%s` | %s |\n' "$path" "$result"
done

network_result="$(
  run_sandbox /bin/sh -c \
    'if awk -F: '\''NR > 2 {gsub(/ /, "", $1); if ($1 != "lo") found=1} END {exit found ? 0 : 1}'\'' /proc/net/dev; then echo READ; else echo DENIED; fi'
)"
printf '| network | %s |\n' "$network_result"

tmp_result="$(
  run_sandbox /bin/sh -c \
    'path="/tmp/ogm-sandbox-probe.$$"; if : >"$path" 2>/dev/null; then rm -f "$path"; echo WRITABLE; else echo DENIED; fi'
)"
printf '| `/tmp` write | %s |\n' "$tmp_result"

workspace_result="$(
  run_sandbox /bin/sh -c \
    'path="./.ogm-sandbox-probe.$$"; if : >"$path" 2>/dev/null; then rm -f "$path"; echo WRITABLE; else echo DENIED; fi'
)"
printf '| workspace write | %s |\n' "$workspace_result"

set +e
XDG_RUNTIME_DIR="$probe_home/runtime" CODEX_HOME="$probe_home" \
  timeout 2 codex app-server --strict-config --listen stdio:// \
  >"$probe_home/app-server-output" 2>"$probe_home/app-server-error"
app_server_status=$?
set -e
if [[ "$app_server_status" == 0 || "$app_server_status" == 124 ]]; then
  app_server_result="ACCEPTED (default_permissions)"
else
  app_server_result="REJECTED"
  printf 'app-server: %s\n' "$(tr '\n' ' ' <"$probe_home/app-server-error")" >>"$probe_home/diagnostics"
fi
printf '| app-server profile | %s |\n' "$app_server_result"
printf '| configured CODEX_HOME | `%s` (%s) |\n' \
  "$configured_codex_home" \
  "$([[ -f "$configured_codex_home/config.toml" ]] && echo present || echo missing)"

if [[ -s "$probe_home/diagnostics" ]]; then
  printf '\nProbe diagnostics:\n'
  sort -u "$probe_home/diagnostics" | sed 's/^/- /'
fi

exit 0
