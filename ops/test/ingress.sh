#!/usr/bin/env bash

set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$test_dir" rev-parse --show-toplevel)
source "$test_dir/lib.sh"

scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

env_dir=$scratch/env
fake_bin=$scratch/bin
log=$scratch/tailscale.log
mkdir -p "$env_dir" "$fake_bin"

# A secret sits next to each port so the test can prove the script never echoes it.
printf 'OGM_API_PORT=3100\nOGM_SESSION_SECRET=do-not-print\n' > "$env_dir/api.env"
printf 'OGM_ROOMS_PORT="3200"\n' > "$env_dir/rooms.env"
printf 'OGM_VOICE_PORT=3300\n' > "$env_dir/voice-host.env"
printf 'OGM_GAMES_PORT=3400\n' > "$env_dir/games.env"

cat > "$fake_bin/tailscale" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_TS_LOG"
if [[ -n ${FAKE_TS_FAIL:-} && $1 != status ]]; then
  printf '%s\n' "$FAKE_TS_FAIL" >&2
  exit 1
fi
EOF
chmod +x "$fake_bin/tailscale"

run_ingress() {
  OGM_ENV_DIR=$env_dir \
    OGM_TAILSCALE=$fake_bin/tailscale \
    FAKE_TS_LOG=$log \
    "$repo/ops/bin/ogm-ingress.sh" "$@"
}

expected_on="funnel --bg --yes --https=8443 http://127.0.0.1:3100
funnel --bg --yes --https=8443 --set-path=/ws/rooms http://127.0.0.1:3200
funnel --bg --yes --https=8443 --set-path=/ws/voice http://127.0.0.1:3300
funnel --bg --yes --https=10000 http://127.0.0.1:3400
serve status
funnel status"

# Default run: Funnel mounts for 8443 and 10000, then the status checks.
run_ingress > "$scratch/on.out"
assert_eq "$expected_on" "$(cat "$log")" "default run should record the funnel mounts and status"
cp "$log" "$scratch/first.log"
assert_not_grep 'do-not-print' "$scratch/on.out"

# Idempotent: a second run records exactly the same commands.
: > "$log"
run_ingress > /dev/null
diff -u "$scratch/first.log" "$log" || fail "second run should record the same commands"

# Dry run prints the commands with real ports and never calls tailscale.
: > "$log"
run_ingress --dry-run > "$scratch/dry.out"
[[ ! -s $log ]] || fail "--dry-run should not call tailscale"
assert_grep 'tailscale funnel --bg --yes --https=8443 --set-path=/ws/voice http://127.0.0.1:3300' "$scratch/dry.out"
assert_grep 'tailscale funnel --bg --yes --https=10000 http://127.0.0.1:3400' "$scratch/dry.out"
assert_not_grep 'do-not-print' "$scratch/dry.out"

# Tailnet-only uses serve, which also clears Funnel on those ports.
: > "$log"
run_ingress --tailnet-only > /dev/null
assert_eq "serve --bg --yes --https=8443 http://127.0.0.1:3100
serve --bg --yes --https=8443 --set-path=/ws/rooms http://127.0.0.1:3200
serve --bg --yes --https=8443 --set-path=/ws/voice http://127.0.0.1:3300
serve --bg --yes --https=10000 http://127.0.0.1:3400
serve status
funnel status" "$(cat "$log")" "--tailnet-only should mount with serve"

# Off removes only the 8443 and 10000 mounts, in reverse order.
: > "$log"
run_ingress --off > /dev/null
assert_eq "serve --yes --https=10000 off
serve --yes --https=8443 --set-path=/ws/voice off
serve --yes --https=8443 --set-path=/ws/rooms off
serve --yes --https=8443 off
serve status
funnel status" "$(cat "$log")" "--off should remove only the OGM mounts"

# Port 443 (and :80) belong to other apps: no recorded invocation may name them.
cat "$scratch/first.log" >> "$log"
if grep -E '(^|[^0-9])(443|80)([^0-9]|$)' "$log"; then
  fail "an invocation names port 443 or 80"
fi

# Unknown flags are refused.
if run_ingress --bogus > /dev/null 2>&1; then
  fail "an unknown flag should fail"
fi

# A missing env file fails loudly with the file and the variable name.
mv "$env_dir/rooms.env" "$scratch/rooms.env"
if run_ingress --dry-run > /dev/null 2> "$scratch/missing.err"; then
  fail "a missing rooms.env should fail"
fi
assert_grep 'rooms.env' "$scratch/missing.err"
assert_grep 'OGM_ROOMS_PORT' "$scratch/missing.err"
mv "$scratch/rooms.env" "$env_dir/rooms.env"

# A non-numeric port is refused rather than passed to tailscale.
printf 'OGM_GAMES_PORT=abc\n' > "$env_dir/games.env"
if run_ingress --dry-run > /dev/null 2> "$scratch/bad.err"; then
  fail "a non-numeric port should fail"
fi
assert_grep 'OGM_GAMES_PORT' "$scratch/bad.err"
printf 'OGM_GAMES_PORT=3400\n' > "$env_dir/games.env"

# A permission failure stops the run and names Kevin's hand step.
: > "$log"
if FAKE_TS_FAIL='Access denied: serve config denied' run_ingress > /dev/null 2> "$scratch/denied.err"; then
  fail "a failing tailscale command should fail the run"
fi
assert_eq "funnel --bg --yes --https=8443 http://127.0.0.1:3100" "$(cat "$log")" "the run should stop at the first failure"
assert_grep 'Access denied' "$scratch/denied.err"
assert_grep 'sudo tailscale set --operator=orangekid' "$scratch/denied.err"

# The doc OGM-070 copies from carries the same host and ports as the script.
doc=$repo/docs/ops/ingress.md
assert_grep '/api/*   https://applekid.tailee0e71.ts.net:8443/api/:splat   200' "$doc"
assert_grep '/auth/*  https://applekid.tailee0e71.ts.net:8443/auth/:splat  200' "$doc"
assert_grep 'frame-src https://applekid.tailee0e71.ts.net:10000' "$doc"
assert_grep 'wss://applekid.tailee0e71.ts.net:8443' "$doc"

printf 'ingress: ok\n'
