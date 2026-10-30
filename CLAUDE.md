# Open Game Maker 2000

Kevin's voice-first game maker. This repo holds research, the scope, prototypes and the skills Game Maker's agents will
use. Work here the way those agents will work: dogfood the skills.

- **Creator requests** (a scene, a screen, a look): follow `gm-design-loop`, with `gm-assets` (packs first, lineups),
  `gm-asset-variants` (clone, never edit originals) and `gm-verify` (look before sending; MP4 for the phone).
- **Self-improvement:** keep the hourly `meta-improve` listener running (it schedules itself; check with `CronList`
  at the start of a session). Lessons persist in skills, scripts and memory; `docs/meta/` is the hourly record.
- **Branch and safety:** commit research to `research` as you go; never commit `assets-local/`, keys, download links or
  serials. Deploy the prototype (`prototypes/studio-v0/tools/deploy.sh`) only when Kevin says so; Netlify credits
  are limited.
