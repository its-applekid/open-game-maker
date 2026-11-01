after_create: |
  set -eu
  git clone "$THIS_REPOSITORY_URL" .
  ticket="${AIUR_HOOK_TICKET_IDENTIFIER:?}"
  git checkout -b "${AIUR_TICKET_BRANCH:-aiur/${ticket}}" "origin/$THIS_BASE_BRANCH"
  mkdir -p .gm/context
  rm -f .gm/context/bundle.json .gm/context/bundle.missing
  secret="$(cat "${OGM_HOOK_SECRET_FILE:?}" 2>/dev/null || true)"
  if [ -n "$secret" ] && curl -fsS --max-time 20 -H "Authorization: Bearer ${secret}" \
      "${OGM_INTERNAL_URL:-http://127.0.0.1:0}/internal/jobs/by-ticket/${ticket}/bundle" \
      -o .gm/context/bundle.json; then
    want="$(node -p "require('./.gm/context/bundle.json').skillPackVersion")"
    have="$(node -p "require('./skills.lock').pack" 2>/dev/null || echo none)"
    if [ "$want" != "$have" ]; then
      url="$(node -p "require('./.gm/context/bundle.json').skillPackUrl")"
      if curl -fsS --max-time 60 -H "Authorization: Bearer ${secret}" "$url" -o .gm/context/skills.tgz; then
        rm -rf .claude/skills/gm-*
        tar -xzf .gm/context/skills.tgz -C .claude/skills
      fi
    fi
  else
    rm -f .gm/context/bundle.json
    echo "bundle unavailable" > .gm/context/bundle.missing
  fi
before_remove: |
  git status --short
