#!/usr/bin/env bash
# Build, inspect, and manually deploy the existing ogm2000.netlify.app site.
set -euo pipefail

ROOT="$(realpath "$(dirname "${BASH_SOURCE[0]}")/../../..")"
DRY_RUN=false
case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=true ;;
  *) printf 'usage: %s [--dry-run]\n' "$0" >&2; exit 2 ;;
esac

DEPLOY_DIR="$(mktemp -d)"
PREVIEW_PID=''
cleanup() {
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
  rm -rf -- "$DEPLOY_DIR"
}
trap cleanup EXIT

# Without it the build falls back to 127.0.0.1, which a phone cannot load; the reader refuses when it is unset.
GAMES_ORIGIN="$(node "$ROOT/apps/web/tools/games-origin.mjs")"
if [[ -z "$GAMES_ORIGIN" ]]; then
  printf '%s\n' 'deploy: the games origin reader printed nothing' >&2
  exit 1
fi
printf 'games origin: %s (OGM_APP_ORIGIN in games.env must list this app for frame-ancestors)\n' "$GAMES_ORIGIN"

VITE_GAMES_ORIGIN="$GAMES_ORIGIN" pnpm --dir "$ROOT" --filter @ogm/web build
cp -R "$ROOT/apps/web/dist/." "$DEPLOY_DIR/"
if [[ -d "$DEPLOY_DIR/art/packs" ]]; then
  find "$DEPLOY_DIR/art/packs" -maxdepth 1 -type f -name 'synty-*' -delete
fi

sed -i "s/__BUILD__/$(date +%s)/" "$DEPLOY_DIR/sw.js"
if grep -q '__BUILD__' "$DEPLOY_DIR/sw.js"; then
  printf '%s\n' 'service-worker build stamp was not replaced' >&2
  exit 1
fi

RECORD_DIR="$(mktemp -d)"
PREVIEW_LOG="$RECORD_DIR/preview.log"
LOAD_LOG="$RECORD_DIR/loadrec.log"
pnpm --dir "$ROOT/apps/web" exec vite preview \
  --host 127.0.0.1 --port 43171 --outDir "$DEPLOY_DIR" \
  >"$PREVIEW_LOG" 2>&1 &
PREVIEW_PID=$!
for _attempt in {1..40}; do
  if curl --fail --silent --output /dev/null http://127.0.0.1:43171/; then
    break
  fi
  sleep 0.25
done
if ! curl --fail --silent --output /dev/null http://127.0.0.1:43171/; then
  sed -n '1,120p' "$PREVIEW_LOG" >&2
  exit 1
fi

node "$ROOT/apps/web/tools/loadrec.mjs" \
  "$RECORD_DIR" http://127.0.0.1:43171/ 22 >"$LOAD_LOG"
sed -n '1,160p' "$LOAD_LOG"

VIDEO="$(find "$RECORD_DIR" -maxdepth 1 -type f -name '*.webm' | head -n 1)"
if [[ -z "$VIDEO" ]]; then
  printf '%s\n' 'load recording did not produce a video' >&2
  exit 1
fi
SHEET="$RECORD_DIR/sheet.png"
ffmpeg -loglevel error -ss 0 -t 3 -i "$VIDEO" \
  -vf 'fps=12.5,scale=156:-2,tile=10x4' -frames:v 1 "$SHEET"

TOWN_READY="$(grep 'town-ready' "$LOAD_LOG" | tail -n 1 || true)"
printf 'town-ready: %s\n' "${TOWN_READY:-no town}"
printf 'contact sheet: %s\n' "$SHEET"

if [[ "$DRY_RUN" == true ]]; then
  exit 0
fi

netlify deploy --prod --no-build --dir "$DEPLOY_DIR" \
  --site "$(<"$ROOT/apps/web/.netlify-site-id")"
