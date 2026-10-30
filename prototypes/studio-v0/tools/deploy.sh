#!/usr/bin/env bash
# Deploy to https://ogm2000.netlify.app (took over the ui-v0 site; keeps its favicon, app icons and manifest) (run tools/build.sh first). claude.ai wraps index.html in a page skeleton, so add
# the real one here. Synty pack previews stay out of the public site (licensed art).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
cp -r "$HERE/app.js" "$HERE/data.js" "$HERE/icons.js" "$HERE/scenes.js" "$HERE/art" "$HERE/demo" "$D/"; rm -f "$D/art/packs/synty-"*
U="$HERE/../ui-v0/site"; cp -r "$U/favicon.ico" "$U/icons" "$U/site.webmanifest" "$D/"
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><link rel="manifest" href="site.webmanifest"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>\n'
  cat "$HERE/index.html"; printf '\n</body></html>\n'; } > "$D/index.html"
printf '/*\n  X-Robots-Tag: noindex, nofollow\n/site.webmanifest\n  Content-Type: application/manifest+json\n' > "$D/_headers"
netlify deploy --prod --no-build --dir "$D" --site "$(cat "$HERE/.netlify-site-id")"
