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
- **Self-improvement:** keep the hourly `meta-improve` listener running (it schedules itself; check with `CronList`
  at the start of a session). Lessons persist in skills, scripts and memory; `docs/meta/` is the hourly record.
- **Branch and safety:** commit research to `research` as you go; never commit `assets-local/`, keys, download links or
  serials. Origin is an SSH URL with no key here: push over HTTPS with gh credentials,
  `git -C <repo> -c credential.helper='!gh auth git-credential' push "$(git -C <repo> remote get-url origin | sed 's#git@github.com:#https://github.com/#')" research`
  (one commit at a time if it disconnects). Deploy the prototype (`prototypes/studio-v0/tools/deploy.sh`) only when Kevin says so; Netlify credits
  are limited.
