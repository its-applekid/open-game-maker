**Archived (OGM-101).** Replaced by `apps/web`; kept for history and the write-up below.

# UI prototype v0 (throwaway)

Home screen (2D paper-cut layers, wind, music) → editor (Kenney Mini Dungeon + baked Synty goblins) → play mode (sword fight, chest, win/lose) → back to the editor. No build step: plain ES modules, three.js r170 from jsDelivr.

The findings are in [`docs/research/v0.5/C1-ui-prototype-learnings.md`](../../docs/research/v0.5/C1-ui-prototype-learnings.md). This code is not meant to be kept.

## Run locally

```bash
python3 -m http.server 8765 --bind 127.0.0.1      # from the repo root
open http://127.0.0.1:8765/prototypes/ui-v0/site/            # ?editor skips the home screen
```

`site/assets/` is gitignored (licensed Synty files). Rebuild it with `tools/copy-assets.sh` and `tools/bake.mjs` (see the script header).

## Tools

- `tools/bake-goblin.html` + `bake.mjs`: assemble a Sidekick goblin (~33 FBX parts) into one skinned GLB with idle/walk/run/attack/taunt clips, in headless Chromium.
- `tools/e2e.mjs`: drives the whole loop (place goblin, paint and undo a wall, select the chest, play, fight, result, back to edit) and screenshots each step. `--mobile` emulates an iPhone 13, `--home` starts from the home screen, `BASE=` targets a deployed URL. Uses `window.__ogm.tick()` to advance game time deterministically, because headless WebGL runs at about 1–2 fps.
- `tools/perf.mjs`, `weight.mjs`, `shot.mjs`, `view.html`: frame rate, page weight, screenshots, model sanity check.

## Deploy

```bash
netlify deploy --prod --dir site --site "$(cat .netlify-site-id)"
```
