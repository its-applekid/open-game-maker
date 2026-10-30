#!/usr/bin/env bash
# Deploy to https://ogm2000-studio.netlify.app (run tools/build.sh first). claude.ai wraps index.html in a page skeleton, so add
# the real one here. Synty pack previews stay out of the public site (licensed art).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
cp -r "$HERE/app.js" "$HERE/data.js" "$HERE/icons.js" "$HERE/scenes.js" "$HERE/art" "$HERE/demo" "$D/"; rm -f "$D/art/packs/synty-"*
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>\n'
  cat "$HERE/index.html"; printf '\n</body></html>\n'; } > "$D/index.html"
printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > "$D/_headers"
netlify deploy --prod --no-build --dir "$D" --site "$(cat "$HERE/.netlify-site-id")"
