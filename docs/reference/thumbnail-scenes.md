# Thumbnail scenes

**Status: draft.** Owner: ticket #143. Tier C is split out to #156. Items marked "(assumed)" were inferred, not read from a source. Confirm or replace them before the renderer is built.

## 1. Purpose and consumers

An asset pack is hard to judge from a file list. A thumbnail scene is a rendered picture that shows what a pack, a set or a world looks like when it is put to use. There are three tiers:

- **A.** Specimen sheets and still dioramas. Every pack and set gets these.
- **B.** Living dioramas: the still scene, looping. Any pack with animation.
- **C.** Sampler scenes and a style trailer. One per set, built last.

Consumers:

- The creation flow's pack and family picker (OGM-074, #93). It shows the still diorama as the card image, the loop on hover, and a "watch" button for the trailer.
- Pack cards: `collection.card.json` carries `preview.specimen`, `preview.diorama`, `preview.loop`. The set entry in `style-families.json` carries `preview.trailer`.
- The `gm packs` CLI. It prints preview paths and refuses to print private ones outside a local session (assumed).

Agents never need these images to choose assets. They read cards. The images are for Kevin and for players of the creation flow.

## 2. Vocabulary

- **Pack:** one vendor download, one `collection.card.json`.
- **Set:** a group of packs that look right together (C3 section on sets as visual-compatibility groups). Registered in `packages/asset-cards/data/style-families.json`.
- **World:** a slice of a set that shares a setting, for example SmallScaleInt `fantasy`, `modern-zombie`, `creatures`. Set by `describe.world` on each pack (#155).
- **Scene JSON:** the file that fully describes one diorama. Rendering is a pure function of scene JSON plus the asset files.

## 3. Tiers and exact outputs

All paths are under `assets-local/`. Rights decide whether they sit under `previews/` or `private/previews/` (section 7).

### Tier A: specimen sheet

| Item | Value |
|---|---|
| Scope | One per set, one per pack |
| Files | `sets/<set>/specimen.png`, `packs/<pack>/specimen.png` |
| Content | One representative per world, sub-pack or category, picked from cards (section 5) |
| Grid | Fixed cell size, fixed column count, row-major, no gaps beyond one cell margin |
| Cell size | 2D pixel art: 4x the sprite's native cell, capped at 256 px (assumed). 3D: 256 px. |
| Background | One neutral colour, same for every sheet of the set |
| Text | None |
| Format | PNG for pixel art (lossless). WebP q90 for 3D (assumed). |
| Count | Set sheet 8 to 16 cells (assumed). Pack sheet 4 to 12 cells (assumed). |

The set sheet for SmallScaleInt shows a knight, an orc, a demon, a zombie, a survivor, a raptor, a desert tile cluster and an interior tile cluster.

### Tier A: still diorama

| Item | Value |
|---|---|
| Scope | One per world. SmallScaleInt: `fantasy`, `modern-zombie`, `creatures`. |
| Files | `sets/<set>/diorama.<world>.png` (1024x1024), `diorama.<world>@256.png` (256x256) (suffix assumed), `diorama.<world>.scene.json` |
| Content | Ground from the world's tileset, 3 to 6 props, 2 to 3 characters (hero centred, one enemy) |
| Camera | Isometric 2:1 for isometric sets. Fixed per set (section 6). |
| Background | The set's palette colour. No text, no UI. |
| Format | PNG for pixel art, WebP for 3D (assumed) |

The 256 file is a downscale of the 1024 render. For pixel art, render at an integer scale of native size and then resample down with a box filter (assumed).

### Tier B: living diorama

| Item | Value |
|---|---|
| Scope | One per world, for any set with animation |
| Files | `sets/<set>/diorama.<world>.mp4` (1024x1024, H.264), `diorama.<world>.gif` (256x256) |
| Loop length | 4.0 seconds exactly. Seamless: frame N+1 equals frame 0. |
| Frame rate | MP4 30 fps (120 frames). GIF 15 fps (60 frames). Both assumed. |
| Content | Same scene as the still. Characters play idle, walk, attack. Fire and water props loop. |
| Audio | None |
| Pixel format | `yuv420p`, `+faststart` (assumed, for browser playback) |

Every clip in a loop must divide into 4 seconds, or be cropped to a whole number of cycles (section 6.4).

### Tier C: sampler scenes and style trailer

| Item | Value |
|---|---|
| Scope | One per set, after A and B are signed off |
| Files | `sets/<set>/trailer.mp4`, `sets/<set>/clips/<scene>.mp4` |
| Length | Trailer 20 to 30 seconds. Raw clips 3 to 6 seconds each. |
| Count | 4 to 6 clips. SmallScaleInt plans 6: village idle, knight vs orc, desert chest, rural flee, interior ambush, creatures. |
| Source | A playable sampler game built with the game maker's own tools, recorded with `gm shot` and `gm perf` |
| Capture | Native pixel scale x3, 60 fps |
| Cut | Hard cuts. No text. No music. Game SFX only. |
| Reference | `preview.trailer` on the set entry |

Tier C is not rendered by the thumbnail renderer. It is a recording of a real game, so it also finds preprocessing gaps. Those gaps go to `docs/plans/ogm-v1-build/asset-qa/<set>.md`. Spec for the sampler game itself lives in #156.

## 4. Inputs per tier

| Tier | Reads | Writes |
|---|---|---|
| A sheet | Item cards (kind, subkind, `describe.world`, `describe.roles`, `sprite` sheet geometry, `geometry` for 3D), collection cards | `specimen.png`, `preview.specimen` |
| A still | Scene JSON, the sheet index in character cards (frame size, columns, rows, direction order), tile cards (facings), `style-families.json` set traits | `diorama.<world>.png`, `.scene.json`, `preview.diorama` |
| B loop | The same scene JSON, clip lists and fps from cards | `.mp4`, `.gif`, `preview.loop` |
| C | The sampler game, which locks the set | `trailer.mp4`, `clips/`, `preview.trailer` |

What the pipeline needs from the preprocess (#155 for SmallScaleInt):

- **Cards.** One per character, tile piece, animated prop and projectile. Never one per frame.
- **Sheet index.** Frame size, frames per action, direction order, shadow variant. Without it the scene cannot slice a strip.
- **Worlds.** `describe.world` on every pack. A pack with no world is skipped by the diorama step and flagged.
- **Lineups.** `assets-local/sets/<set>/sheets/` holds contact sheets and per-world lineup pages. The scene author uses them to choose pieces. The renderer does not read them.
- **Character-creator layers.** Not used in the first pass (assumed). A layered character may be a hero later; the scene JSON would list layer ids in draw order.

### Coverage rule for specimens

Specimens are picked by code, then reviewed. (assumed, based on the ticket text "automatic coverage from the cards")

1. Group cards of the pack or set by world, then by sub-pack or `subkind`.
2. Take one card per group. Prefer `kind` in the order: character, tile cluster, prop, effect.
3. Within a group, pick the card with the most frames or facings. Break ties by card id sort order, so reruns are stable.
4. Cap at the cell count in section 3. If groups exceed the cap, drop the groups with the fewest cards first.
5. Write the chosen ids into the sheet's sidecar `specimen.json` so the picks are reproducible and overridable by hand (assumed).

### Scene JSON

Lives in `packages/contracts` as a schema (per #143). Required content:

- `set`, `world`, `camera` (preset name), `lighting` (preset name), `background`, `size`.
- `ground`: tileset card id, grid size, which tile ids.
- `props[]` and `characters[]`: card id, grid position, facing, z-order.
- `characters[].clip`: action name for stills (frame index) and for loops (clip name, phase offset).
- `loop`: seconds and fps.

The scene JSON never contains absolute paths or file contents. It refers to cards by id. The card tells the renderer where the files are.

## 5. Vendor art: reuse versus render

Facts are from the Executor survey of 2026-11-02, except the last column, which is the recommended action.

| Vendor | Ships | Tier A | Tiers B and C |
|---|---|---|---|
| Kenney | 918x515 preview images | Reuse. Crop to the specimen cell ratio. CC0, so public. | Render if the pack has animation. Most Kenney packs are static (assumed). |
| KayKit | 1920x1080 sample renders with logos burned in | Reuse after cropping the logo out. If the crop leaves under 512 px of subject, render instead (assumed). | Render from rigged `.glb` characters. See the QA note: the pipeline currently skips `.glb`, so characters have no cards (section 9). |
| Synty | Store tiles only | Render. Store tiles are marketing art with text. | Render for animation packs. |
| LimeZu | Interior room previews | Reuse for interior packs. Render for characters and exteriors. | Render. |
| SmallScaleInt | Nothing usable | Render | Render. Sprite folders are per-frame directional sprites, for example `Raptor Walk_180_025.png`, about 460k PNGs across 26 packs. Use the spritesheet strips from the card sheet index, not the frame folders. |
| Tiny RPG | Nothing usable | Render | Render |
| Quaternius | Nothing usable | Render | Render |

Rules for reused art:

- Reused images are copied or cropped into the same output path as a rendered one, so consumers do not care which it was. The set's `specimen.json` records `source: vendor-crop | rendered` (assumed).
- Never ship a vendor image with a logo, watermark or store text in it.
- A reused image is the vendor's work. It follows the pack's rights, not ours (section 7).
- Reuse covers Tier A only. A still diorama is always rendered, so the style picker looks the same across sets.

## 6. Rendering rules

### 6.1 Renderer

The sheet renderer for 3D already exists in plan: OGM-065's `@ogm/asset-previews`. It uses Playwright, system Chromium and three.js r186, with six views on a neutral grey background. A collection sheet holds at most 48 thumbnails and is written as WebP. Reuse it for 3D specimens.

For 2D, the ticket allows a Python script (`scripts/assets/thumbnail_scene.py`, Pillow plus ffmpeg) or a headless canvas page under `apps/web/tools/` driven by Playwright. Pick one in #143 and say why. Notes for the choice:

- Pillow gives exact nearest-neighbour control and is simple to run in CI (assumed).
- A canvas page reuses the browser stack OGM-065 already needs, and the same page could serve 3D and 2D (assumed).
- Either must run on this host, with no paid service, and take `<set|pack> <scene.json>` and write every output.

### 6.2 3D scenes (KayKit, Synty, Quaternius, Kenney 3D)

All values assumed except where tied to OGM-065.

- Camera: perspective, 35 degree field of view, three-quarter view from 35 degrees elevation and 45 degrees azimuth. Fixed per set. Looks at the scene bounds centre.
- Lighting: one key directional light, one fill, one ambient. Same rig on every scene. No shadows on specimens. Soft shadows on dioramas.
- Background (specimen): neutral grey, as OGM-065.
- Background (diorama): the set's palette colour, flat or a two-stop vertical gradient.
- Unit scale: one tile cell equals one tile card's footprint. Pivot problems from the QA notes (origin at the grip, off-centre footprints) mean placement must snap by bounds, not by origin. This is an open question (section 10).

### 6.3 Isometric pixel art 2D

Values for the still diorama come from #143. Others assumed.

- Projection: isometric 2:1 (two pixels across per one down). One virtual camera for every scene in the set.
- Native render: draw the scene at native pixel size on an integer grid. Never rotate or scale individual sprites.
- Upscale: nearest-neighbour only, by an integer factor. No smoothing. No fractional factors.
- Fit to 1024x1024: choose the largest integer factor that fits, then pad with the background colour. Do not stretch.
- Downscale to 256: box filter from the 1024 image (assumed). Pixel art at 256 is a preview, not a pixel-perfect asset.
- Specimen cells: native size times an integer factor, nearest-neighbour, centred on the cell's baseline. Anchor sprites by foot position, not by image centre.
- Depth sort: by grid row then column, with a `z` override in the scene JSON.
- Background: the set's palette colour. Same on every image of the set.

### 6.4 2D sprite animation framing

- A clip is a strip of frames. The sheet index gives frame size, frame count and direction rows.
- Pick the facing in the scene JSON. Default facing for the hero is the direction nearest to the camera (S or SE for a 2:1 view, assumed).
- Frame timing: read fps from the pack's `.anim` files where present. If missing, use 12 fps and flag the card `fps-assumed` (assumed).
- Loop fit: the loop is 4.0 s. For a clip of N frames at f fps, the cycle is N/f seconds. If 4.0 divided by the cycle is not a whole number, either repeat the clip and cut at 4.0 s with a pause on the last frame, or retime the clip to fit. Prefer the first. Never cut mid-cycle for a walk.
- Phase offsets: stagger characters by a fixed offset so they do not move in lockstep.
- Walking in place: characters in a loop move on a closed path (a circle or a back-and-forth) that returns to the start at 4.0 s, or they play walk in place (assumed).
- Animated props (fire, water): play at their own fps. Their cycle must divide 4.0 s, or be retimed.
- Lighting and shadow: none added. Use "With shadow" sheets where the pack has them, else shadowless.

### 6.5 Determinism

- No random numbers except a seed stored in the scene JSON.
- Same inputs give the same bytes for PNG (assumed). MP4 and GIF may differ across encoder versions. Store the encoder version in a sidecar (assumed).
- A rerun overwrites outputs only if the scene JSON, the card ids or the renderer version changed. A hash of these goes in the sidecar (assumed).

## 7. Rights rules

- Previews of paid or private packs go to `assets-local/private/previews/`. They are never public.
- Previews of public, redistributable packs (for example Kenney CC0) go to `assets-local/previews/`.
- The choice follows the collection's effective `redistribution` right in its card. Preview rights are never wider than the pack's (C3: previews inherit the asset's rights).
- A scene that mixes packs takes the narrowest right of any pack it uses. A diorama of a private pack and a public pack is private.
- Set-level outputs (`sets/<set>/...`) follow the same rule. SmallScaleInt is private (itch terms, private use) so its set outputs go under a private path. The ticket text names `assets-local/sets/smallscaleint/`. The path for private sets is an open question (section 10).
- Nothing under `assets-local/` is committed. The repo commit check rejects files whose hash belongs to a `redistribution: none` asset, including previews and generated variants.
- What is committed: the renderer, the scene schema, the spec, QA notes. PR evidence may attach a few images, only with Kevin's say-so for private sets (assumed).
- Reused vendor art (Kenney, KayKit, LimeZu crops) follows the pack's licence. KayKit and Kenney are CC0 in the survey, which would allow public use. Confirm against each licence row before placing in `previews/` (assumed).
- Private previews never appear in the picker for a public game's audience. The picker checks the game's audience against the preview path.

## 8. Review step

1. Build the SmallScaleInt set first: specimen sheets, three stills, three loops.
2. Kevin reviews. He signs off or asks for changes. Review material: the three stills, one loop, the set specimen sheet. These are attached to the PR (stills and one loop).
3. Fix the scene JSON or the renderer. Re-render.
4. When Kevin signs off, record the sign-off date in the QA file `asset-qa/smallscaleint.md`.
5. Only then fan out to the other sets in this order (assumed): KayKit, Kenney, LimeZu, Synty, Tiny RPG, Quaternius.
6. Tier C (#156) waits for tiers A and B of the same set. Kevin signs off on the SmallScaleInt trailer before any other set gets one.

Automatic checks before review (assumed):

- Every output named in section 3 exists and has the stated size.
- No pixel in a diorama is outside the set's palette plus the background, for pixel art sets with a palette in `style-families.json`.
- No image is blank (centre pixels are not the background colour), as in OGM-065's test.
- The card references resolve to existing files.

## 9. What the KayKit run showed

The KayKit QA notes (`docs/plans/ogm-v1-build/asset-qa/kaykit.md`) say what a real pipeline run produced:

- 23 packs, 4383 `.gltf` models. The current per-model thumbnails are fixed three-quarter, neutral-light renders. Pack lineups are grids of them, not dioramas. They are replaced once #143 settles the scene.
- Rigged characters (64) and every animation clip library ship only as `.glb`. The discovery step skips `.glb`, so characters have no cards, no thumbnails and no rig data. Tier B for KayKit needs this fixed first. 99 of 100 rigged files share one humanoid rig, so any `Rig_*` clip retargets to any character.
- 387 models have a non-standard pivot. Placing by origin misplaces them. Scene placement must snap by bounds.
- Same-name models exist across packs (61 names). Scene JSON refers to full card ids, never bare names.

## 10. Open questions

1. **Renderer choice.** Python plus Pillow, or a Playwright canvas page? Decide in #143 with a one-paragraph reason.
2. **Private set output path.** Is it `assets-local/sets/<set>/` for all sets (as #143 says), or `assets-local/private/sets/<set>/` for private ones? The rights rule suggests the second.
3. **Loop timing.** Is 4.0 s with 30 fps MP4 and 15 fps GIF what Kevin wants? Are the GIF dimensions and size cap right for the picker?
4. **Specimen cap.** How many cells per set and per pack sheet? Numbers here are guesses.
5. **3D camera and light.** Section 6.2 values are guesses. They need a first KayKit render to tune.
6. **Reuse licensing.** Which vendor crops may be public? Needs a per-licence check.
7. **fps missing.** What default fps for sprite clips with no `.anim` file? 12 is a guess.
8. **Character-creator layers.** Should a diorama hero be a composed layered character? Not in the first pass.
9. **Picker contract.** Exact field names in `collection.card.json` (`preview.specimen`, `preview.diorama`, `preview.loop`) are from #143. The schema change belongs to the card tickets; confirm with OGM-074.
