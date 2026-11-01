#!/usr/bin/env bash
# Wakes the agent when a Drive drop is waiting for intake. Silent until then: it checks the inbox queue once a
# minute and exits (printing the open entries) only when an entry has no intake.json beside its manifest. The exit
# is what wakes the agent. Run it with the agent's background shell (Bash run_in_background) at session start and
# re-arm it after every gm-asset-intake pass.   usage: listen.sh [repo dir, default .] [seconds, default 60]
dir=${1:-$PWD}; every=${2:-60}; inbox="$dir/assets-local/inbox"
while :; do
  open=$(python3 -I - "$inbox" <<'EOF'
import json, os, sys
inbox = sys.argv[1]; q = os.path.join(inbox, "queue.jsonl")
try:
    lines = open(q).read().splitlines()
except FileNotFoundError:
    sys.exit(0)
for line in lines:
    try:
        e = json.loads(line)
    except ValueError:
        continue
    if not os.path.exists(os.path.join(inbox, os.path.dirname(e["manifest"]), "intake.json")):
        print(f"{e['queued_at']}  {e['name'][:50]}  {e.get('files', '?')} file(s)  {e['manifest']}")
EOF
)
  if [ -n "$open" ]; then
    printf 'Drive drop(s) awaiting intake (run gm-asset-intake):\n%s\n' "$open"
    exit 0
  fi
  sleep "$every"
done
