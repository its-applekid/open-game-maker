#!/usr/bin/env bash
# Build and manually deploy the static site (splash at /, /setup). Never run by CI: Netlify credits are limited.
set -euo pipefail

SITE="$(realpath "$(dirname "${BASH_SOURCE[0]}")/..")"
DRY_RUN=false
case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=true ;;
  *) printf 'usage: %s [--dry-run]\n' "$0" >&2; exit 2 ;;
esac

pnpm --dir "$SITE" build

# dist/ also holds tsc's output (one .js, .d.ts and maps per src/**/*.ts); publish only the site files
DEPLOY_DIR="$(mktemp -d)"
trap 'rm -rf -- "$DEPLOY_DIR"' EXIT
cp -R "$SITE/dist/." "$DEPLOY_DIR/"
while IFS= read -r source; do
  stem="${source#"$SITE/src/"}"; stem="${stem%.ts}"
  rm -f "$DEPLOY_DIR/$stem".{js,js.map,d.ts,d.ts.map}
done < <(find "$SITE/src" -name '*.ts')
rm -f "$DEPLOY_DIR"/*.tsbuildinfo
find "$DEPLOY_DIR" -type d -empty -delete
find "$DEPLOY_DIR" -type f | sed "s#^$DEPLOY_DIR##" | sort

if [[ "$DRY_RUN" == true ]]; then
  exit 0
fi

netlify deploy --prod --no-build --dir "$DEPLOY_DIR" --site "$(<"$SITE/.netlify-site-id")"
