# 3D thumbnail scenes and set showcases

The glTF analogue of [Thumbnail scenes](thumbnail-scenes.md): the same private-library artifact rules, the same
rights gate, and the same media contract, but drawn from 3D cards instead of 2:1 isometric sprite sheets. Keep scene
JSON, frames, stills, and loops under ignored `assets-local/` paths; never attach them to GitHub or copy them into a
game repository.

## Pack scene contract

`packages/contracts/schemas/thumbnail-scene-3d.v1.json` is the emitted schema. A scene names only versioned
asset-card ids; it never embeds a source path or URL. The renderer resolves each id through the selected asset root
and rejects traversal or symlink escapes.

The pilot constants are fixed:

- 1024×1024 canvas; 256×256 derivative; background `#e9e1cc`, ground `#c8c3b8`.
- Three to six cards from the pack, chosen by `kind/subkind` coverage with card id as the deterministic tie-break, so
  input order never changes the scene.
- A square 45° camera that orbits its fixed target once across the loop; each card keeps its own yaw.
- Four seconds at 24 fps: 96 source frames. MP4 uses H.264, `yuv420p`, and fast-start metadata; the GIF is 256 px,
  nearest-neighbour, and loops forever; the still is the frame at time zero.

## Set showcase contract

A set showcase is pre-rendered media only: the style-picker client receives finished files and never runs the scene,
a game engine, or canvas rendering. The hero model walks a closed route through one continuous world, and each
region's companion model sheet is rendered on the same timeline so both tracks share frames.

Every region and sheet track ships as an H.264 `yuv420p` fast-start MP4, a looping GIF, and a poster image, plus a
one-per-second timeline strip and a per-stop poster for each stop. `manifest.json` (`ogm.set-showcase-media/3`) records
the tracks, the stop start times, and the timeline files.

The validator (`check` / `renderShowcase3d`) rejects a plan whose route does not close, whose intervals disagree with
the declared speed, whose `required_packs` are absent from the world and sheets, whose cards repeat within a sheet or
across the world/sheet boundary, whose canvas or media dimensions are not square 1024 px, or whose codec, pixel
format, fast-start atom order, GIF loop, or poster is wrong. Media checks reuse the 2D pilot's
`scripts/assets/showcase/verify.mjs`, so both dimensions are held to one standard.

## Output layout

Keys are relative to the asset-library root. A pack scene renders from `packs/<pack-id>/scene` and a set showcase
from `sets/<set-id>/showcase`:

```text
packs/<pack-id>/scene.scene.json
packs/<pack-id>/scene.1024.png
packs/<pack-id>/scene.256.png
packs/<pack-id>/scene.1024.mp4
packs/<pack-id>/scene.256.gif

sets/<set-id>/showcase.sequence.json
sets/<set-id>/world.json
sets/<set-id>/sheets/<stop-id>.json
sets/<set-id>/manifest.json
sets/<set-id>/showcase.region.1024.mp4
sets/<set-id>/showcase.region.256.gif
sets/<set-id>/showcase.region.poster.png
sets/<set-id>/showcase.sheet.1024.mp4
sets/<set-id>/showcase.sheet.256.gif
sets/<set-id>/showcase.sheet.poster.png
sets/<set-id>/showcase.timeline-000.png
sets/<set-id>/showcase.<stop-id>.region.poster.png
sets/<set-id>/showcase.<stop-id>.sheet.poster.png
```

## Rights and publication

Generated scenes inherit the most restrictive rights of every source card in the composition. If any source is
private or `redistribution:none`, the scene JSON, stills, and loops are written under the library's `private/`
prefix — for example `private/packs/<pack-id>/scene.1024.mp4` — and stay reviewable only on the rights-gated asset
host. Moving the same bytes to a public key would not make them publishable.

## Commands

```bash
node apps/web/tools/thumbnail-scene-3d.mjs scene \
  --root assets-local \
  --pack <pack-id> \
  --output-base packs/<pack-id>/scene

node apps/web/tools/thumbnail-scene-3d.mjs plan \
  --root assets-local \
  --set <set-id> \
  --output-base sets/<set-id>/showcase

node apps/web/tools/thumbnail-scene-3d.mjs showcase \
  --root assets-local \
  --sequence sets/<set-id>/showcase.sequence.json \
  --output-base sets/<set-id>/showcase

node apps/web/tools/thumbnail-scene-3d.mjs check \
  --root assets-local \
  --sequence sets/<set-id>/showcase.sequence.json

node apps/web/tools/thumbnail-scene-3d.mjs batch --root assets-local [--packs <ids>] [--sets <ids>]
```

`batch` renders every pack with three or more models and every set with two multi-card packs, writes the plan first
and the sequence last, collects per-target failures instead of stopping at the first, and exits non-zero when any
target failed. `scene` and `batch` write each artifact under its rights-gated base.

The renderer reuses the Playwright/three.js harness in `apps/web/tools/render-gltf.mjs`: it binds an ephemeral server
to `127.0.0.1`, blocks browser egress, stages every still and video privately, and replaces final outputs only after
both encodes succeed. Rendering needs Chromium and `ffmpeg`; a host without either cannot generate these artifacts,
so run `batch` where both are installed.
