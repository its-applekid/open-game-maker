# T12 repo-code-map: evidence packet

Researched commit `9508c1c` (HEAD at research time `6fa2c0a`, which adds only `docs/plans/ogm-v1-build/*`; no code differs). Working tree had untracked `.aiur/`, `.netlify/`, `prototypes/ui-v0/tools/.netlify/`, `prototypes/ui-v0/tools/_pf.mjs`. Line counts are `wc -l` on git-tracked files [M].

## 1. Scope of this track

A file-level map of every code and structured-data file in the repo (prototypes, scripts, skills, schemas, reference docs, CI, package manifests, ignore rules), each with purpose, state, tests and the V1 component it feeds.
A proposed pnpm/TypeScript monorepo layout with Python kept only where it already works, naming which existing files move where.
A table of hot write surfaces so the build graph can partition ownership (aiur-build: "one module per page/section mounted by a shared shell beats many tickets composing one file").

## 2. Evidence packets

### E12-1: The repository contains no TypeScript, no root package.json, no workspace and no CI
- Claim / current behavior: 502 tracked files. Zero `.ts`/`.tsx` files. No `/.github/` directory. No root `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json` or lockfile at the root. The only two `package.json` files are tool-local: `prototypes/ui-v0/tools/package.json` (esbuild 0.25.0, playwright ^1.64.1, commonjs, `"test": exit 1`) and `docs/research/v0.5/schemas/tools/package.json` (ajv ^8.20.0, ajv-formats ^3.0.1, `"test": exit 1`).
- Source and exact locus: `git ls-files` at `/home/orangekid/games/open-game-maker-2000`; `ls .github` → no such directory.
- Why it matters: every V1 ticket that writes TS code depends on a scaffold that does not exist. The scaffold is wave 0 and the single largest fan-out spine.
- Confidence and freshness: [M] as of 6fa2c0a.
- Contradiction or open question: `.aiur/config` (untracked, written during this session) sets `merge_policy.ci: wait` (the only mode, per aiur `website/docs-app/reference/merge-policy.md` line 8: "requires full CI before merge") and `full_ci_paths: [".github/workflows/**", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]`. None of those paths exist, so the merge policy references a CI that is not there.
- Suggested requirement/decision impact: ticket 1 (monorepo scaffold + CI workflow) must merge before any other code ticket; `full_ci_paths` already names the pnpm layout, so adopt pnpm.

### E12-2: Three prototypes, 8,052 lines of plain ES-module JS, all declared throwaway
- Claim / current behavior: `prototypes/studio-v0` 19 files / 3,019 text lines; `prototypes/ui-v0` 32 files / 1,875 lines (plus 484-line package-lock); `prototypes/title-city` 26 files / 3,158 lines. No build step for the app code (three.js r170 via import map or jsDelivr); esbuild is used only by `title-city/tools/bundle.mjs` to make one minified `city.bundle.js`. Each README says "(throwaway)"; C1 §source: "The write-up is the deliverable, not the code."
- Source and exact locus: `prototypes/studio-v0/README.md:1`, `prototypes/ui-v0/README.md:1,5`, `docs/research/v0.5/C1-ui-prototype-learnings.md:3`.
- Why it matters: nothing in `prototypes/` is a production candidate as code; the reusable parts are the contracts they proved (test hooks, iframe messages, capture flags) and the title town as a built asset.
- Confidence and freshness: [M]/[V] as of 6fa2c0a.
- Contradiction or open question: the live site ogm2000.netlify.app is `studio-v0` (deploy.sh, site id `b29de31d-…` shared with ui-v0), and the planning pack says the title town stays. So `title-city` is throwaway code but not a throwaway artifact.
- Suggested requirement/decision impact: keep `title-city` as a bundled asset inside the new web app (ticket 4); archive `studio-v0`/`ui-v0` once `apps/web` deploys.

### E12-3: The prototypes' test hooks are the de-facto engine–verify contract
- Claim / current behavior: ui-v0 exposes `window.__ogm = { tick, zoom, tileToScreen, map, startPlay, stopPlay, mode, attack, use, aim, player, foes }`; title-city exposes `window.__ready`, `__frame(t)`, `__tap(x,y)`, `__sounds`, `__terrainBake`, `__treesBake`, `__modelsBake`, `__pick`, `__look`, `__scene`, `__marks`; studio exposes `window.__title.step(n, dt)`. URL flags `?capture`, `?poster`, `?nobake`, `?embed`, `?cam=`, `?scene=`, `?var=`, `?shell`, `?editor`, `?play`.
- Source and exact locus: `prototypes/ui-v0/site/js/dungeon.js:865`; `prototypes/title-city/city.js:7,16,277,369,636,916,933,943,958`; `prototypes/studio-v0/title-3d.js:422`, `title-c.js:196`; `prototypes/ui-v0/site/js/main.js:6-12`.
- Why it matters: T04's `tick(seconds)` / `render_game_to_text` / `advanceTime` and T10's `gm verify` are the formalisation of these; the capture tools already assume `__ready` then `__frame(t)`.
- Confidence and freshness: [V] as of 6fa2c0a.
- Contradiction or open question: ui-v0 uses `tick` (game time) while title-city uses `__frame(t)` (absolute loop time); the SDK should pick one (relative `tick(seconds)` per B7) and verify tools should drive only that.
- Suggested requirement/decision impact: `packages/contracts` owns the hook names; `packages/verify` consumes them; nothing else may define `window.__*`.

### E12-4: The parent↔iframe message protocol exists in two incompatible dialects
- Claim / current behavior: studio→game iframe posts `{ogm:'play'|'edit'}`; game→parent posts `{ogm:'start'}` (`main.js:53,70-72`). studio→town iframe posts `{tap:[x,y]}` plus string `'pause'`/`'resume'`; town→parent posts string `'town-ready'` and `{sfx:[s,v,r]}`, `{loop:[s,g]}` (`city.js:8,895,914`; `title-town.js:28-31`). All use `'*'` as target origin.
- Source and exact locus: as above; `prototypes/studio-v0/app.js:256,259`; `prototypes/studio-v0/index.html:621` (`<iframe id="gameFrame" allow="autoplay; fullscreen">`).
- Why it matters: T04 (game iframe host contract) and T09 (editor host) need one typed envelope with an origin check; the prototype proves the shape but not the security.
- Confidence and freshness: [V] as of 6fa2c0a.
- Contradiction or open question: strings vs objects; no origin validation; no version field.
- Suggested requirement/decision impact: contracts package defines `HostMessage`/`GameMessage` discriminated unions; the title town adapter translates its legacy strings.

### E12-5: scripts/ holds 4,874 lines of Python in four tool groups, 67 tests, all passing
- Claim / current behavior: `scripts/assets` (12 .py, 802 lines + `data/collection_tags.jsonl` 278 lines, no tests); `scripts/audio` (5 .py modules 1,239 lines + 4 test files 338 lines, 35 pytest tests); `scripts/drive-sync` (`drive_sync.py` 932 lines, `test_drive_sync.py` 486 lines, 27 unittest tests, plus systemd unit, example TOML, README); `scripts/maps` (3 .py 570 lines, `test_tag_maps.py` 41 lines, 5 tests). Ran here: `pytest scripts/audio scripts/maps` → 40 passed in 38.95 s (audio venv, Python 3.13.5); `python3 -I test_drive_sync.py` → 27 OK in 0.46 s (stdlib only).
- Source and exact locus: `/home/orangekid/games/open-game-maker-2000/scripts/*`; `.pytest_cache/v/cache/nodeids` lists the same 40 pytest ids.
- Why it matters: these are the only tested code in the repo and the only production candidates; they are T05's Python workers.
- Confidence and freshness: [M] as of 6fa2c0a (tests run 2026-10-31 with `-p no:cacheprovider`, no files written).
- Contradiction or open question: `scripts/assets/*.py` have no tests and several hard-code paths (`import_kenney_bundle.py:5-6`, `import_synty.py:5-6` use `Path.home()/"games/open-game-maker-2000"`; `TODAY = "2026-10-26"` literal in `import_kenney_bundle.py:7`).
- Suggested requirement/decision impact: keep audio, maps, drive-sync as Python workers unchanged; port `build_catalog.py` and `build_collection_cards.py` to TS inside the assets library; keep fetchers as Python until `gm packs fetch` exists.

### E12-6: Python dependencies are heavy, machine-pinned and split across three venvs
- Claim / current behavior: `scripts/audio/requirements.txt` pins torch 2.14.1, torchaudio, essentia-tensorflow (AGPL, local tool), transformers 4.57.6 (CLAP), beat_this (git), librosa, pymusiclooper; venv at `scripts/audio/.venv` (gitignored). `scripts/drive-sync/requirements.txt` pins google-auth + requests; venv `scripts/drive-sync/.venv`. Sprite Forge venv at `~/.local/share/ogm/forge-venv`. `scripts/maps/tag_maps.py` and `scripts/assets/pack_thumbnails.py`, `sprite_libraries.py`, `prototypes/studio-v0/tools/build.sh:7` and `prototypes/title-city/tools/poster.mjs:14` all borrow the audio venv's interpreter.
- Source and exact locus: the two requirements files; usage lines in each script's docstring.
- Why it matters: CI and the sandbox (T03) cannot `pip install` torch on every run; the workers must run as host services with pre-built venvs, not inside per-job sandboxes.
- Confidence and freshness: [M]/[V] as of 6fa2c0a.
- Contradiction or open question: the audio venv doubles as a general Pillow/numpy interpreter for unrelated tools (a hidden coupling).
- Suggested requirement/decision impact: one documented `scripts/py/` convention (per-tool `requirements.txt`, venv path, `make test`), and CI runs only drive-sync (stdlib tests) plus maps/audio tests that do not need models (T05/T11 to confirm which).

### E12-7: The asset-card and map-layout schemas plus validator are production-grade data and pass today
- Claim / current behavior: `asset-card.schema.json` 700 lines, `map-layout-spec.schema.json` 214 lines (draft 2020-12, strict), 16 examples (2,067 lines), 4 negative cases (328 lines), `tools/validate.mjs` 111 lines (ajv + code checks the schema cannot express: rights basis→effective, model-writes allowlist, no-model-rights, map-not-in-game, layout graph metrics), `tools/test-negative.sh` 8 lines. Ran: all examples pass; all 4 negatives rejected.
- Source and exact locus: `docs/research/v0.5/schemas/*`, `tools/validate.mjs:30-57` (rights engine), `:85-108` (graph metrics).
- Why it matters: this is the only existing implementation of the usage-rights policy (C3 §rights) and it lives under `docs/`. Three tracks (T05 search/build/publish enforcement, T01 policy, T10 skills) need it as a library, not a script.
- Confidence and freshness: [M] as of 6fa2c0a.
- Contradiction or open question: the audio importer and `build_audio_cards.py` shell out to this validator (`subprocess` in `build_audio_cards.py`, `test_import.py::test_draft_collection_card_validates`), so moving it changes a Python→Node path.
- Suggested requirement/decision impact: move schemas + examples + negatives to `packages/contracts/schemas/`, port `validate.mjs` to TS with the examples/negatives as its test fixtures, keep a thin `validate.mjs` shim at the old path (or update the two Python callers) in the same ticket.

### E12-8: Six gm-* skills exist (295 lines) and reference prototype tool paths directly
- Claim / current behavior: `.claude/skills/{gm-asset-intake,gm-assets,gm-asset-variants,gm-design-loop,gm-pack-scout,gm-verify}/SKILL.md`, 26–73 lines each. They cite `scripts/assets/*.py`, `scripts/drive-sync/drive_sync.py status`, `prototypes/title-city/tools/{capture,taptest,loadtime,mix_sound,variants,bake}.mjs`, `tools/clips_page.py`, `prototypes/title-city/tools/{creatures,lineup,pixelfx-gallery}.html`, `prototypes/studio-v0/tools/loadrec.mjs`.
- Source and exact locus: grep of `scripts/|prototypes/|tools/` across the six files (e.g. `gm-verify/SKILL.md:17,23,36-47`; `gm-assets/SKILL.md:17,22,33,35,40,48,51,60,68`).
- Why it matters: skills are V1 deliverables installed into creator repos (T10); every prototype path they name becomes a dangling reference when prototypes are archived. `.claude/settings.json` (17 lines) enables the `agent-sprite-forge` marketplace plugin, which is Claude-Code-specific.
- Confidence and freshness: [V] as of 6fa2c0a.
- Contradiction or open question: skills are written for Claude in this repo (Kevin-specific wording: "ask Kevin", `assets-local/`), not for a coding agent inside a creator's game repo.
- Suggested requirement/decision impact: move to `skills/gm-*/SKILL.md` at the root, keep `.claude/skills` as symlinks for dogfooding, and rewrite tool references to `gm` commands as T05/T10 land them.

### E12-9: Headless capture is one pattern repeated in 13 scripts, two GPU modes
- Claim / current behavior: title-city tools (`capture.mjs` 41, `bake.mjs` 22, `poster.mjs` 39, `taptest.mjs` 27, `loadtime.mjs` 21, `mix_sound.mjs` 27, `variants.mjs` 87, `bundle.mjs` 14) and `studio-v0/tools/loadrec.mjs` (16) all `createRequire('…/ui-v0/tools/')` to borrow the single `node_modules` and launch Chromium with `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` (real GPU). ui-v0 tools (`e2e.mjs` 67, `shot.mjs` 14, `perf.mjs` 13, `weight.mjs` 12, `bake.mjs` 20) use `--use-angle=swiftshader` (software). `capture.mjs record` encodes H.264 via ffmpeg; `loadtime.mjs` and `loadrec.mjs` emulate iPhone 13 with CPU ×4 throttle.
- Source and exact locus: each file's first 15 lines; `loadrec.mjs:5` hard-codes the absolute repo path.
- Why it matters: T10's `gm verify` and T04's test harness are a port of exactly this; the GPU flag choice decides whether verify can run inside T03's sandbox.
- Confidence and freshness: [V] as of 6fa2c0a; `which chromium` → `/usr/bin/chromium`, `ffmpeg` present, `playwright` not on PATH (only in `ui-v0/tools/node_modules`).
- Contradiction or open question: `gm-verify/SKILL.md` says "headless Chromium on the GPU"; ui-v0's e2e notes headless WebGL at 1–2 fps on swiftshader. Sandboxed GPU access is a T03 question.
- Suggested requirement/decision impact: one `packages/verify` with `stills|timeline|record|loadtime|taptest` subcommands and a `--gpu auto|egl|swiftshader` switch; delete the per-prototype copies when it lands.

### E12-10: pixelfx is vendored at a pin: 268 files, 41,772 lines, 234 effects, MIT, no tests
- Claim / current behavior: `third_party/pixelfx/{LICENSE,NOTICE.md,PIN,src/**}`; PIN = commit `fe7103c` of github.com/patch-gg/pixelfx, reviewed 2026-10-30 "src/ only; runtime is plain ES modules, no dependencies, no network". Used by `prototypes/title-city/earthbound.js:13-23` and `fx-variants/burning.js` (a cloned variant, per gm-asset-variants). A plan exists to expose it through `gm fx` (`docs/plans/2026-10-30-001-feat-pixelfx-agent-cli-plan.md`, status proposed).
- Source and exact locus: as named; `third_party/pixelfx/src/core/index.js` is the only import surface.
- Why it matters: it is the only vendored runtime library; it belongs in the open-source engine repo (SDK) as a tier-2 effect source, not in the private instance.
- Confidence and freshness: [M]/[V] as of 6fa2c0a.
- Contradiction or open question: the Patch Pixel font in upstream `gallery/fonts` is excluded (NOTICE); the vendored tree has no `gallery/`, so the exclusion holds.
- Suggested requirement/decision impact: keep the path; add a `packages/sdk` dependency on it via a workspace alias rather than copying; no port.

### E12-11: Two Claude agent worktrees live inside the repo tree and duplicate every file
- Claim / current behavior: `git worktree list` shows `.claude/worktrees/agent-a049c4ea377020ec7` (branch `worktree-agent-a049c4ea377020ec7`, dc3d0d5) and `.claude/worktrees/agent-a30aaa8d55d9c7968` (d58d3fd). A naive `find`/`wc` over `.claude` returns ~196 KB of duplicate listings; each worktree has its own `package.json` copies.
- Source and exact locus: `/home/orangekid/games/open-game-maker-2000/.claude/worktrees/*`.
- Why it matters: coding agents, graders and CI globs (`**/package.json`) that walk the tree will double-count or lint stale copies.
- Confidence and freshness: [M] as of 6fa2c0a.
- Contradiction or open question: none; housekeeping, not a code defect.
- Suggested requirement/decision impact: CI and tooling ignore `.claude/worktrees/**`; T11's host notes should include pruning stale worktrees (not done here: no git mutations).

### E12-12: The deploy path is a shell script that assembles a temp dir and calls the Netlify CLI
- Claim / current behavior: `prototypes/studio-v0/tools/build.sh` (104 lines) copies Kenney sprites from `assets-local/packs`, converts GLBs to glTF JSON (`glb2json.py`), copies ui-v0 into `demo/` and title-city into `town/`; `deploy.sh` (12 lines) wraps `index.html` in a skeleton, stamps `sw.js` `__BUILD__`, writes `_headers` (noindex, cache rules), strips `art/packs/synty-*`, then `netlify deploy --prod --no-build --dir … --site $(cat .netlify-site-id)`. `.netlify/netlify.toml` (untracked) has `publish = <repo root>` and `X-Robots-Tag: noindex`.
- Source and exact locus: as named; `sw.js` 21 lines (per-deploy cache + persistent asset cache).
- Why it matters: assumption A14 says the 5:30 deploy uses this script unless `apps/web` exists; the Synty-stripping rule and the noindex header are licensing/privacy behaviours that must survive into the new pipeline.
- Confidence and freshness: [V] as of 6fa2c0a; `netlify` CLI at `~/.nvm/versions/node/v24.14.0/bin/netlify`.
- Contradiction or open question: no CI deploy; manual only ("deploy only when Kevin says so", CLAUDE.md) versus memory note "auto merge + deploy after each request".
- Suggested requirement/decision impact: ticket 8 reproduces `_headers`, the Synty exclusion and the SW build stamp as part of `apps/web` build; deploy remains a CLI step invoked by the Executor, not a GitHub Action (Netlify credits).

### E12-13: `.gitignore` is eight lines and correctly keeps every licensed byte out of git
- Claim / current behavior: ignores `assets-local/`, `prototypes/*/site/assets/`, `prototypes/*/.netlify/`, two venvs, `__pycache__/`, `schemas/tools/node_modules/`; per-prototype `.gitignore`s add `vendor/`, `models/`, `art/`, `demo/`, `town/`, `node_modules/`, `.venv-fetch/`. Git-tracked media under prototypes is only 9 small icon PNG/WebP/ICO files; 868 GLB, 296 MP3, 171 PNG on disk are all ignored.
- Source and exact locus: `/.gitignore`, `prototypes/{studio-v0,title-city}/.gitignore`, `prototypes/ui-v0/tools/.gitignore`, `scripts/assets/.gitignore`.
- Why it matters: the monorepo must keep the same guarantee with a single root ignore plus a commit check (C2 §9 hash manifest; `scripts/maps/hash_manifest.py` already writes `assets-local/private/hash-manifests/`).
- Confidence and freshness: [M] as of 6fa2c0a.
- Contradiction or open question: `.aiur/` is untracked and un-ignored; aiur init presumably expects it committed.
- Suggested requirement/decision impact: ticket 1 rewrites `.gitignore` for the new layout and adds `node_modules/`, `dist/`, `.turbo/`, `*.local`, keeping all current patterns.

### E12-14: docs/reference is two short documents, one of which is the de-facto bucket layout spec
- Claim / current behavior: `docs/reference/local-asset-library.md` (83 lines) defines `assets-local/{catalog.json,packs/<id>/{pack.json,icon.png,<ver>/{originals,extracted}},bundles,tools,inspiration,inbox/{queue.jsonl,quarantine/...}}` and the `pack.json` shape; `docs/reference/editor-mockups/README.md` (10 lines) + 2 PNGs (frames of reference only).
- Source and exact locus: as named.
- Why it matters: T05's bucket layout and `gm packs import` read this layout; it should become the README of the assets package.
- Confidence and freshness: [V] as of 6fa2c0a.
- Contradiction or open question: says "this layout copies the bucket layout in B11 §4.1" but B11 targets an S3 bucket; here it is a filesystem. Fine for a self-hosted instance (A8) if the store is filesystem-backed.
- Suggested requirement/decision impact: no code; move the doc next to the assets package when it exists.

### E12-15: The host has the TS toolchain basics and the capture stack, nothing project-wide
- Claim / current behavior: node v24.14.0, npm, pnpm, yarn (nvm); python3 3.13.5; chromium `/usr/bin/chromium`; ffmpeg; `gh`; `netlify`; `aiur` at `~/.local/bin/aiur`. No `tsc`, `esbuild` or `playwright` on PATH.
- Source and exact locus: `which …` on the host, 2026-10-31.
- Why it matters: ticket 1 can rely on pnpm without an install; Playwright browsers for `packages/verify` can use the system Chromium (`executablePath`) to avoid a download.
- Confidence and freshness: [M].
- Contradiction or open question: none.
- Suggested requirement/decision impact: pin `packageManager` in root `package.json` to the installed pnpm; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` or `channel`-free `executablePath` in verify.

### E12-16: Untracked `_pf.mjs` is a live CDP driver that must never be committed or ported
- Claim / current behavior: `prototypes/ui-v0/tools/_pf.mjs` connects to a running browser over CDP at 127.0.0.1:9333 and `eval`s its argument; it was used to drive the ProFantasy store (serials are private per memory).
- Source and exact locus: file lines 1-13.
- Why it matters: an agent sweeping `prototypes/ui-v0/tools/*.mjs` into a verify package would import an `eval`-based remote driver.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: exclude by name; mention in ticket 3's "must not absorb".

## 3. Existing owners and reuse targets

| Capability | What exists today (path, language, tests) | Keep / port to TS / replace | Why |
|---|---|---|---|
| Asset card + layout-spec schemas | `docs/research/v0.5/schemas/*.schema.json` (JSON Schema 2020-12), 16 examples, 4 negatives; tests: yes (validator run) | Keep (move to `packages/contracts/schemas/`) | Already validated data; vocab is the C3 standard |
| Rights engine + layout graph checks | `schemas/tools/validate.mjs` (Node ESM, 111 lines); tests: examples + `test-negative.sh` | Port to TS (`packages/contracts/src/rights.ts`, `layout.ts`) with the same fixtures | Needed as a library by API, gm CLI and skills |
| Drive watch folder | `scripts/drive-sync/drive_sync.py` (Python, 932), 27 unittest; systemd unit, README | Keep as Python worker (`services/intake` wraps it) | Tested, stdlib-heavy, already a service unit |
| Audio measurement / analysis / cards | `scripts/audio/{measure,analyze,build_audio_cards,labels,import_sidetrax}.py`, 35 pytest | Keep as Python worker | torch/essentia/CLAP; no TS equivalent |
| Map tagging / hash manifest / docs import | `scripts/maps/{tag_maps,hash_manifest,import_profantasy_docs}.py`, 5 pytest | Keep as Python worker | CLIP; hash manifest feeds the commit check |
| Pack importers (Kenney, Synty, itch) | `scripts/assets/{import_kenney_bundle,import_synty,install_itch_pack}.py`; no tests | Keep for now; replace by `gm packs import` (T05) | Hard-coded paths and dates; one-off |
| Fetchers (itch, Poly Pizza, public Drive) | `scripts/assets/fetch_*.py` (stdlib); no tests | Keep (gm-pack-scout calls them) | Work; low value to port |
| Catalog + collection cards | `scripts/assets/{build_catalog,build_collection_cards}.py` + `data/collection_tags.jsonl`; no tests | Port to TS in `packages/assets` | Becomes the search index behind `gm assets search` |
| Preview pages (thumbnails, sprite sheets, store previews, clips page) | `scripts/assets/{pack_thumbnails,sprite_libraries,pack_previews}.py`, `title-city/tools/clips_page.py`, `*.html` lineups | Replace by `gm assets sheet` / verify's clips page | Agent-facing output should be one contact sheet (B11) |
| Headless capture / loadtime / taptest / e2e | 13 `*.mjs` under `prototypes/*/tools` (Node, Playwright); no tests | Port to TS `packages/verify` | One tool with subcommands; GPU flag switch |
| Model baking / bundling / variants | `title-city/tools/{bake,bundle,variants}.mjs` + `variants.html` | Keep as the title town's build steps (moved with it) | Specific to the town asset |
| Sprite generators | `title-city/tools/{ness_sprite,ufo_sprite}.py`, `studio-v0/tools/gm_logo.py` | Keep as-is under the title-town asset | One-off art tooling |
| Title town (live site look) | `title-city/{city,rampage,earthbound,fx}.js` + `fx-variants/burning.js` (3,158 lines JS) | Keep as a built asset (`apps/web/title-town/`), not ported | Kevin: the title town stays |
| Studio shell, library, new-game flow, sound | `studio-v0/{app,data,scenes,sound,icons,title-*}.js`, `index.html` 652 | Replace (React `apps/web`) | Throwaway; mocked voice and builds |
| Dungeon editor + play loop | `ui-v0/site/js/dungeon.js` (865) | Replace (SDK + editor, T04/T09) | Throwaway; proves hooks only |
| Web Audio mixer | `ui-v0/site/js/audio.js` (91), `studio-v0/sound.js` (205) | Replace (Tone.js per stack) | Decided stack |
| Service worker cache | `studio-v0/sw.js` (21) | Port pattern to `apps/web` | Phone load time lesson |
| pixelfx | `third_party/pixelfx` (JS, 41,772 lines, MIT, pinned) | Keep vendored | Tier-2 effect source for SDK and `gm fx` |
| Agent skills | `.claude/skills/gm-*/SKILL.md` (6, 295 lines) | Keep, move to `skills/` | T10 owns content |
| Netlify deploy | `studio-v0/tools/{build,deploy}.sh`, `.netlify-site-id` | Replace by `apps/web` build + same CLI deploy | Keep headers and Synty exclusion |

## 4. Interfaces and contracts this track defines or consumes

**Workspace layout (owner: T12, ticket 1).** pnpm workspaces, TS project references, one `tsconfig.base.json`, vitest.

```
pnpm-workspace.yaml:  packages: ["apps/*", "packages/*", "services/*"]
package.json:         { "name": "ogm", "private": true, "packageManager": "pnpm@<installed>",
                        "scripts": { "build": "pnpm -r build", "test": "pnpm -r test", "lint": "...", "typecheck": "tsc -b" } }
```

Package names: `@ogm/contracts`, `@ogm/sdk`, `@ogm/assets`, `@ogm/verify`, `@ogm/gm-cli`, `@ogm/web`, `@ogm/api`, `@ogm/rooms`, `@ogm/commit`, `@ogm/intake`.

**Proposed tree and where existing files move (owner: T12; names are proposals [O]).**

```
apps/web/                      React + Vite, Netlify (T09). title-town/ ← prototypes/title-city/{city,rampage,earthbound,fx}.js, fx-variants/, tools/{bake,bundle,variants,poster}.mjs; sw.js pattern ← studio-v0/sw.js
services/api/                  Node backend (T01): auth, policy, jobs, budgets, notifications, analytics ingest
services/rooms/                Colyseus host (T07)
services/commit/               the only GitHub writer (T03)
services/intake/               Drive watch + intake worker; wraps scripts/py/drive-sync (T05)
packages/contracts/            schemas/ ← docs/research/v0.5/schemas/{*.schema.json,examples/,tools/negative/}; src/rights.ts, layout.ts ← tools/validate.mjs; engine messages (T04), room protocol (T07), API types (T01)
packages/sdk/                  engine SDK (T04); depends on third_party/pixelfx via workspace alias
packages/assets/               catalog, cards, lockfile, bucket client (T05) ← scripts/assets/{build_catalog,build_collection_cards}.py, data/collection_tags.jsonl; README ← docs/reference/local-asset-library.md
packages/verify/               headless capture (T10) ← prototypes/title-city/tools/{capture,taptest,loadtime,mix_sound}.mjs, ui-v0/tools/{e2e,shot,perf,weight}.mjs, studio-v0/tools/loadrec.mjs
packages/gm-cli/               `gm` (T05/T10): assets, packs, verify, skills, fx, music, sfx
skills/gm-*/SKILL.md           ← .claude/skills/gm-*/ (keep .claude/skills as symlinks)
templates/<genre>/             scaffold-only starters for `gm new` (T10)
scripts/py/{audio,maps,drive-sync}/  ← scripts/{audio,maps,drive-sync} unchanged; scripts/assets/*.py stay until gm packs replaces them
third_party/pixelfx/           unchanged
prototypes/                    frozen; studio-v0 + ui-v0 archived after apps/web deploys
.github/workflows/ci.yml       lint, typecheck, vitest, python tests (drive-sync always; audio/maps when the venv exists)
.aiur/config, CODEOWNERS       ownership per package
```

**Python worker CLI signatures (owner: T05; consumed as-is).** `drive_sync.py run [--once] [--dry-run] | status`; `analyze.py [--workers N] [--packs DIR] [--only GLOB]`; `build_audio_cards.py [--packs DIR] [--no-validate]`; `measure.py FILE OUT_PREFIX [--loop-search]`; `tag_maps.py analyse|cards`; all invoked as `<venv>/bin/python -I <script>`.

**Rights library (owner: T12 ticket 2; consumers T01/T05/T10).**
```ts
export function effectiveRights(basis: RightsBasis[]): { uses: Set<Use>; audience: Audience; redistribution: Redistribution };
export function validateCard(doc: unknown): { ok: true; card: AssetCard } | { ok: false; errors: string[] };
```

**Verify hooks consumed (owner: T04).** `window.__ogm.tick(seconds)`, `window.__ready`; verify never defines hooks.

**CODEOWNERS sketch (owner: T12 ticket 1).** `/packages/contracts/ @its-everdred` as the gate for shared types; one line per package so aiur's build order can map tickets to surfaces.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Hard prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T12-1 | Monorepo scaffold + CI | pnpm workspace, tsconfig base, vitest, eslint/prettier, `.github/workflows/ci.yml` green on an empty package set, `.gitignore` rewrite, CODEOWNERS | root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/ci.yml`, `.gitignore`, `CODEOWNERS` | 2 | none (wave 0 spine) | any feature package; Netlify deploy |
| T12-2 | `@ogm/contracts` bootstrap with schemas and rights engine | Schemas, examples and negatives moved; `validate.mjs` ported with fixtures as tests; shim at old path; Python callers updated | `packages/contracts/**`, `docs/research/v0.5/schemas/tools/validate.mjs` (shim), `scripts/audio/build_audio_cards.py` (path) | 3 | T12-1 | engine/room/API types (T04/T07/T01 add their own files) |
| T12-3 | `@ogm/verify` from the capture tools | One CLI: stills, timeline, record, loadtime, taptest; GPU switch; system Chromium | `packages/verify/**` | 3 | T12-1; T04 hook names | `_pf.mjs`; bake/variants/poster (title-town build) |
| T12-4 | Title town as a built asset of the web app | `title-city` runtime + bake/bundle/variants moved under `apps/web/title-town`, built to one bundle, legacy messages adapted to the typed envelope | `apps/web/title-town/**`, `apps/web/vite.config.ts` | 2 | T12-1; T09 app shell exists; T04 message types | the React shell; any change to the town's look |
| T12-5 | Python workers convention + CI job | `scripts/py/` with per-tool requirements, documented venv paths, a `make test`; CI runs drive-sync unittest and the venv-free subset | `scripts/py/**`, `.github/workflows/ci.yml` (one job) | 1 | T12-1 | porting any worker |
| T12-6 | `@ogm/assets` catalog and cards library | TS port of `build_catalog.py` and `build_collection_cards.py` reading the `assets-local` layout; emits the index `gm assets search` uses | `packages/assets/**` | 3 | T12-2 | search ranking/embeddings (T05); bucket store choice (T11) |
| T12-7 | Skills directory + installer | `skills/gm-*` at root, `.claude/skills` symlinks, `gm skills install <repo>` copies into a creator repo | `skills/**`, `packages/gm-cli/src/commands/skills.ts` | 2 | T12-1; gm-cli skeleton (T05) | rewriting skill content (T10) |
| T12-8 | Web app build and deploy pipeline | `apps/web` build emits `_headers`, SW build stamp, Synty exclusion; `tools/deploy.sh` equivalent using the same Netlify site id | `apps/web/{vite.config.ts,public/_headers}`, `tools/deploy.sh` | 2 | T12-1, T12-4, T09 shell | GitHub-Actions deploys (credits) |
| T12-9 | Archive studio-v0 and ui-v0 | Prototypes frozen with READMEs pointing at their successors; deploy script retired | `prototypes/README.md`, `prototypes/{studio-v0,ui-v0}/README.md` | 1 | T12-8 live | deleting `title-city` sources |

## 6. Risks and unknowns

- **Merge policy vs no CI.** `.aiur/config` requires full CI (`ci: wait`, the only mode) while no workflow exists. Default: T12-1 is the first merge and includes a workflow that passes on the empty workspace; until it lands the Executor merges by hand.
- **Shared-barrel contention.** `packages/contracts/src/index.ts`, `packages/sdk/src/index.ts`, `packages/gm-cli` command registry and `apps/web` router will be touched by most tickets. Default: one file per type family / command / route and a generated or append-only barrel; see §hot write surfaces.
- **GPU in the sandbox.** Verify tools work on the host GPU (`gl-egl`); inside T03's isolation they may fall back to swiftshader at 1–2 fps. Default: verify runs on the host as a service the sandbox calls, not inside the sandbox (decision for T03/T10).
- **Python venvs are machine-local.** Three venvs with absolute paths; torch cannot be rebuilt per job. Default: workers are host services (systemd user units, T11), never per-job.
- **Validator path change breaks Python callers.** Default: ship a shim at the old path in T12-2 and run `scripts/audio` tests in that ticket.
- **Worktrees inside the repo.** `.claude/worktrees/**` must be excluded from CI globs and agent searches. Default: add to tool ignore lists; prune is a T11 host chore.
- **Title town depends on `assets-local` at build time** (`build.sh` copies Kenney GLBs; `models/` gitignored). Default: T12-4 keeps the baked `models/bake/*.bin.gz` as build outputs produced on this machine and committed to the deploy, never to git (same as today).
- **Spike needed:** whether `apps/web` (Vite) can host the title town's import-map-based bundle without re-bundling pixelfx twice (SDK also imports it). Default: the town stays its own esbuild bundle loaded in an iframe, as now.

## 7. Self-hosting notes

- Nothing in this track ran on Railway; the change is that CI must not assume cloud runners for anything that needs the venvs, the GPU or `assets-local`. Default CI = lint, typecheck, vitest, drive-sync unittest; the audio/maps suites and verify run on this host (self-hosted runner is a T11 option; not required for V1).
- Checked read-only on the host: `node v24.14.0`, `pnpm` present, `python3 3.13.5`, `/usr/bin/chromium`, `ffmpeg`, `gh`, `netlify`, `aiur` (`~/.local/bin/aiur`); no `tsc`/`esbuild`/`playwright` on PATH. Venvs at `scripts/audio/.venv`, `scripts/drive-sync/.venv`, `~/.local/share/ogm/forge-venv`.
- Test runs here wrote nothing into the repo (`git status` unchanged apart from pre-existing untracked files); `PYTHONDONTWRITEBYTECODE=1 … -p no:cacheprovider`.

## Hot write surfaces

| Surface | Why many tickets touch it | Likely writers | Split so tickets don't collide |
|---|---|---|---|
| root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | every new package or dependency | T12-1, every package-creating ticket, T04 (three/rapier/phaser), T07 (colyseus), T01 (better-auth, DB) | workspace globs (`apps/*`, `packages/*`, `services/*`) so adding a package needs no root edit; deps live in each package's own `package.json`; lockfile conflicts resolved by re-running `pnpm install` (accepted) |
| `.github/workflows/ci.yml` | each lane wants its job | T12-1, T12-5, T05 (python), T10 (verify), T11 (runner) | one workflow calling per-package `pnpm -r test`; extra jobs as separate workflow files (`ci-python.yml`) |
| `packages/contracts/src/index.ts` | shared types for engine, rooms, API, assets | T01, T04, T05, T07, T08 | one file per family (`engine.ts`, `room.ts`, `api.ts`, `card.ts`, `design-log.ts`); barrel is append-only, one line per family |
| `packages/sdk/src/index.ts` | camera rigs, input, loader, audio, multiplayer hooks, test hooks | T04 sub-tickets, T07 (hooks) | `src/<area>/index.ts` per area; top barrel re-exports areas only |
| `apps/web/src/router.tsx` + `src/state/` | each screen (title, picker, creation, editor host, build chat, admin, bug report, age screen) | T09 sub-tickets, T06, T08 | route table as `routes/<screen>/route.tsx` auto-collected (file-based or a generated manifest); one store slice per screen |
| `services/api/src/routes/index.ts` + DB schema/migrations | accounts, policy, jobs, budgets, bugs, analytics, notifications | T01 sub-tickets, T02, T08 | one router file per bounded context, mounted by a shell; migrations are timestamped files (append-only by construction) |
| `packages/gm-cli/src/commands/index.ts` | `assets`, `packs`, `verify`, `skills`, `fx`, `music`, `sfx`, `run`, `check` | T05, T10, T12-7 | command-per-file with a directory scan; no central registry edits |
| `skills/gm-*/SKILL.md` | every skill cites `gm` commands as they appear | T10, T05 | one skill per ticket; cross-references by command name only |
| `.aiur/config`, `CODEOWNERS`, `.gitignore` | ownership and policy changes | T12-1, T02, T11 | serialize (`serializes_with`) rather than split; few writers |
| `tsconfig.base.json` | path aliases per package | T12-1 only | packages use `references` in their own `tsconfig.json`; base is frozen after wave 0 |
