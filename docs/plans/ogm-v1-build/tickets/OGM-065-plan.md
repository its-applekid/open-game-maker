# OGM-065 plan — Local taggers: audio, maps and CLIP on contact sheets

## 1. Problem frame

Agents must choose assets from cards, never by opening files (C2 §10), but no 3D or 2D asset has a card: the only taggers that ran are local (CLAP for audio, CLIP for maps) and the vision pass the standard assumed costs money nobody approved (E05-3). The two Python pipelines are tested and tied to heavy local models, so they stay as workers (E05-13). This ticket wires them behind `gm packs tag` through one JSON-lines contract and adds the missing third worker: a headless contact-sheet renderer plus CLIP lift-ranking that writes `measured|tagged` cards for models and sprites with honest confidence.

Requirements trace: R52 → 3D/2D cards from code measurement (OGM-064), filename seeds and local CLIP lift-ranking on contact sheets, no paid pass; audio and map cards keep their Python taggers. R86 → intake, tagging and previews run on this machine with `nice` and bounded workers.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for the renderer on the GPU flags `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with a `GM_VERIFY_SOFTWARE_GL=1` fallback (`--use-angle=swiftshader`); no service here; no secrets; dependencies: `playwright` (pinned to the version OGM-090 uses, or 1.64.1 from `prototypes/ui-v0/tools/package.json` if first), `three` r186 (OGM-023's pin), `sharp`; Python deps are already in the audio venv (torch, transformers, Pillow); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/maps/tag_maps.py`: `MAP_TYPES`/`ENVIRONMENTS` prompt dictionaries, the "title and folder words first, CLIP only when they say nothing" rule, lift-ranking against the library, `.part` then rename writes, `argparse` with `analyse|cards`, JSON progress lines (459–475).
- `/home/orangekid/games/open-game-maker-2000/scripts/audio/build_audio_cards.py` `pick()` (lift ≥ threshold, best first) and `OPPOSED` moods; `test_build_audio_cards.py`: one test per promise the cards make.
- `/home/orangekid/games/open-game-maker-2000/scripts/audio/analyze.py` `--workers`, `Pool`, `PRIVATE_VENDORS` → `private/` previews.
- `/home/orangekid/games/open-game-maker-2000/prototypes/title-city/tools/capture.mjs` (flags, `__ready` wait) and `prototypes/title-city/tools/creatures.html` (lineup grid, labels): the sheet page's shape.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C3-asset-metadata-standard.md` §4 (vocabularies), §6 (who writes what; confidence rules; locks), §13 steps 6–8.
- OGM-060's `packages/gm-cli/src/commands/assets/search.ts` and OGM-064's `packs/import.ts` (at pickup): command shape, validator call, `ctx.emit`.

## 3. Implementation units

### U1. `--json` on the three Python workers

Goal: every worker speaks the T05 §4 line contract without changing what it measures or writes.

Files: Modify `scripts/py/audio/analyze.py`, `scripts/py/audio/build_audio_cards.py`, `scripts/py/maps/tag_maps.py` (paths `scripts/audio/...`, `scripts/maps/...` if OGM-009 has not merged); Test `scripts/py/audio/test_build_audio_cards.py`, `scripts/py/maps/test_tag_maps.py` (add cases), `scripts/py/audio/test_analyze.py`.

Approach: add `--json` to each `argparse`; when set, every per-card write prints `json.dumps({"card": rel_path, "status": card["status"], "flags": card.get("flags", [])})` to stdout with `flush=True`, and all other prints go to `sys.stderr`; `analyze.py` has no cards, so its lines are `{"file": …, "status": "analysed"}` and `gm` treats them as progress; validation failures exit 1 after printing `{"card": …, "status": "invalid", "errors": [...]}`. Extract the line writer into a `emit_card(card_path, card)` helper per script so tests call it directly.

Interface sketch (CLI): `<venv>/bin/python -I scripts/py/audio/analyze.py --json [--workers N] [--only GLOB] [--limit N]`; `… build_audio_cards.py --json [--packs DIR]`; `… tag_maps.py analyse|cards --json [--workers N] [--limit N]`.

Test scenarios:
- Given `emit_card` with a tagged card, when called, then stdout has one line parsing to the three keys.
- Given `--json`, when the summary prints, then it goes to stderr (capture both).
- Given a card that fails validation, then exit 1 and an `invalid` line.

Execution note: characterization first: run `pytest scripts/py/audio scripts/py/maps -p no:cacheprovider` before touching anything and paste the 40-pass line.

### U2. `@ogm/asset-previews`

Goal: deterministic contact sheets for GLBs, collections and sprite sheets.

Files: Create `packages/asset-previews/{package.json,tsconfig.json,src/index.ts,src/browser.ts,src/sheet.ts,src/collection.ts,src/sprite.ts,page/index.html,page/sheet.ts,vite.config.ts or esbuild.mjs}`; Test `test/sheet.test.ts`, `test/keys.test.ts`, fixtures reuse `packages/asset-measure/test/fixtures/*.glb` and a Tiny Dungeon PNG.

Approach: `browser.ts`: one shared `chromium.launch({ executablePath: '/usr/bin/chromium', args: GPU_FLAGS })` where `GPU_FLAGS = process.env.GM_VERIFY_SOFTWARE_GL ? ['--use-angle=swiftshader'] : ['--use-angle=gl-egl','--enable-gpu','--ignore-gpu-blocklist']`, plus `--headless=new`; a semaphore of 2 contexts; log `renderer` from `WEBGL_debug_renderer_info` once. `page/sheet.ts`: three.js r186 scene, `GLTFLoader` (+ `MeshoptDecoder` for compressed inputs), neutral `#9a9a9a` background, three-point light, fit camera to bounding sphere, render the six views into one canvas (3×2 cells of `size` px, default 384) with a label strip (asset id path segment, bounds, tris); expose `window.__ready` and `window.__render(url, opts) → dataURL`. `sheet.ts`: serve the page from the package `dist` with `page.route`, call `__render`, decode the data URL, `sharp(...).webp({ quality: 80 })`, write to `<previewsRoot>/<sha2>/<sha16>-sheet.webp` where `sha` is the GLB's content hash and `previewsRoot` is `assets-local/previews` or `assets-local/private/previews` by the collection's `redistribution`; return the bucket key. `collection.ts`: grid of up to 48 thumbs with ids via `sharp` composite (no browser). `sprite.ts`: nearest-neighbour upscale for `pixel_art`.

Interface sketch: as quoted in the ticket.

Test scenarios:
- Given the orc GLB with `GM_PREVIEWS_BROWSER=1`, when rendered, then a WebP exists, is 3:2, and the centre pixel of the front cell differs from the background grey.
- Given `GM_VERIFY_SOFTWARE_GL=1`, then it still renders and the logged renderer contains `SwiftShader`.
- Given a `redistribution: 'none'` collection, when keyed, then the path starts with `private/previews/`.
- Given 50 thumbs, when a collection sheet is built, then two sheets of 48 and 2.

### U3. `scripts/py/tag/tag_sheets.py`

Goal: CLIP lift-ranked `describe` fields for model and sprite cards from their sheets, with confidence.

Files: Create `scripts/py/tag/tag_sheets.py`, `scripts/py/tag/test_tag_sheets.py`, `scripts/py/tag/README.md` (one paragraph: uses the audio venv, no new deps).

Approach: input: `--cards <glob or list file>` of card paths whose `previews.sheet` exists; load CLIP ViT-L/14 from the local HF cache (`HF_HUB_OFFLINE=1`); for each vocabulary group build prompts (`"a low-poly 3D model of a {object} in a {environment}"` style templates per group, taken from C3 §4 enums; `moods` only for `vfx`); batch-encode sheets; compute per-label softmax across the group, then lift = p(label | card) / mean p(label) over the run (minimum 20 cards per run or fall back to the collection), keep labels with lift ≥ 1.5 (max per group from C3: environments 4, settings 2, roles 4, materials 3, condition 1); `objects` = filename nouns through a small synonym map (never CLIP); `description` = one template sentence from kind, objects, top environment and setting; confidence per group = top lift normalised to 0–1 (cap 0.9, since zero-shot); `< 0.6` → `low-confidence`; agreement with measured facts (e.g. `roles` `floor` only when `geometry.bounds_m[1] < 0.3`) else `conflicts-with-measured`; write `describe` with `provenance.describe = {by: 'model', model: 'openai/clip-vit-large-patch14', tool: 'tag_sheets@0.1', at, confidence, input: 'contact sheet + measured facts + filename'}`; keep locked fields; status `tagged` when description, objects and roles non-empty, else `measured`; never touch `rights`, `license`, `source`; `.part` then rename; `--json` lines per card; `--workers` for encoding batches; `--limit`.

Interface sketch (CLI): `scripts/py/audio/.venv/bin/python -I scripts/py/tag/tag_sheets.py --cards 'assets-local/packs/kenney-mini-dungeon/cards/**/*.card.json' --json [--workers 2] [--limit 50]`.

Test scenarios (pure functions, no model):
- Given probabilities and means, when `pick_lift` runs, then only labels ≥ 1.5 lift return, best first, capped per group.
- Given a card with description, objects and roles, when `status_for` runs, then `tagged`; missing roles → `measured`.
- Given top lift 0.5, then `low-confidence` in flags.
- Given a locked `describe.pov_fit`, when the writer merges, then it is unchanged.
- Given any output card, then `rights`, `license` and `source` equal the input's (deep-equal test).

### U4. `gm packs tag`

Goal: one command that renders, runs the right worker, validates and reports.

Files: Create `packages/gm-cli/src/commands/packs/tag.ts`, `src/packs/workers.ts`; Test `test/packs-tag.test.ts` (stub workers via `GM_TAG_WORKER_STUB`).

Approach: resolve `venvPython` (`scripts/py/audio/.venv/bin/python` → fallback `scripts/audio/.venv/bin/python`; exit 2 naming the path if neither exists); gate: load the index, for each targeted collection check `resolved.rights.uses ∋ 'vision-input'` else skip with `{"collection", "skipped": "no vision-input"}`; `--kind model|sprite`: for cards without `previews.sheet`, call `@ogm/asset-previews` (2 at a time), update `previews.sheet` on the card, then spawn `tag_sheets.py`; `--kind audio`: `analyze.py` then `build_audio_cards.py`; `--kind map`: `tag_maps.py analyse` then `cards`; spawn with `execFile('nice', ['-n','10', venvPython, '-I', script, '--json', ...])` and `env: { PATH, HOME, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', OGM_ASSETS_ROOT }`; `--workers` clamped to `max(1, floor(os.cpus().length / 3))` (4 on this 12-core host) with the clamp printed; parse lines, validate each written card with `@ogm/contracts` (`validateCard` + `no-model-rights`), on failure exit 1 naming the card; after the run update each collection card's `counts` by status; print `kind  cards  tagged  measured  low-confidence  skipped`; emit `packs.tag`.

Interface sketch (CLI): `gm packs tag --kind audio|map|model|sprite [--only <glob>] [--workers N] [--limit N] [--json]`.

Test scenarios:
- Given a collection with `vision-input` absent, when tagging, then it is skipped and reported, exit 0 if others ran, exit 2 if nothing could run.
- Given the stub worker prints an `invalid` line, then exit 1 names the card.
- Given `--workers 32`, then the spawn args contain the clamped value.
- Given a successful stub run, then the collection card's `counts` change and one `packs.tag` event is emitted.

## 4. Verification

```
scripts/py/audio/.venv/bin/python -m pytest scripts/py/audio scripts/py/maps scripts/py/tag -p no:cacheprovider -q
pnpm --filter @ogm/asset-previews test
GM_PREVIEWS_BROWSER=1 pnpm --filter @ogm/asset-previews test
GM_PREVIEWS_BROWSER=1 GM_VERIFY_SOFTWARE_GL=1 pnpm --filter @ogm/asset-previews test
pnpm --filter @ogm/gm-cli test -- tag
pnpm -r typecheck && pnpm -r lint
OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local node packages/gm-cli/dist/index.js packs tag --kind model --only 'kenney-mini-dungeon' --json | tail -5
OGM_ASSETS_ROOT=... node packages/gm-cli/dist/index.js assets search orc --kind model/character
```

Paste into `## Local tests`: the pytest count (40 + new), the two renderer runs with their renderer strings (ANGLE Intel, SwiftShader), the Mini Dungeon summary row, one sheet attached as an image, the orc search row showing `tagged`, and the 30-card calibration sheet for Kevin.

## 5. Deferred to implementation

- Sheet cell size 384 px and six views (default); `close` view = framed on the top third of the bounds.
- Lift threshold 1.5 and per-group caps (default from C3 §4 maxima); adjust only with the calibration sheet as evidence.
- Prompt templates per kind (model vs sprite); start with two templates each.
- Whether `settings` for sprites comes from the collection card only (`by: collection`) rather than CLIP: default inherit, CLIP only for `environments`, `roles`, `materials`, `condition`.
- Venv: reuse the audio venv (default, no install) vs a `scripts/py/tag/.venv`; the former needs no network.

## 6. Scope boundaries

- Measuring, unpack, intake service: OGM-064. Index and search defaults: OGM-060. Blob-store import of previews: OGM-067.
- Layout-spec extraction: deferred (vision model); `gm maps search`: OGM-067.
- Verify capture engine, `gm run|shot|perf`: OGM-090.
- Audio and map label sets and thresholds: unchanged.
- Paid or hosted models: never in V1 (R14).

## 7. Risks

- CLIP zero-shot on contact sheets may be poor for `roles` (T05 §6 risk 2): the calibration sheet decides; default ships with `low-confidence` on anything under 0.6 and search ranks it lower (OGM-060 tie-break).
- GPU access in headless Chromium can regress with driver updates: the SwiftShader fallback is tested every run; sheets at 1–2 fps are still fine for stills.
- Model weights must be in the local HF cache (they are, from the map and audio runs): `HF_HUB_OFFLINE=1` makes a missing cache fail loudly rather than download.
- Memory: CLIP ViT-L/14 on CPU ≈ 2 GB per process; `--workers` clamp and one model per process keep it under the agents slice's `MemoryMax=16G`.
- The 19 FBX-only Synty packs stay untagged (E05-5); accepted.
