# OGM-064 plan — gm packs import and the intake service over the Drive queue

## 1. Problem frame

The Drive listener downloads and checks drops but imports nothing; the intake skill then asks an agent to unpack, write `pack.json` and cards by hand (E05-11, E05-12). C3 §13 names the deterministic steps (quarantine card, identify, measure, previews, validate, collection pass) and the two judgment steps (licence, confirmation). This ticket codes the deterministic steps as `gm packs import` and a measuring library, runs them from a user service over the existing queue, and shrinks the skill to the judgment steps.

Requirements trace: R80 → the service consumes `queue.jsonl`/`manifest.json` and writes `intake.json` exactly as the listener expects. R81 → `gm packs import` performs identification, safe unpack, measurement, previews and card creation; the skill keeps licence judgment and confirmation. R82 → collections of any size index at once as `draft` (searchable with `--include-draft`; creation choice stays a curation flag, OGM-066). R85 → nothing in Drive or quarantine is moved or deleted.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest; no Playwright here; `services/intake` binds no port (it is a poller) and reads only `OGM_ASSETS_ROOT`, `OGM_STATE_DIR` through `packages/config` (OGM-003) names; dependencies added: `adm-zip` (MIT, ≈2k stars), `tar` (ISC, ≈2.5k stars), `opentype.js` (MIT, ≈4k stars), `sharp` (already added by OGM-060/063); `@gltf-transform/core` (already added by OGM-063 or add here, same pin); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/README.md` "How it works" 5–6 and "Inbox layout"; `drive_sync.py` lines 758–763 (queue entry), 809–827 (manifest, strict rights), 898–903 (open = no `intake.json`): the contract to consume byte for byte.
- `/home/orangekid/games/open-game-maker-2000/scripts/assets/import_synty.py` `safe()` (line 45) and the `.unitypackage` pass (lines 74–80): path rules and single-pass extraction (C1 lesson: a second pass per nested zip).
- `/home/orangekid/games/open-game-maker-2000/scripts/assets/install_itch_pack.py` lines 20–40: `originals/` and `extracted/` layout and the `pack.json` keys (`id`, `vendor`, `title`, `category`, `license`, `license_source`, `requires`, `current`, `versions.<v>.{format, extracted_files, file_types, added, source}`).
- `/home/orangekid/games/open-game-maker-2000/scripts/audio/build_audio_cards.py` `kebab()` and the card writer around line 300–380: id formation `t1:<collection>/<kebab path>@<version>` and the provenance map shape.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C3-asset-metadata-standard.md` §3 notes (`rig_id` hash rule, canonical clip names, Synty `MaterialList`, Kenney `Tilesheet.txt`), §7 (ids, hash manifests), §13 (procedure).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/examples/collection-drive-drop-quarantined.json` and `model-character-kenney-mini-dungeon-orc.json`: the quarantine card and a measured model card.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/test_drive_sync.py`: fake-inbox test style to mirror in `services/intake/test`.

## 3. Implementation units

### U1. `@ogm/asset-measure`

Goal: code facts for glTF, images and fonts, with a stable `rig_id`.

Files: Create `packages/asset-measure/{package.json,tsconfig.json,src/index.ts,src/gltf.ts,src/rig.ts,src/clips.ts,src/image.ts,src/font.ts}`; Test `test/gltf.test.ts`, `test/image.test.ts`, `test/font.test.ts`, fixtures `test/fixtures/{character-orc.glb,character-human.glb,wall.glb,tiles16.png,font.ttf}` (GLBs copied from `assets-local/packs/kenney-mini-dungeon/<ver>/extracted/Models/GLB format/`, CC0; PNG from Tiny Dungeon; TTF from Kenney Fonts; all CC0, ≤ 300 KB total).

Approach: `gltf.ts` reads with `@gltf-transform/core` `NodeIO`; bounds from the scene's world-space AABB (`getBounds`), `pivot` as `[0, miny, 0]` relative class (`base` when miny ≈ 0 else `center`), triangles = Σ index count / 3 over `TRIANGLES` primitives, `materials` names, `texture_keys` = sha256 of each texture's bytes; `rig.ts`: collect `Skin.joints`, for each joint `parentJoint` = nearest ancestor that is also a joint else `null`, sort by name, `rigId = 'rig:' + sha256(JSON.stringify(pairs)).slice(0, 12)`; `rig_type` `humanoid` when joint names match a hips/spine/head set, else `creature`; `clips.ts`: `Animation` names → canonical via a synonym table (`idle`, `walk`, `run`, `jump`, `attack-melee`, `attack-ranged`, `hit`, `die`, `interact`, …) with `duration_s` from the max sampler input and `loop` heuristic (idle/walk/run true). `image.ts`: `sharp(file).metadata()` → width/height/hasAlpha/`indexed_colors` (palette size when PNG colour type 3), `pixel_art` = indexed or (≤ 64 colours sampled and max dimension ≤ 512); `look.palette_hex` = top 5 colours by sampling 64×64. `font.ts`: `opentype.parse` → `family`, `style`, `weight`, `glyph_count`, `monospace` (all advance widths equal), `formats: ['ttf']`.

Interface sketch: as quoted in the ticket; types import from `@ogm/contracts` (`Geometry`, `Rig`, `Clip`, `Image`, `Look`, `Font` from the card schema's `$defs`).

Test scenarios:
- Given orc and human GLBs, when measured, then equal `rig_id` and both `humanoid`.
- Given the wall GLB, then no `rig` and `triangles` > 0 with bounds ≈ 1 m.
- Given a clip named `Death`, then canonical `die`.
- Given `tiles16.png`, then `pixel_art: true` and `width_px` divisible by 16.
- Given the TTF, then `glyph_count` > 100 and `monospace: false`.

Execution note: test-first on `rigId` with hand-built joint lists (two identical rigs under different parent nodes must match; C3 §3 records that mistake).

### U2. Safe unpack and identification

Goal: untrusted archives become a clean `extracted/` tree with a hash manifest and per-file kinds.

Files: Create `packages/gm-cli/src/packs/unpack.ts`, `src/packs/identify.ts`, `src/packs/vendor.ts`; Test `test/packs-unpack.test.ts`, `test/packs-identify.test.ts` with generated fixture archives (built in the test with `adm-zip`/`tar` so hostile members exist only in memory).

Approach: `unpack(archive, dest, caps)`: `dest` must be empty; zip: iterate `getEntries()`, reject `isAbsolute`, `..` segments, backslashes, names longer than 255, symlink attributes (`entry.header.made` with unix mode `0o120000`), sizes over caps; write with `entry.getData()` to the checked path; tar/tgz/`.unitypackage`: `tar.x({ file, cwd: dest, filter, strict: true, preservePaths: false })` with `filter` rejecting links/devices; `.unitypackage` gets the `pathname`/`asset` reassembly from `import_synty.py` lines 74–80; 7z/rar: `execFile('7z', ['l', '-slt', file])` → refuse any unsafe path, then `execFile('7z', ['x', '-y', `-o${dest}`, file])`; nested archives: one extra pass over `extracted/**/*.{zip,tgz,tar.gz,unitypackage}` then stop. Strip a single vendor wrapper folder when every file shares it. `identify(dir)`: walk, classify each file by extension and folder (`KIND_BY_EXT` from `build_collection_cards.py` plus `anim` and `ui/font`), drop lists (`.meta`, `.uasset`, `.prefab` kept as `metadata` role, `.exe|.msi|.sh|.bat` removed and listed), group a model with its textures (same stem or a `Textures/` sibling), parse `MaterialList_*.txt` and `Tilesheet.txt`, vendor markers (`License.txt` with "Kenney" and CC0 → Kenney; `SourceFiles`/`Source_Sprites` → Synty), write `hash_manifest` (`sha256  bytes  path`, sorted) to `<id>/<version>/hash-manifest.txt` and reference it from the card.

Interface sketch:

```ts
export async function unpack(src: string, dest: string, caps: { maxMembers: number; maxUnpackedMb: number; maxRatio: number }): Promise<{ files: number; nested: number; dropped: string[] }>;
export async function identify(root: string): Promise<{ vendor: 'kenney' | 'synty' | 'unknown'; license: string | null; items: Item[]; dropped: string[]; hashManifest: string }>;
export type Item = { path: string; kind: Kind; subkind?: string; companions: string[]; role: 'primary' };
```

Test scenarios:
- Given a zip with `../x`, when unpacked, then it throws naming the member and `dest` stays empty.
- Given a tgz with a symlink member, then refused.
- Given a zip containing an `.exe`, then it is dropped and listed.
- Given a nested zip, then its members are extracted once (second nesting level untouched).
- Given a Kenney folder with `License.txt`, then `vendor === 'kenney'` and `license === 'CC0-1.0'`.
- Given a model with a `Textures/colormap.png`, then the item lists it as a companion.

### U3. Cards, previews and `gm packs import`

Goal: the command that writes the collection and asset cards, `pack.json`, thumbnails and `intake.json`.

Files: Create `packages/gm-cli/src/commands/packs/import.ts`, `src/packs/cards.ts`, `src/packs/previews.ts`, `src/packs/confirm.ts`; Test `test/packs-import.test.ts` (temp library root).

Approach: `import.ts`: resolve input (dir or archive, or `--from-queue <drop_id>` reading the queue and manifest; refuse when `integrity_ok` is false); choose `root = packs/` or `inspiration/` (`--inspiration` or `kind: map` majority); `version = --version ?? manifest revision date ?? today`; copy originals, `unpack`, `identify`; `cards.ts` writes the collection card (quarantined, `NOASSERTION`, default basis `{type: 'default', uses: ['vision-input'], audience: 'private', redistribution: 'none', set_by: {role: 'intake-code'}, date}`, `processing: 'local-only'`, `collection_info` with `counts`, `hash_manifest`, `files_total`, `pack_manifest`, `creation_choice: false`), then one asset card per item: id `t1:<id>/<kebab path>@<version>`, `status: 'draft'` (`measured` when U1 filled the blocks), `source.files[]` with sha256/bytes/format/role, `describe.description` from the filename words `by: filename`, measured blocks via U1 (FBX/OBJ → `flags: ['needs-conversion']`); `previews.ts`: images → WebP thumbnail ≤ 256 px under `assets-local/previews/<sha prefix 2>/<sha16>-thumb.webp` (private vendors under `assets-local/private/previews/…`, following `analyze.py`'s `PRIVATE_VENDORS` rule), key recorded in `previews.thumb`; validate every card with `@ogm/contracts` (failures → `flags: ['needs-review']`, listed); write `pack.json`; write `intake.json` when `--from-queue` (`imported` only when `--license` or a vendor marker produced a confirmed row; else `awaiting-license`); emit `packs.import`. `confirm.ts`: `--confirm <collection-id>`: load the card, build the `license` basis from `licenseFor(--license)` (OGM-061) with `confirmed_by`, `date`, optional `decision` entry (`set_by: {role: 'admin'}`), recompute `rights` with `effectiveRights`, set `processing` from the row, status `draft|measured`, propagate to asset cards without their own `rights`, update `intake.json` to `imported`.

Interface sketch (CLI): `gm packs import <dir|archive> --id <vendor-name> [--license <id>] [--inspiration] [--version <v>] [--from-queue <drop_id>] [--json]`; `gm packs import --confirm <collection-id> --license <id> --confirmed-by <name> [--note "…"] [--decision "uses=a,b;audience=private;redistribution=none;note=…"]`.

Test scenarios:
- Given a fixture Kenney folder, when imported with `--id kenney-test`, then `packs/kenney-test/<v>/{originals,extracted,hash-manifest.txt}`, `pack.json`, a quarantined collection card and N draft asset cards that validate.
- Given `--from-queue` on a manifest with `integrity_ok: false`, then exit 2 and no files.
- Given `--confirm t1:kenney-test@<v> --license CC0-1.0 --confirmed-by kevin`, then rights equal the CC0 ceiling, status `draft`, `intake.json.status === 'imported'`.
- Given a re-import of the same input, then no card changes.

### U4. `services/intake`

Goal: the poller that closes every open queue entry.

Files: Create `services/intake/{package.json,tsconfig.json,src/main.ts,src/queue.ts,src/run.ts,src/status.ts}`; Test `test/intake.test.ts` (fake inbox).

Approach: `main.ts`: load config (`OGM_ASSETS_ROOT`, `OGM_STATE_DIR`, `OGM_INTAKE_POLL_S` default 30) through `@ogm/config`; loop: `queue.ts` reads `queue.jsonl`, open entries = those whose `<inbox>/<manifest dir>/intake.json` is missing; dedupe by `drop_id` + sorted MD5 set against `status.json.done[]` → `duplicate`; for each open entry `run.ts` spawns `gm packs import --from-queue <drop_id> --id <slug from name> --json` with `nice -n 10` (`execFile('nice', ['-n', '10', gmBin, …])`), captures the JSON result, writes `status.json` (`{updated, open, done: [{drop_id, status, collection, at}], last_error}`), emits `intake.job` events; one job at a time; errors leave no `intake.json` and back off 5 min. Logs to stdout (journal). No HTTP.

Interface sketch: `services/intake/src/main.ts` (unit `ExecStart=node services/intake/dist/main.js`, `Slice=ogm-agents.slice`, OGM-002 owns the file); `status.json` shape above (consumer OGM-017's admin route).

Test scenarios:
- Given a fake inbox with three entries (bad integrity, Kenney, unknown licence) and a stubbed `gm`, when one poll runs, then `intake.json` statuses are `blocked`, `imported`, `awaiting-license` and `status.json.done` has three rows.
- Given the Kenney entry queued twice with the same MD5s, then the second is `duplicate` without running `gm`.
- Given `gm` exits non-zero, then no `intake.json`, `last_error` set, and the entry is retried next poll.

### U5. Skill rewrite

Goal: `gm-asset-intake` keeps only the judgment steps.

Files: Modify `.claude/skills/gm-asset-intake/SKILL.md`.

Approach: keep the frontmatter and hard rules; steps become: 1 `gm packs status` (or `cat ~/.local/state/ogm/intake/status.json`) to list `awaiting-license` and `blocked`; 2 read `license_files` with `unzip -p`/`7z e -so` as today; 3 classify (SPDX or a `LicenseRef-*` row from `packages/asset-cards/data/licenses.json`); 4 ask Kevin, record his answer; 5 `gm packs import --confirm <collection> --license <id> --confirmed-by kevin [--decision …]`; 6 hand-off: `gm packs tag` (OGM-065) when it exists; 7 report one line per drop. Remove every "write pack.json by hand" and `build_catalog.py` instruction.

Test scenarios: none automated; the skill cites only commands that exist at merge (`gm packs import`, `gm assets search`); `gm packs tag` is cited as "when available (OGM-065)".

## 4. Verification

```
pnpm --filter @ogm/asset-measure test
pnpm --filter @ogm/gm-cli test -- packs
pnpm --filter @ogm/intake test
pnpm -r typecheck && pnpm -r lint
python3 -I scripts/drive-sync/test_drive_sync.py        # or scripts/py/drive-sync after OGM-009; must stay 27 OK
OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local node packages/gm-cli/dist/index.js packs import /tmp/fixture-kenney --id kenney-test --json
OGM_ASSETS_ROOT=... node packages/gm-cli/dist/index.js assets search --include-draft --collection t1:kenney-test@<v>
```

Paste into `## Local tests`: the four test summaries, the import JSON summary (items by kind, cards written, flags), the search rows, and `ls assets-local/packs/kenney-test/<v>`.

## 5. Deferred to implementation

- Thumbnail size 256 px WebP (default); private-vendor previews under `assets-local/private/previews/` (follow `analyze.py`).
- `pixel_art` heuristic thresholds (indexed PNG, or ≤ 64 colours and ≤ 512 px): tune on Tiny Dungeon and Platformer Pack; default as stated.
- Canonical clip synonym table: start from C3 §3's list plus the names found in Kenney Animated Characters and Mini Dungeon; keep as data in `clips.ts`.
- Queue slug from the drop name: kebab-case of `name` prefixed `drive-` (skill's convention) unless a vendor marker gives `kenney-`/`synty-`.
- One job at a time vs two: one (default); the taggers are the heavy part and run in OGM-065.

## 6. Scope boundaries

- Contact sheets for 3D, CLIP tagging, audio and map taggers: OGM-065.
- Blob-store import of previews, blocklist: OGM-067. Mirrors: OGM-068. Licence rows: OGM-061.
- Unit files and host install: OGM-002. Admin intake API and screen: OGM-017, OGM-079.
- FBX conversion: out until Blender exists (R87, Kevin's remind item).
- Drive listener changes: none.

## 7. Risks

- Archive libraries: `adm-zip` has had traversal CVEs; the per-entry check here is the defence, and `extractAllTo` is banned by a lint rule comment and a test. Default kept; if review prefers, `yauzl` (≈ 700 stars, below the bar, exception would need naming).
- `.unitypackage` reassembly on large Synty drops hung once (C1): single pass with `tar` streaming; cap members from the manifest.
- Kind/subkind from extensions is coarse: cards are `draft`, OGM-065 refines; search shows them only with `--include-draft`.
- OGM-009 path move: the service and tests resolve `scripts/py/drive-sync` then `scripts/drive-sync`; default order as written.
- `rig_id` collisions across vendors are by design (shared rigs are the feature); the test pins the hashing inputs, not the literal.
