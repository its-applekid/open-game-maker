# Open Game Maker 2000

Kevin's voice-first game maker. This repo holds research, the scope, prototypes and the skills Game Maker's agents will
use. Work here the way those agents will work: dogfood the skills.

- **Creator requests** (a scene, a screen, a look): follow `gm-design-loop`, with `gm-assets` (packs first, lineups),
  `gm-asset-variants` (clone, never edit originals) and `gm-verify` (look before sending; MP4 for the phone).
- **No needless text** in what you build: a button whose icon is clear gets no label (put the words in `aria-label`),
  and no taglines, captions or helper sentences unless Kevin asks for them.
- **Scripted edits to JS** (python/sed splices): never put a `//` comment inside a replacement unless the line ends
  there; use `/* */` mid-line. A swallowed tail is still valid syntax, so `node --check` won't catch it (it dropped a
  scene's arguments and an iframe's attributes here); render or run the change before moving on.
- **Sprite Forge skills** (`agent-sprite-forge` plugin, project scope in `.claude/settings.json`: generate2dsprite,
  generate2dmap, video2dsprite, generate2dmedia, codeart2d): run their scripts with
  `~/.local/share/ogm/forge-venv/bin/python` (no `python` on PATH). No API key is configured, so `route_media.py` falls
  back to the signed-in Codex CLI; never add a provider key (it counts as consent to spend) and ask Kevin before any
  generation. Never send paid-pack assets to it as references (no cloud processing of paid assets).
- **Self-improvement:** keep the hourly `meta-improve` listener running (a silent background shell, `scripts/listen.sh`
  in the skill, that wakes the agent only after Kevin has written; start it at the start of a session, no cron). Lessons persist in skills, scripts and memory; `docs/meta/` is the hourly record.
- **aiur for this repo:** run it with `aiur-main` (`~/.local/bin/aiur-main`: the aiur checkout's own CLI launcher on a copied
  release at `~/.aiur/ogm-release`, built from `~/github/aiur` main), from this checkout, never `scripts/aiurdev` (it targets
  the aiur checkout's own daemon) and never the npm `aiur` (a different fork). Kevin's NUC daemon for aiur-team/aiur runs on
  this host too (instance 5c1b32aea9): never stop or restart it. The OGM daemon is instance e110d74831 on 127.0.0.1:4010.
  Executor state: `~/.aiur/repo/its-everdred/open-game-maker-2000/executor/handoff.md`.
  Config changes hot-reload: the daemon watches `.aiur/config` and applies it within a second without dropping agent turns
  (back the file up first; use only keys the running build knows; `aiur-main status` shows `CONFIG RELOAD REJECTED` on a
  bad file). Never stop/relaunch the daemon for a config change.
  Review loop (Kevin, 2026-11-01 06:20: "way too many Claude tokens"): the deep review is the worker's own `ce-code-review`
  run before the PR (`.aiur/prompt.md`, AGENTS.md); the Executor's background check is the light brief in
  `docs/plans/ogm-v1-build/review-brief.md` (does the PR do the ticket, scope, evidence, secrets) on `model: haiku`,
  no mutation runs, no gate rebuilds; post reviews as comments (`gh pr review --comment`) because the
  single-identity install makes self-approval impossible; merge with `gh pr merge --merge` after a green `ci / required`
  (`aiur pr merge` fails here: "unexpected tool failure"); wait on checks with `gh pr checks <n> --watch --fail-fast` (this gh 2.46 has no `--json` for checks).
- **Branch and safety:** commit research to `research` as you go; never commit `assets-local/`, keys, download links or
  serials. Origin is an SSH URL with no key here: push over HTTPS with gh credentials,
  `git -C <repo> -c credential.helper='!gh auth git-credential' push "$(git -C <repo> remote get-url origin | sed 's#git@github.com:#https://github.com/#')" research`
  (one commit at a time if it disconnects). Deploy the prototype (`prototypes/studio-v0/tools/deploy.sh`) only when Kevin says so; Netlify credits
  are limited.
