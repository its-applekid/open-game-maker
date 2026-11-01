# T05 asset-pipeline: evidence packet

Researched at commit `9508c1c` (branch `research`), 2026-10-31. Tags: [M] measured here, [V] verified in source, [I] inferred, [O] opinion.

## 1. Scope of this track

The `gm` CLI's asset namespaces and the asset library: pack import (tiers 1–3), the blob store on this machine, device-tier variants (C4), metadata cards and tagging (C3 + `docs/research/v0.5/schemas/`), style families, usage-rights enforcement at search/build/publish, the Drive watch folder and `gm-asset-intake`, map inspiration and layout specs, audio analysis, the `assets-local/` layout and the per-game lockfile.
Not this track: the sandbox and the commit service (T03), the SDK's runtime tier picker and loader (T04), the skills' prose (T10), process supervision and the public hostname (T11), the backend's database and auth (T01).
Everything below is read-only research; no file outside this packet was written.

## 2. Evidence packets

### E05-1: The library is 414 packs / 210,895 files from seven vendors, not the 277 Kenney+Synty packs the research assumes
- Claim / current behavior: `assets-local/catalog.json` lists 414 packs (Kenney 265, Sidetrax 128, Synty 13, LimeZu 5, ansimuz 1, hattap 1, quaternius 1) and one inspiration collection (ProFantasy, 2,092 map cards). C2 §2 and C3 say "277 packs" and model only Kenney and Synty.
- Source and exact locus: `assets-local/catalog.json` (`packs[]`, `inspiration[]`), computed with Python [M]; `docs/research/v0.5/C2-v1-scope-additions.md` §2; C3 §9.
- Why it matters: the migration script and the rights engine must handle five more license classes (next packet) and the style-family table must cover 2D vendors the research never saw.
- Confidence and freshness: [M] as of 9508c1c.
- Contradiction or open question: research counts are stale; nothing wrong in design, only in size estimates (tagging cost scales with 210k files, most of which are ProFantasy bitmaps that stay hash-only).
- Suggested requirement/decision impact: the catalog/index ticket takes the catalog as the source of truth for pack ids; the card migration must be idempotent over all 414.

### E05-2: Five license values in the catalog are neither SPDX nor `LicenseRef-`, and `install_itch_pack.py` writes a rights shape the C3 schema rejects
- Claim / current behavior: catalog `license` values include `sidetrax-royalty-free` (128), `synty-personal` (13), `LimeZu-commercial` (5), `ansimuz-free-commercial`, `custom-commercial-ok` [M]. `scripts/assets/install_itch_pack.py` lines 366–368 write `usage_rights` with `redistribution: 'not-allowed'` and `basis` as a string; the schema enum is `none | in-build | free` and `basis` is an array of typed entries (`schemas/asset-card.schema.json` lines 145, 229) [V]. The 8 packs without a collection card (`card_status: null`, `rights_uses: []`) are exactly the non-Kenney/Synty/Sidetrax ones [M, I].
- Source and exact locus: `scripts/assets/install_itch_pack.py:362-368`; `scripts/assets/build_collection_cards.py:62-68` (only `kenney` and `synty` ceilings); `docs/research/v0.5/C3-asset-metadata-standard.md` §17.3 (SPDX throughout, `LicenseRef-` for vendor classes).
- Why it matters: the rights engine refuses cards whose stored rights don't match computed ones; these 8 packs would be invisible to `gm assets search` until migrated, and `not-allowed` would fail validation.
- Confidence and freshness: [V]/[M] as of 9508c1c.
- Contradiction or open question: `local-asset-library.md` still says `license` is "an SPDX id or a vendor class"; C3 §17.3 overrides it.
- Suggested requirement/decision impact: a license-class table (`LicenseRef-synty-personal`, `LicenseRef-sidetrax-royalty-free`, `LicenseRef-limezu-commercial`, `LicenseRef-ansimuz-free`, `LicenseRef-itch-custom`) in the rights engine, and `install_itch_pack.py` either fixed or replaced by `gm packs import`.

### E05-3: Per-asset cards exist only for audio (2,814) and maps (2,092); zero 3D/2D asset cards, and collection "tagged" status came from filenames, not images
- Claim / current behavior: `asset_cards` totals 2,814 across 147 packs, all audio (`build_audio_cards.py`), plus 2,092 inspiration map cards (`tag_maps.py`). 278 collection cards are `tagged` by `build_collection_cards.py`, whose `describe` tags came from `data/collection_tags.jsonl` "written by Claude from each pack's title, folder names and filename words (no images looked at)" [V, docstring]. The 128 Sidetrax collection cards are `draft`.
- Source and exact locus: `assets-local/catalog.json` aggregates [M]; `scripts/assets/build_collection_cards.py:43-47`; `docs/plans/2026-10-27-001-feat-music-library-preprocessing-plan.md` "Full run (finished 2026-10-28)".
- Why it matters: `gm assets search` for models and sprites has nothing to search at asset granularity; C3's status gate (`tagged|reviewed` by default) would hide every 3D asset. The vision-tagging pass needs spend that isn't approved.
- Confidence and freshness: [M]/[V] as of 9508c1c.
- Contradiction or open question: C3 §13 step 7 assumes a paid vision model; the only taggers that ran are local (CLAP for audio, CLIP ViT-L/14 for maps).
- Suggested requirement/decision impact: V1 tags 3D/2D assets with code measurement + filename seeds + local CLIP lift-ranking on rendered contact sheets (the `tag_maps.py` pattern), status `measured`/`tagged` with `low-confidence`; search defaults include `measured` for model/sprite kinds until a vision pass is funded. [O]

### E05-4: No S3-compatible store exists or can be started on this machine without an install or Docker access
- Claim / current behavior: `which minio mc garage seaweedfs rclone s3cmd` all empty; `aws` CLI 2.34.4 is present; `docker` 26.1.5 is installed but `docker info` fails with "permission denied" on the socket for this user [M]. 2.8 TB free on `/` [M].
- Source and exact locus: host checks (`which`, `docker info`, `df -h /home`).
- Why it matters: A8 says "an S3-compatible store on this machine"; B6 §6 wants one `BlobStore` implementation with no provider abstraction; nothing agents can run today speaks S3.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: A8's wording vs. zero-install reality.
- Suggested requirement/decision impact: **Bucket choice: a filesystem-backed `BlobStore` (content-addressed `blobs/sha256/<hex>` under a data dir outside the repo) served by the Node backend with HMAC-signed GET URLs (B6 §6 shape, same four env vars), with the S3 adapter as a second implementation of the same interface for V2.** Read A8's "S3-compatible" as "S3-shaped interface". If T11 wants a real S3 daemon, the zero-cost single-binary options are Garage (AGPL-3.0, [I] ~1k stars on the GitHub mirror, below the bar) or SeaweedFS (Apache-2.0, [I] >20k stars); MinIO's community builds went source-only in 2025 [I]. Recommend not running one in V1.

### E05-5: FBX→GLB conversion is impossible here today; 19 packs (all Synty 3D) are FBX-only
- Claim / current behavior: `which blender assimp` empty [M]; C3 §16 recorded the same. Catalog: 52 packs ship GLB, 19 ship FBX without GLB [M]. B11 §4.2 step 2 relies on headless Blender.
- Source and exact locus: host check; `docs/research/v0.4/B11-asset-pack-library.md` §4.2; `assets-local/catalog.json` `file_types`.
- Why it matters: the "detailed low poly" and "simple low poly" style families (C2 §2) are entirely Synty FBX; without a converter they cannot enter the pipeline, be measured or be used by the SDK.
- Confidence and freshness: [M] as of 2026-10-31.
- Contradiction or open question: Blender is free; installing it is Kevin's call (CLAUDE.md: no installs during research; the build may add tools). FBX2glTF is archived; assimp is apt-installable.
- Suggested requirement/decision impact: a `remind` item for Kevin (apt `blender` or the official tarball); the converter step is a pluggable worker (`blender -b --python`), and V1's first style families are the Kenney ones (GLB already present).

### E05-6: Device tiers happen at game build time (C4), not at pack import (C2 §3); pick C4
- Claim / current behavior: C2 §3 (2026-10-26): "`gm packs import` writes a desktop and a mobile variant of every asset". C4 §5.1 (2026-10-31) and the decision log row "Device-tiered assets" (updated 2026-10-31): "a build step packs, compresses and tiers each asset with a manifest carrying its licence", cached by (source hash, recipe hash).
- Source and exact locus: `docs/research/v0.5/C2-v1-scope-additions.md` §3; `docs/research/v0.5/C4-mobile-asset-pipeline.md` §5.1–5.5; `docs/spec/game-maker-2000-v0.5-decisions.md` row "Device-tiered assets".
- Why it matters: tiering 210k library files at import is wasted work and storage; tiering the 20–200 assets a game uses takes seconds and is what C4 measured (174 GLBs → 4 kit files, 8.6 MB → 0.8 MB).
- Confidence and freshness: [V] as of 9508c1c.
- Contradiction or open question: C2 §3 vs C4 §5; the decision log is newer and sides with C4.
- Suggested requirement/decision impact: import normalizes (GLB, hashes, measurements, previews); `gm build assets` tiers. The card's `variants[]` field (C3 §7) becomes optional in V1.

### E05-7: C4's tools are not installed; its measurements came from a scratchpad install
- Claim / current behavior: `which gltf-transform gltfpack ktx toktx` empty; `prototypes/ui-v0/tools/package.json` depends only on `esbuild` and `playwright` [M]. C4 §0.2 says the tools were installed in the scratchpad; KTX-Software was never run ("Caveats").
- Source and exact locus: host check; `prototypes/ui-v0/tools/package.json`; C4 §1.1, "Caveats".
- Why it matters: the build ticket adds `@gltf-transform/core|functions|cli`, `meshoptimizer`, `sharp` as npm deps (free, MIT/Apache); KTX2 stays a flag that is off until `toktx` exists.
- Confidence and freshness: [M].
- Contradiction or open question: none; C4 §5.3 already gives the WebP fallback.
- Suggested requirement/decision impact: V1 recipe = weld + quantize + meshopt + WebP, no KTX2; `gm build assets --ktx2` errors clearly when `toktx` is missing.

### E05-8: Three manifest shapes exist in the research; the lockfile and the build manifest need to be two files with one id space
- Claim / current behavior: B11 §4.4 `assets.lock.json` entries `{id, pack, version, sha256, license, attribution, path}`; B6 §6 `ManifestEntry` (`ref.hash`, `origin`, `redistributable`, `visibility`); C4 §5.2 `assets/manifest.json` (`files`, `assets.<id>.{file per tier, mesh, bounds, source, license}`).
- Source and exact locus: `B11` §4.4; `B6` §6 "Required V1 interfaces"; `C4` §5.2.
- Why it matters: `gm assets use` writes the lockfile (committed, source of truth for rights), `gm build assets` writes the manifest (generated, shipped, read by the SDK loader in T04). If one ticket invents a third, the publish check and the loader disagree.
- Confidence and freshness: [V].
- Contradiction or open question: none once split; sketches in §4 below.
- Suggested requirement/decision impact: `packages/asset-contracts` owns both types; T04 consumes the manifest type; T03's commit check consumes the lockfile plus the hash blocklist.

### E05-9: The rights engine already exists as a prototype in JavaScript with negative tests, and it passes
- Claim / current behavior: `schemas/tools/validate.mjs` (111 lines, ajv 2020-12 strict) implements effective-rights computation (license ∩ decisions, interpretations add uses only, `forbids` honored), the model-write allowlist, inspiration-never-in-game, and layout-spec graph metrics. `node validate.mjs ..` → "all checks passed"; `test-negative.sh` rejects all 4 negative cases [M].
- Source and exact locus: `docs/research/v0.5/schemas/tools/validate.mjs:30-57` (`effective()`), `:73-86` (checks); `schemas/asset-card.schema.json` (700 lines); 16 examples.
- Why it matters: this is the port target for `packages/asset-cards`; the schema moves unchanged (`ogm.asset-card/1.0`, vocab `2026-10-27`).
- Confidence and freshness: [M] as of 9508c1c.
- Contradiction or open question: C3 §18 Q9 (rename `vision-input` → `model-input`) is open; the Python taggers already write `vision-input` on 4,906 cards, so a rename is a migration, not a flag.
- Suggested requirement/decision impact: keep `vision-input` in V1; port `effective()` to TypeScript with the negative cases as unit tests.

### E05-10: "No cloud processing of paid assets" is a standing rule that the rights model does not encode
- Claim / current behavior: `CLAUDE.md` ("Never send paid-pack assets to it as references (no cloud processing of paid assets)") and memory `sidetrax-private-artifacts-ok` say paid packs never leave the machine. C3 §5 gives Synty "all five uses" including `vision-input`; the Sidetrax `interpretation` entry says "local models only" in a `note` only (`scripts/audio/import_sidetrax.py:117-118`).
- Source and exact locus: `CLAUDE.md` Sprite Forge bullet; `C3` §5 examples table; `import_sidetrax.py` `INTERPRETATION_NOTE`.
- Why it matters: a future vision-tagging ticket (or Sprite Forge reference use) would pass the rights check and still break the rule.
- Confidence and freshness: [V].
- Contradiction or open question: C3 §18 Q2/Q9 touch this but don't resolve it.
- Suggested requirement/decision impact: add a `processing: local-only | any` field to `rights` (schema minor bump), defaulting to `local-only` for every `LicenseRef-*` license and for quarantined drops; the tagger checks it before any non-local model call. [O]

### E05-11: The Drive listener is complete and tested (27 tests pass) but not running as a service
- Claim / current behavior: `drive_sync.py` (932 lines) polls `changes.list`, debounces, downloads to quarantine, checks archives (zip/tar/7z, zip-slip, bombs), writes `manifest.json` with strict default rights and appends `queue.jsonl`. `python3 -I test_drive_sync.py` → 27 OK in 0.5 s [M]. `systemctl --user status ogm-drive-sync` → unit not found; `Linger=yes`; the venv exists [M]. Config is a TOML at `~/.config/ogm/drive-sync.toml`, key at `~/.config/ogm/drive-sa.json`.
- Source and exact locus: `scripts/drive-sync/drive_sync.py`, `README.md`, `ogm-drive-sync.service`, `drive-sync.example.toml`.
- Why it matters: C2 §7 wants an admin-configured folder; today the folder id is a file Kevin edits. The listener's outputs (`queue.jsonl`, `manifest.json`, `intake.json`) are the de facto intake contract.
- Confidence and freshness: [M] 2026-10-31.
- Contradiction or open question: whether the admin UI writes the TOML or only reads status. Recommended default: admin UI is read-only over `drive_sync.py status` output and the queue; Kevin edits the TOML (one instance, his machine) [O].
- Suggested requirement/decision impact: keep Python; T11 installs the unit; T05 defines the intake-job contract over the existing files; the backend tails `queue.jsonl` and `intake.json`.

### E05-12: `gm-asset-intake` is a prose skill with no code behind steps 5–7; the C3 §13 tagging procedure is also prose
- Claim / current behavior: the skill tells an agent to unpack "with the same safe-path check as `import_synty.py` (`safe()`)" by hand, write `pack.json` by hand, run `build_catalog.py`, and record `"tagging": "pending"` [V]. No script performs unpack-into-library, card creation and measurement for a generic drop.
- Source and exact locus: `.claude/skills/gm-asset-intake/SKILL.md` steps 5–8; C3 §13.
- Why it matters: this is the largest gap between research and code in T05: the "deterministic steps" the skill delegates to code don't exist for non-vendor drops.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: `gm packs import <quarantine-dir|archive> --id --license [--inspiration]` implements steps 4–6 and 8 of C3 §13 (quarantine card → identify → measure → previews); the skill becomes a thin wrapper that handles licence judgment and Kevin's confirmation.

### E05-13: The audio and maps pipelines are working Python with tests, tied to heavy local models; keep them as workers
- Claim / current behavior: `scripts/audio/{analyze,measure,labels,build_audio_cards,import_sidetrax}.py` (1,239 lines) with 4 test files, `scripts/maps/{hash_manifest,import_profantasy_docs,tag_maps}.py` (570 lines) with 1 test file: `pytest scripts/audio scripts/maps` → 40 passed in 43 s in `scripts/audio/.venv` [M]. Dependencies: torch CPU, essentia (AGPL, run as a tool), transformers CLAP (Apache-2.0), beat_this (MIT), CLIP ViT-L/14 (MIT), pymusiclooper, librosa (`scripts/audio/requirements.txt`).
- Source and exact locus: the files above; `docs/plans/2026-10-27-001-feat-music-library-preprocessing-plan.md` "Decisions after the spike".
- Why it matters: no TypeScript equivalents exist for CLAP/CLIP/Essentia; porting would be a research project. They already write schema-valid C3 cards (validated via `validate.mjs` from `build_audio_cards.py`).
- Confidence and freshness: [M].
- Contradiction or open question: `tag_maps.py` and `hash_manifest.py` hard-code `~/.wine-cc3` and `assets-local/inspiration/profantasy-cc3` paths (present on this host [M]); not portable, acceptable for one instance.
- Suggested requirement/decision impact: `gm packs tag --kind audio|map` shells out to these with the venv interpreter; a JSON-lines stdout contract (`{card_path, status, flags}`) is the only change.

### E05-14: Usage-rights enforcement at publish is name-based today (`rm -f art/packs/synty-*`), and the only hash blocklist covers ProFantasy
- Claim / current behavior: `prototypes/studio-v0/tools/deploy.sh:6` strips Synty previews by filename; `build.sh:92` swaps Synty particle textures for Kenney stand-ins. `scripts/maps/hash_manifest.py` writes `assets-local/private/hash-manifests/profantasy-cc3-v1.txt` (`sha256  bytes  path` lines) [V]. No lockfile check, no publish check, no `gm assets why`.
- Source and exact locus: files above; C3 §5 "Enforcement" and §7 "Hash manifests".
- Why it matters: C2 §10 requires code enforcement at search, build and publish; the commit check (T03) needs a blocklist feed from T05.
- Confidence and freshness: [V].
- Contradiction or open question: none.
- Suggested requirement/decision impact: `gm packs blocklist` emits the union of `redistribution: none` hashes (originals, variants, previews, hash manifests) as one sorted file; T03's commit service reads it. `gm check assets` validates the lockfile against the index (`in-game`/`placeholder`, audience vs repo visibility) and is run by `gm check` (T10) and by publish (T08).

### E05-15: Style families exist only as a table in C2 §2; no `style-families.json`, no pack labels
- Claim / current behavior: `grep -rl style-families` finds only C2 [M]. Collection cards carry `describe.style_family` from filename seeds (`build_collection_cards.py`), unchecked for completeness; C2 §2 notes Synty rows have no `category`.
- Source and exact locus: C2 §2; `scripts/assets/data/collection_tags.jsonl`.
- Why it matters: the creation flow (T09) and `gm assets search`'s default filter both key on the family; nothing can be enforced until the file exists.
- Confidence and freshness: [M].
- Contradiction or open question: B11 `--style low-poly|pixel|toon|realistic` vs C3 family ids; C3 §17.2 picked family ids.
- Suggested requirement/decision impact: a curated `style-families.json` (schema + the seven C2 families + `views` per family) committed in the engine package; a `family_coverage` check script; the Kenney families first (E05-5).

### E05-16: Tier 2 live adapters need API keys and network from the backend; V1 can ship tier 2 as pinned mirrors plus the existing human-in-the-loop fetchers
- Claim / current behavior: B11 §4.6 lists Freesound (API key), Openverse, ambientCG as live; mirrors (KayKit, LPC, game-icons, Fontsource) as `gm packs sync`. Existing fetchers (`fetch_polypizza_bundle.py`, `fetch_itch_free.py`, `fetch_itch_owned.py`, `fetch_drive_folder.py`, `pack_previews.py`) are standard-library Python, run by Kevin's agents, keys in `~/.config/ogm` [V].
- Source and exact locus: B11 §4.6–4.7; `.claude/skills/gm-pack-scout/SKILL.md`.
- Why it matters: no spending and no new keys (README non-goals); live adapters add egress from the sandbox allowlist (T03).
- Confidence and freshness: [V].
- Contradiction or open question: B11 treats tier 2 as agent-callable during a build; the scout skill makes it operator-driven.
- Suggested requirement/decision impact: V1 tier 2 = `gm packs sync <mirror>` for git/npm sources with machine-readable licences; live adapters deferred; build agents see tier 2 only through the index. [O]

### E05-17: Audio format for games: MP3 at build time (iPhone), not OGG/Opus at import
- Claim / current behavior: B11 §4.2 normalizes audio to OGG/Opus at import; C2 §3 item 5 reports no sound on iPhone with Ogg Vorbis and a fix with MP3; `gm-assets` skill says "MP3 for iPhone"; `prototypes/title-city/tools/sounds.sh` encodes MP3 [V].
- Source and exact locus: B11 §4.2; C2 §3.5; `.claude/skills/gm-assets/SKILL.md` "Sound".
- Why it matters: an import-time Opus normalization would produce files Safari may not play from Web Audio; the library should keep originals and let the game build encode.
- Confidence and freshness: [V]; cause on iPhone unconfirmed [I].
- Contradiction or open question: B11 vs C2/prototype practice.
- Suggested requirement/decision impact: `gm build assets` encodes MP3 (ffmpeg 7.1.5 present [M]) with loudness normalization; Opus is an optional second output later.

### E05-18: `assets-local/` has grown past its reference doc
- Claim / current behavior: top level is `bundles catalog.json derived inspiration packs previews private tools` plus `inbox` when the listener runs [M]; `local-asset-library.md` documents `packs bundles tools inspiration inbox` only. `derived`, `previews`, `private` (hash manifests, private previews written by `analyze.py` and `tag_maps.py`) are undocumented.
- Source and exact locus: `ls assets-local`; `docs/reference/local-asset-library.md` "Layout".
- Why it matters: the blob-store ticket must map these prefixes (`previews/`, `private/`, `derived/`) to bucket keys without moving Kevin's files.
- Confidence and freshness: [M].
- Contradiction or open question: none.
- Suggested requirement/decision impact: the filesystem `BlobStore` treats `assets-local/` as the import source and writes content-addressed copies to the store; originals stay put (gm-asset-variants rule: never touch originals).

### E05-19: Analytics and the `gm` CLI: every asset command is an event source for T01
- Claim / current behavior: C2 "For ticketing / Analytics" asks for event emission from `gm` CLI commands joined to aiur run ids. No event schema exists.
- Source and exact locus: C2 §1 and its ticketing list.
- Why it matters: T05's CLI must emit `{event, job_id, ts, payload}` lines to a local sink the backend ships to T01's store; otherwise the admin analytics view has no asset activity.
- Confidence and freshness: [V].
- Contradiction or open question: sink location inside the sandbox is T03's.
- Suggested requirement/decision impact: `gm` writes JSONL to `$GM_EVENTS_FILE` when set; event names `assets.search|use|register|build|check`.

### E05-20: `gm` does not exist anywhere in the repo; the skills shell out to Python scripts and grep
- Claim / current behavior: `find` for `gm`, `gm.mjs`, `gm-cli*` returns nothing; no root `package.json`; the skills grep `collection.card.json` and run `scripts/assets/*.py` [M].
- Source and exact locus: repo search; `.claude/skills/gm-assets/SKILL.md` "Search what we have".
- Why it matters: every skill in T10 that names `gm assets …` is aspirational; the CLI skeleton is the first ticket on T05's path and a hot write surface shared with T04/T06/T10.
- Confidence and freshness: [M].
- Contradiction or open question: none.
- Suggested requirement/decision impact: ticket T05-A below owns `packages/gm-cli` skeleton and the asset namespaces; other tracks add subcommands in separate directories to limit conflicts.

## 3. Existing owners and reuse targets

| Capability | What exists today | Decision | Why |
|---|---|---|---|
| Pack list / index | `scripts/assets/build_catalog.py` (Python, 50 lines, no tests) → `catalog.json` | Replace with `gm packs index` (TS) reading cards; keep the script until then | The index must resolve inheritance, facets and rights (C3 §8, §10); the catalog is a flat list |
| Collection-card migration | `scripts/assets/build_collection_cards.py` + `data/collection_tags.jsonl` (no tests; already run on 406 packs) | Keep as one-off; port its licence ceilings into the rights engine; extend for the 8 uncarded packs | Done work; only the licence table needs to live in TS |
| Vendor importers | `import_kenney_bundle.py`, `import_synty.py` (hard-coded `~/Downloads`, `PACKS` list) | Keep as historical one-offs; replace by `gm packs import` | Not reusable for drops; already executed |
| Pack fetchers and scouting | `fetch_drive_folder.py`, `fetch_itch_free.py`, `fetch_itch_owned.py`, `fetch_polypizza_bundle.py`, `install_itch_pack.py`, `pack_previews.py` (stdlib Python, no tests) | Keep as Python operator tools (gm-pack-scout); fix `install_itch_pack.py` rights shape (E05-2) | Operator-only, network, keys in `~/.config/ogm`; not in the product hot path |
| Lineup / preview pages | `pack_thumbnails.py`, `sprite_libraries.py` (Pillow), `prototypes/title-city/tools/{creatures,lineup,variants}.html` | Keep for operators; `gm assets sheet` (TS, headless Chromium) supersedes for agents | Contact sheets are a product feature (B11 `sheet`) |
| Audio measurement and cards | `scripts/audio/*.py` (1,239 lines, 4 test files, 40 tests pass with maps) | Keep as Python worker behind `gm packs tag --kind audio` | CLAP/Essentia/beat_this have no TS equivalents |
| Map cards, layout hashes | `scripts/maps/*.py` (570 lines, 1 test file) | Keep as Python worker behind `gm packs tag --kind map` and `gm packs blocklist` | CLIP local model; already produced 2,092 valid cards |
| Drive watch folder | `scripts/drive-sync/drive_sync.py` (932 lines, 27 tests, systemd unit, TOML) | Keep as Python service; define the queue contract; T11 installs the unit | Complete and tested; no reason to port |
| Card schema and validator | `schemas/asset-card.schema.json`, `map-layout-spec.schema.json`, `tools/validate.mjs` (ajv), 16 examples, 4 negatives | Port to `packages/asset-cards` (TS): schemas copied verbatim, `effective()` and checks as a library with the negatives as tests | The rights engine must run in the CLI, the backend and the commit check |
| Per-game asset build and variants | `prototypes/title-city/tools/bake.mjs` (browser bake via Playwright), `variants.mjs` (GLTFExporter, bloated output per C4 §0.1) | Replace with `gm build assets` on the gltf-transform API (C4 §5.3) | Prototype-specific, needs a served page; C4 measured the better path |
| Publish stripping | `prototypes/studio-v0/tools/deploy.sh:6` (`rm -f synty-*`) | Replace with `gm check assets` + hash blocklist | Name-based and prototype-only |
| Lockfile, `gm` CLI, style families, blob store | none | Build (tickets below) | Gaps |

## 4. Interfaces and contracts this track defines or consumes

**`gm` CLI, V1 asset namespaces (owner: T05; package `packages/gm-cli`).** Compact one-line output, `--json`, `--limit 10`, exit 2 on refusal with one-line cause + suggested command (B11 §4.7).
```
gm assets search <words> [--kind model/prop] [--family chunky-low-poly] [--pov iso] [--use in-game] [--rig-id r] [--same-rig-as id] [--include-draft] [--tier 1|2]
gm assets facets [filters] [--proposed]
gm assets info <id...>
gm assets sheet <id...> [--out sheet.png]
gm assets use <id...> [-f picks.txt] [--dest assets/]        # copies, writes assets.lock.json, CREDITS.md; refuses with reason
gm assets register <path> --made-by-agent [--from <id>]       # tier 3 / variants
gm assets list | why <id>
gm maps search "<structure words>"                            # layout specs; requires derive-layout
gm build assets [--tier desktop,mobile,low] [--budget mobile]  # C4 pipeline -> public/assets/manifest.json
gm check assets [--publish --repo-visibility public]          # lockfile vs index vs rights; exit 1 on violation
gm packs import <dir|archive> --id <vendor-name> [--license SPDX|LicenseRef-x] [--inspiration]   # operator
gm packs tag --kind audio|map|model|sprite [--only glob]       # operator; local models only
gm packs rights decide <collection> --uses ... --audience ... --redistribution ... --note "..."   # admin
gm packs index | sync <mirror> | blocklist [--out file]        # operator
```
Other namespaces (`gm run|test|check|scope|progress|narrate|new|docs|perf`) are owned by T10/T04/T06; they register under `packages/gm-cli/src/commands/<ns>/` to keep write surfaces apart.

**Lockfile (owner T05; consumers T03 commit check, T08 publish, T09 credits).**
```ts
type AssetsLock = { version: 1; family: StyleFamilyId; pov: PovId;
  assets: Array<{ id: string;               // t1:kenney-mini-dungeon/character-orc@2.0 | t3:<game>/boss-door
    sha256: string; path: string;           // path in the game repo
    license: string;                        // SPDX or LicenseRef-*
    rights: { uses: Use[]; audience: 'private'|'public'; redistribution: 'none'|'in-build'|'free'; attribution: string|null };
    derived_from?: string[]; added: string }> };
```

**Build manifest (owner T05; consumer T04 loader, T10 `gm-verify` budgets).** C4 §5.2 shape: `{version, built, tiers, files{name:{bytes,tris,gpuTexMB,decoders}}, assets{id:{file:{tier:name}|{'*':name}, mesh?, bounds?, source, license}}}`. Content-hashed file names.

**Blob store (owner T05; consumer T11 for paths/permissions, T01 for signed-URL auth).** B6 §6 `BlobStore` interface unchanged; V1 implementation `FsBlobStore(root)` with keys `blobs/sha256/<hex>`, `previews/sha256/<hex>.webp`, `private/...`; backend route `GET /assets/blob/:hash?exp&sig`.

**Intake job (owner T05; producer `drive_sync.py`, consumer the intake worker and the admin UI).** One line of `assets-local/inbox/queue.jsonl`: `{"drop_id", "name", "manifest": "<path>", "time"}`; `manifest.json` carries `files[]`, `license_files[]`, `problems[]`, `integrity_ok`, `usage_rights` (strict default); `intake.json` `{status: imported|awaiting-license|blocked|duplicate, collection, license, rights, confirmed_by, date}` ends the job.

**Tagger worker contract (owner T05).** `scripts/audio/.venv/bin/python -I <script> --json` prints one JSON line per card: `{"card": "<path>", "status": "measured|tagged", "flags": [...]}`; non-zero exit on schema failure.

**Hash blocklist (owner T05; consumer T03).** Text file, sorted, `sha256  bytes  path`, union of all `redistribution: none` sources, variants, previews and hash manifests.

**Style families (owner T05; consumers T09 creation flow, T10 `gm-core`).** `style-families.json`: `[{id, dimension: '2d'|'3d', fidelity, packs: {primary: [], extras: []}, views: PovId[], license_note, coverage: {characters, environment, props, ui, sfx, music}}]`.

**Analytics events (owner T01; emitter T05).** JSONL `{event: 'assets.use', job_id, ts, payload}` to `$GM_EVENTS_FILE`.

## 5. Candidate tickets

| # | Working title | Outcome | Code surface | Cx | Prerequisites | Must not absorb |
|---|---|---|---|---|---|---|
| T05-A | `gm` CLI skeleton + asset-cards package | `gm` runs from any repo; `packages/asset-cards` holds the schemas, `effective()` rights engine and checks with the 16 examples + 4 negatives as tests; `gm assets search|facets|info|list` over a JSON index built from existing cards | `packages/gm-cli/{package.json,src/index.ts,src/commands/assets/*}`, `packages/asset-cards/{schemas/*.json,src/rights.ts,src/validate.ts,test/*}`, root workspace `package.json` | 3 | T12 monorepo layout | Other namespaces' commands; the blob store |
| T05-B | Card migration for all 414 packs + licence table | Every pack has a schema-valid collection card with SPDX/`LicenseRef-` licences; the 8 uncarded packs and Sidetrax drafts resolved; `install_itch_pack.py` fixed | `packages/asset-cards/src/licenses.ts`, `scripts/assets/build_collection_cards.py` (extend), `scripts/assets/install_itch_pack.py` | 2 | T05-A | Per-asset 3D/2D tagging |
| T05-C | Lockfile, `gm assets use|register|why`, `gm check assets`, credits | Rights enforced by code at use and at publish; `assets.lock.json` + `CREDITS.md` generated; refusals explain the rule | `packages/gm-cli/src/commands/assets/{use,register,why}.ts`, `packages/asset-contracts/src/lock.ts`, `src/commands/check-assets.ts` | 3 | T05-A, T05-B | The commit service (T03); publish UI (T08) |
| T05-D | `gm build assets` (C4 tiers + manifest + budgets) | A game's used assets become kit GLBs / per-tier GLBs / MP3s with content-hashed names and `manifest.json` carrying licence; mobile budget fails the build | `packages/gm-cli/src/commands/build-assets/*`, `packages/asset-contracts/src/manifest.ts`, deps `@gltf-transform/*`, `meshoptimizer`, `sharp` | 3 | T05-C (lockfile), T04 manifest type agreement | The runtime loader and tier picker (T04); KTX2 |
| T05-E | Filesystem blob store + signed URLs + import of `assets-local/` | `FsBlobStore` with B6 interface, content-addressed copies of originals/previews/private, backend route for signed GET, originals untouched | `packages/blob-store/src/{fs.ts,index.ts}`, `services/backend/src/routes/assets.ts`, `packages/gm-cli/src/commands/packs/index.ts` | 3 | T01 route/auth shape, T11 data dir | An S3 daemon; CDN |
| T05-F | `gm packs import` + intake worker over the Drive queue | A settled drop becomes a quarantined collection card, unpacked safely, measured (glTF geometry, rig_id, clips, images, fonts), previewed; `gm-asset-intake` reduced to licence judgment | `packages/gm-cli/src/commands/packs/import.ts`, `packages/asset-measure/src/{gltf,image,font}.ts`, `services/intake/src/worker.ts`, `.claude/skills/gm-asset-intake/SKILL.md` (shrink) | 4 | T05-A/B; drive-sync unit installed (T11) | FBX conversion (needs Blender, E05-5); vision tagging |
| T05-G | Local taggers wired: audio, maps, and CLIP-on-contact-sheets for 3D/2D | `gm packs tag` runs the Python workers with the JSONL contract; contact-sheet renderer (headless Chromium) + CLIP lift-ranking produces `measured|tagged` 3D/2D asset cards without spend | `packages/gm-cli/src/commands/packs/tag.ts`, `packages/asset-previews/src/sheet.ts`, `scripts/audio/*.py` (add `--json`), `scripts/maps/tag_maps.py` (add `--json`), new `scripts/tag/tag_sheets.py` | 4 | T05-F measurers | A paid vision model; prompt design beyond the existing label sets |
| T05-H | Style families + family enforcement in search | `style-families.json` with the seven C2 families and views; `gm assets search` defaults to the game's family; logged exception flag; coverage report | `packages/asset-cards/data/style-families.json`, `src/families.ts`, `gm-cli/src/commands/assets/search.ts` | 2 | T05-A | The creation UI (T09) |
| T05-I | Hash blocklist feed + map layout search | `gm packs blocklist` unions `redistribution: none` hashes; `gm maps search` over layout specs with `derive-layout` gate | `gm-cli/src/commands/packs/blocklist.ts`, `src/commands/maps/search.ts`, `scripts/maps/hash_manifest.py` (generalize roots) | 2 | T05-A, T05-E | The commit service itself (T03); `gm-map-inspiration` prose (T10) |
| T05-J | Tier 2 mirrors (`gm packs sync`) | KayKit/LPC/game-icons/Fontsource pinned mirrors imported with per-item licences (LPC `CREDITS.csv`) | `gm-cli/src/commands/packs/sync.ts`, `packages/asset-cards/src/licenses.ts` | 2 | T05-F | Live API adapters (Freesound etc.) |

## 6. Risks and unknowns

1. **FBX conversion (E05-5).** Default: Kevin installs Blender (free); until then V1 ships Kenney families only and Synty stays `measured: false`. Spike: one Synty pack through `blender -b --python` to confirm palette-texture GLBs (B11 §7).
2. **3D/2D tagging without spend (E05-3).** Default: code + filename + local CLIP lift-ranking; mark `low-confidence`; calibration sample of 30 cards reviewed by Kevin per family. Spike: CLIP zero-shot on 50 Kenney contact sheets to see whether `environments`/`roles` are usable at all.
3. **Bucket (E05-4).** Default: filesystem `BlobStore`; revisit S3 daemon only if T11 needs a second host or Netlify needs direct-from-bucket URLs.
4. **`processing: local-only` (E05-10).** Default: add the field with a schema minor bump in T05-A; all `LicenseRef-*` and quarantined cards default to local-only.
5. **Index engine.** C3 §10 wants facets + full text + embeddings. Default: SQLite FTS5 via `better-sqlite3` or T01's Postgres if chosen; embeddings deferred (open C3 §18 Q5). [O]
6. **Family seats for personal-license packs** (B11 §6 Q1, release plan §6 Q3). Default: `audience: private` + owner-only until the EULA is read; the rights engine already expresses it.
7. **Drive-folder admin setting (E05-11).** Default: TOML stays authoritative; admin UI read-only.
8. **Audio decoding on iOS (E05-17).** Default: MP3 at build; `gm-verify` real-iPhone sound check stays a manual item.
9. **Tier 2 live sources.** Default: mirrors only in V1; Freesound/Openverse need keys and egress (T03).

## 7. Self-hosting notes

- Host: Debian 13, Node v24.14.0, Python 3.13.5, ffmpeg 7.1.5, `7z`, `wine` (CC3+ export lives in `~/.wine-cc3`), `bwrap`, `aws` CLI 2.34.4; no `blender`, `assimp`, `gltf-transform`, `gltfpack`, `toktx`, `sqlite3`, `psql`, `minio`, `rclone` [M]. Docker installed but the daemon socket is not accessible to this user [M]. 2.8 TB free [M].
- Existing venvs: `scripts/audio/.venv` (torch CPU, essentia, transformers; also used by `scripts/maps`), `scripts/drive-sync/.venv`, `~/.local/share/ogm/forge-venv`. The audio+maps test suite runs in 43 s here [M].
- `systemctl --user` works; `Linger=yes`; `ogm-drive-sync.service` is not installed (unit file exists in the repo) [M]. `aiur-agent-chat-poll.service` is present and inactive.
- Everything B11 planned "as a Railway job" (import, conversion, tagging, previews) now runs on this machine as operator commands or a `systemd --user` intake worker; CPU-bound taggers (CLAP, CLIP) should run with `nice` and bounded `--workers` so they don't starve the coding agents (T11 cgroups).
- The library stays in `assets-local/` (gitignored) as the import source; the blob store is a second, content-addressed copy outside the repo. Keys in `~/.config/ogm` (`drive-sa.json`, `itch-api-key`, link files) never enter any package or event.
- Netlify serves the built games; C4 §0.1 found it sends GLB/BIN uncompressed, so `gm build assets` must compress inside the files (meshopt + gzip-friendly quantization) rather than rely on the host.
