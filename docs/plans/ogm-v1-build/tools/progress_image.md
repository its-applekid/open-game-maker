# Feature progress image

Kevin's view of the build (2026-11-01): product features, not lanes, each with merged/total tickets. Source is the
`feature:*` label on each ticket (the aiur feature membership), done = issue closed or `agent:done`. Render with
`~/.local/share/ogm/forge-venv/bin/python ~/.aiur/repo/its-everdred/open-game-maker-2000/executor/progress.py features.txt out.png`
where `features.txt` comes from `gh issue list --state all --limit 300 --json number,state,labels` (one line per ticket:
number, state, feature labels joined with `+`, `done` if labelled). Asked twice (16:00, 18:38); a third ask moves the
script into `scripts/`.
