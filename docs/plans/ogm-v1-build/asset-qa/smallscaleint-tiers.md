# SmallScaleInt tiers A+B pilot renders (#143)

Run on the asset-library host, 2026-11-02 01:00-02:30, with the renderer from PR #231 (main @ 366e6a21, ticket #143) over the SmallScaleInt cards rebuilt by PR #235 (direction rows E, SE, S, SW, W, NW, N, NE; one action per sheet with `shadow`/`shadowless` variants; fps 12; catalog 00:57, index 00:58). Source: `assets-local/packs/smallscaleint-*`, outputs under `assets-local/sets/smallscaleint/` and `assets-local/packs/<pack>/specimen.png`. Nothing under `assets-local` is committed; the renders are private (paid packs) and were delivered to Kevin as a private Claude artifact. This file is the record.

**Artifact (private):** https://claude.ai/artifact/4bizFx4nQpzm6cZtQ9gt3F

**Result: rendered, waiting for Kevin's sign-off per tier.** Three worlds (fantasy, desert, modern-zombie): one 1024 still, one 256 still, one 4 s 1024 MP4 and one 256 GIF each; six labelled direction sheets and four pack specimens for tier A. Tier C is out of the pilot by the spec. Two renderer limits shape every scene (see *Findings*); the stills still read as dioramas.

## What was rendered

| Output | Files | Size |
|---|---|---|
| Tier A stills | `diorama.{fantasy,desert,modern-zombie}.1024.png` + `.256.png` | 1024x1024 and 256x256 PNG, 47-73 KB |
| Tier B loops | `diorama.<world>.1024.mp4` (H.264 yuv420p, 24 fps, 96 frames, faststart, 195-260 KB) + `diorama.<world>.256.gif` (70-160 KB) | 4 s each |
| Scene JSON | `diorama.<world>.scene.json` (schema `ogm.thumbnail-scene/1.0`, validated by the renderer) | one per world |
| Direction sheets (QA, labelled) | `specimen-directions.{knight-64,knight-hd,fantasy-enemy-1,stag,footsoldier,ruralzombie-1}.png` | 8 directions x idle/run/attack, frame 0 |
| Pack specimens (spec selector) | `packs/smallscaleint-2d-{character-knight,hd-character-knight,animals-mega-pack-1,hd-enemy-pack-1}/specimen.png` (copies under `sets/smallscaleint/packs/`) | 288x288, one card each |
| Set specimen (spec selector) | `sets/smallscaleint/specimen.png` | 11712x9760, unusable (finding 3) |

Artifact media (scratchpad only): loops re-encoded to 8 s 720p (the 4 s render twice), direction sheets downscaled to 1280 px, stills as rendered; 2.3 MB total.

Scene composition (all three): one ground tile at scale 8 centred one and a half cells in front of the hero, six props and three characters at scale 4, hero at grid `[4,4,0]`, every other layer at `z_order` 10 so the painter's order is by projected anchor. Characters use the `shadow` variant where the card has one; tileset characters and props ship with their shadow baked in, so no scene mixes shadow and shadowless art. Loop fps per layer is `n_frames * k / 4` (11.25 for 15-frame clips, 12 for 16) so each clip completes whole cycles in the 4 s and the loop wraps without a jump (checked on frames 0, 48, 95).

- fantasy: ground J1, small tree B1, boulder A1, chest A1, crate (misc B1), bush (flora A1), fire (16-frame prop); hero HD knight (`smallscaleint-2d-hd-character-knight`, idle S), enemy tileset skeleton `enemy-1` (idle W), companion tileset `player` (idle E; the first render used `npc1`, a small dark figure that read poorly, and was redone).
- desert: desert tileset ground A1, palm B1, rock A1, chest A1, crate, plant, fire; hero `npc3` (idle S; the first render used `player1`, an unclothed base body, and was redone), enemy `enemy-1` (idle W), companion `npc2` (idle E). The desert cards carry `world: fantasy`; the scene's `target.world` is `desert`.
- modern-zombie: rural tileset ground G1, barrel, bench, crate, tyre, grass patch, campfire (15-frame prop); hero `survivor-2` (idle S), enemies `ruralzombie-1` (walk W) and `ruralzombie-3` (walk E, phase 5). Outdoor rural scene rather than the interior room the PR body used.

## Look check

Opened every still at 1024 and the first, middle and last frame of each loop (frames 0, 48, 95, tiled side by side), and each direction sheet.

- Direction labels: on all six sheets E faces right, S faces the viewer, W faces left, N shows the back, and the diagonals go clockwise between them, so the rebuilt row order matches the sprites' facing. The stag's S and N frames are narrow head-on/tail-on views, hard to tell apart at 96 px, which is the art, not the rows.
- No cropped sprites in the stills and loops: every prop, character and the fire sit inside the canvas; the 8x ground diamond touches the left and right canvas edges by design (its tips lose 8 px on the fantasy tile, 0 on the others).
- No shadow/shadowless mixing within a scene (see above).
- World mix: each scene uses only its own tileset's ground, props and enemies plus one hero from a matching-world pack (fantasy: the HD knight on the fantasy tileset; desert: a desert tileset character; modern-zombie: the rural survivor). No creatures or cross-world cards.
- Loops: the knight, skeleton and player cycle their idle; the zombies walk in from both sides; the fire and campfire flicker. Frame 95 is the last frame of each clip and frame 0 restarts it, so the MP4 loops cleanly.
- Pixel density: the ground is at 8x (its 128 px tile fills the canvas), characters and props at 4x. The ground texture reads blocky at 1024 and fine at 256 (the picker size).

## Findings

1. **One ground layer means one tile.** The scene contract allows exactly one `ground` layer and the SmallScaleInt tiles are single 128x64 diamonds (256x256 or 128x256 images). At the characters' scale a tile holds one prop, so a spec-conformant scene is a single tile blown up to 8x with everything standing on it. It works as a vignette, but the 8x ground pixels are twice as coarse as the 4x sprites. Follow-up for the contract: allow a ground mosaic (N ground layers or a repeat count) so the island can be 3x3 tiles at the sprites' scale.
2. **The hero anchor pins the frame bottom, not the feet.** `the hero anchor must project to the canvas centre` is checked on the layer anchor, which the renderer draws at the sprite frame's bottom-centre. SmallScaleInt frames pad 19-40 rows under the feet, so the hero's feet land 76-160 px above centre and the whole scene shifts up. Worked around by centring the ground 1.5 cells in front of the hero; a cleaner contract would anchor the ink bottom (bbox) or allow a scene-level offset.
3. **The spec's specimen selector does not work on this corpus.** `specimen --target-kind set` picked 27 cards by coverage, including `sequences/*` cards whose only file is a whole spritesheet (1920x1024) or a preview sheet; `renderSpecimen` draws such files whole and sizes every cell to the largest, so the set specimen is 11712x9760 px of mostly empty grid with 64 px sprites in 1952 px cells. Pack specimens come out as one card per pack (coverage is `kind/subkind` only) with the alphabetically first action (`180turn`, `attack1`), a mid-turn pose. Follow-up: skip cards without frame metadata, size cells per frame, prefer `idle`, and cover characters per pack rather than one card. The labelled direction sheets in this run were made with a scratch script (`dirsheet.mjs`, sharp) outside the repo for QA; if Kevin wants them as a tier A deliverable they need a home in `apps/web/tools/`.
4. **Playwright screenshot timeouts under fleet load.** Three renders died with `locator.screenshot: Timeout 30000ms exceeded` (host load 65-81 on 12 cores); the renderer stages outputs and leaves the previous files intact, and a plain retry succeeded each time. A render takes 2-10 minutes depending on load; the renderer has no retry of its own. The last re-render chain also sat 90 minutes behind a wait loop of my own that looked for the exit line one line below its marker (it was two); the coordinator released it. Chain scripts should wait on a done-file, not on log positions.
5. **Scene authoring needs card metadata the schema does not expose.** Offsets that put feet on the ground point require each frame's ink bbox (and the tile's diamond centre), which the cards do not carry; the scenes here were generated by a scratch script (`mkscene.mjs`) that measures the PNGs. Worth adding `sprite.pivot`/`ink` to the card schema or an authoring helper to the renderer.
6. The desert tileset's `player1` is an unclothed base body (character-creator style), not a hero; `npc3` was used instead. The fantasy tileset's `npc1` is a small dark figure that reads poorly at 256; see the companion note above.
7. Rural-tileset props (`Object*`, `Flora*`) carry faint alpha (1-15) across the whole frame; invisible in the render but it defeats bbox-by-alpha unless the threshold is raised (64 used).

## Commands

```bash
# worktree of origin/main at 366e6a21, pnpm install --frozen-lockfile, pnpm --filter @ogm/contracts build
cd <worktree>/apps/web
node tools/thumbnail-scene.mjs specimen --root assets-local --cards index/cards.index.json --target-kind pack --target-id <pack-id> --output packs/<pack-id>/specimen.png
GM_VERIFY_SOFTWARE_GL=1 node tools/thumbnail-scene.mjs render --root assets-local --scene sets/smallscaleint/diorama.<world>.scene.json --output sets/smallscaleint/diorama.<world>
```

Scene generator and direction-sheet script: scratchpad `mkscene.mjs`, `scenes.mjs`, `dirsheet.mjs`, `mkmedia.sh` (not committed; copy into the repo if the approach is kept).
