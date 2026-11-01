# OGM-067 plan — Hash blocklist feed and map layout search

## 1. Problem frame

The commit service must refuse any byte of a non-redistributable asset in a creator's repo, including previews and variants (C3 §5, §7), but the only hash list today is ProFantasy's CC3+ tree and the publish step strips Synty by filename (E05-14). The blob store is a filesystem store that must map `assets-local/previews` and `private` prefixes without moving originals (E05-18, D-BUCKET). Map inspiration is searched by structure through layout specs that require `derive-layout` (C3 §10). This ticket ships the three operator commands: the blocklist feed, the explicit index command with preview import, and `gm maps search`.

Requirements trace: R53 (blocklist half) → `gm packs blocklist` feeds the commit service one sorted hash file. R83 → tabletop maps are inspiration collections searchable by structure; images never ship (the feed guarantees it at the commit boundary); adaptation and reachability are the skill's (skills lane).

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest; no Playwright; no service; env names `OGM_ASSETS_ROOT`, `OGM_BLOB_ROOT`, `OGM_BLOCKLIST_FILE` through `packages/config` (OGM-003), values never logged; no new dependencies; PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/maps/hash_manifest.py`: the line format, streaming 1 MiB hashing, sort, symlink skip; port the walk to TypeScript and consume its output file verbatim.
- `/home/orangekid/games/open-game-maker-2000/scripts/audio/analyze.py` `PRIVATE_VENDORS` and the `private/` preview rule: which prefixes are private.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs` lines 87–108 and the `spec-source-allows-derive-layout` check: the rights gate and graph metrics, imported from `@ogm/contracts` (OGM-004).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/examples/layout-profantasy-example-dungeon.json`: `tags.computed` keys (`room_count`, `connection_count`, `loop_count`, `entrance_count`, `dead_end_count`, `secret_count`, `level_change_count`, `longest_path_rooms`, `total_area_cells`, `size_class`) and `tags.judged` (`map_type`, `themes`, `flow`, `difficulty_flow`, `suits`).
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B6-asset-storage-cdn.md` §6 "Required V1 interfaces" (`BlobStore.put/head`), as implemented by OGM-005 in `packages/blob-store`.
- OGM-060's `packages/gm-cli/src/commands/assets/search.ts` (at pickup): command shape, `ctx.emit`.

## 3. Implementation units

### U1. `gm packs blocklist`

Goal: one sorted feed of every non-redistributable byte.

Files: Create `packages/gm-cli/src/commands/packs/blocklist.ts`, `src/packs/hashwalk.ts`; Test `test/blocklist.test.ts`, fixture `test/fixtures/library-rights/` (collection `t1:free-pack@1` CC0 with two files; collection `t1:private-maps@1` with `redistribution: 'none'`, two files under `inspiration/private-maps/1/extracted/`, one preview under `private/previews/ab/abcd-thumb.webp` referenced by a card, one `derived/private-maps/variant.png`, and `collection_info.hash_manifest: 'private/hash-manifests/private-maps-v1.txt'` with two extra lines).

Approach: load the index (`loadIndex(assetsRoot)`); `targets = collections.filter(c => c.resolved.rights.redistribution === 'none')`; for each: roots = `packs/<pack>/<ver>/{originals,extracted}` or `inspiration/<id>/<ver>/**` (from `collection_info.pack_manifest` dir and `version`), `derived/<pack>/**`, every `previews.*` key of the collection and of every asset card in it (resolve the bucket key to `assets-local/<key>`), and the `hash_manifest` file whose lines are copied with `manifest/<collection>/` prefixed to their path column. `hashwalk.ts`: `walk(root)` skipping symlinks, `sha256File(path)` streaming; cache `assets-local/private/blocklist/cache.json` keyed by relative path with `{mtimeMs, size, sha256}`. Emit lines `${sha}  ${bytes}  ${relPath}`, sort with `Buffer.compare` semantics (`localeCompare` is wrong), dedupe by `(sha, path)`, write atomically (`.part` then rename) to `--out` (default `assets-local/private/blocklist/redistribution-none.txt`), print `{collections, files, unique_hashes, out}`; emit `assets.blocklist`.

Interface sketch (CLI): `gm packs blocklist [--out <file>] [--no-cache] [--json]`.

```ts
// packages/gm-cli/src/packs/hashwalk.ts
export async function* walk(root: string): AsyncGenerator<{ abs: string; rel: string; size: number; mtimeMs: number }>;  // skips symlinks and sockets
export async function sha256File(abs: string): Promise<string>;
export function formatLine(sha: string, bytes: number, rel: string): string;   // `${sha}  ${bytes}  ${rel}`
export function sortLines(lines: string[]): string[];                          // bytewise, unique
```

Test scenarios:
- Given the fixture, when run, then the feed has the two private files, the preview, the variant and the two manifest lines (6 lines), none of the CC0 files, sorted and matching the grammar.
- Given a second run, then `sha256File` is not called (spy) and the output is byte-identical.
- Given `--out` in a read-only dir, then exit 1 with the path.
- Given a preview key that does not exist on disk, then a warning line and the rest proceeds.

Execution note: write the grammar/sort test first; sorting with `localeCompare` is the classic defect.

### U2. `gm packs index` with `--families` and `--import-previews`

Goal: an explicit index rebuild and the blob-store import of previews and private manifests.

Files: Create `packages/gm-cli/src/commands/packs/index.ts`; Test `test/packs-index.test.ts` (uses `FsBlobStore` on a temp `OGM_BLOB_ROOT`).

Approach: `buildIndex(assetsRoot)` then print `{cards, collections, errors}` (errors listed one per line unless `--json`); `--families`: `computeCoverage` for each family from `@ogm/asset-cards` and rewrite `data/style-families.json` through OGM-066's writer (`writeFamilies`), printing the table; `--import-previews`: `store = new FsBlobStore(process.env.OGM_BLOB_ROOT)` (exit 2 if unset); walk `assets-local/previews/**`, `assets-local/private/previews/**`, `assets-local/private/hash-manifests/**`; for each file compute sha256, `await store.head(hash) || await store.put(bytes, mime)`; build `keyToHash: Record<bucketKey, 'sha256:…'>`; for every index entry with `previews.*` keys set `entry.previews.blob[k] = keyToHash[key]` and `entry.visibility = key.startsWith('private/') ? 'private' : 'library'`; write the index again (index only; cards on disk untouched, asserted by test); print `{put, skipped, mapped}`; emit `assets.index`. Previews are small (≤ 256 px WebP), so one pass over ≈ 5k files is seconds.

Interface sketch (CLI): `gm packs index [--families] [--import-previews] [--json]`.

Test scenarios:
- Given the fixture library and an empty blob root, when `--import-previews`, then two blobs exist under `blobs/sha256/`, the index entry for the private card has `previews.blob.thumb` and `visibility: 'private'`, and `collection.card.json` files have unchanged mtimes.
- Given a second run, then `put` is not called.
- Given `--families` on the fixture, then the family JSON's coverage changes and the table prints.
- Given an invalid card, then it is listed in errors and exit stays 0 (index built) unless `--strict`.

### U3. Layout specs loader and `gm maps search`

Goal: structural search over layout specs with the `derive-layout` gate.

Files: Create `packages/gm-cli/src/maps/specs.ts`, `packages/gm-cli/src/commands/maps/search.ts`; Test `test/maps-search.test.ts`, fixtures: the example spec and its source card (copied from the schema examples) plus a second spec whose source card has `rights.uses: ['vision-input']`, and a third spec with `room_count: 7`.

Approach: `loadSpecs(assetsRoot)`: read `inspiration/*/layouts/**/*.layout.json` (and `*.json` whose `schema` starts with `ogm.map-layout-spec`), validate with `@ogm/contracts` (`validateLayoutSpec` + graph metrics check from OGM-004), join `source.card_id` to the index, keep `allowed = card.resolved.rights.uses.includes('derive-layout')`. `parseQuery(words, flags)`: numbers like `3-5 rooms` → `rooms: [3,5]`; `one loop|loop|loops` → `loops ≥ 1` (or `--loops N` exact); `secret` → `secret ≥ 1`; size words → `size_class`; `map_type` enum words (`crypt` is both a type and a theme; match either); remaining words match `tags.judged.themes` and `notes`. Rank: filter matches, then score by number of satisfied soft terms, tie by `extraction.confidence` desc. Rows: `id  map_type  rooms  loops  secrets  size  flow  thumb` where `thumb` is the source card's `previews.thumb` key. `--cards` fallback: when no specs match, search map cards (`kind: inspiration`, `map.usable === 'yes'`) by `map.map_type` and `describe`, rows marked `card`. Hidden count line on stderr: `hidden: N specs (source lacks derive-layout)`. `--json` prints the spec objects. Emit `maps.search`.

Interface sketch (CLI): `gm maps search "<words>" [--rooms A-B] [--loops N] [--secret] [--size small|medium|large|huge] [--type <map_type>] [--cards] [--limit 10] [--json]`.

```ts
// packages/gm-cli/src/maps/specs.ts
export type LoadedSpec = { spec: MapLayoutSpec; path: string; sourceCard?: ResolvedCard; allowed: boolean; valid: boolean; errors: string[] };
export async function loadSpecs(assetsRoot: string, index: CardIndex): Promise<LoadedSpec[]>;
export function parseQuery(words: string[], flags: { rooms?: string; loops?: number; secret?: boolean; size?: string; type?: string }): SpecQuery;
export function matchSpec(s: LoadedSpec, q: SpecQuery): { hard: boolean; score: number };
```

Execution note: write `parseQuery` tests first from the C3 §10 example query ("small crypt 3-5 rooms one loop secret door" → `{size: 'small', type: 'crypt', rooms: [3, 5], loops: 1, secret: 1}`) so the parser is pinned before any filesystem code.

Test scenarios:
- Given the fixtures, when `gm maps search "small crypt one loop secret door"`, then the example spec is the only row and stderr says `hidden: 1`.
- Given `--rooms 3-5`, then the 7-room spec is excluded.
- Given `--type cave`, then no rows and exit 0 with `no matches`.
- Given a spec whose `tags.computed.loop_count` disagrees with its graph, then it is reported invalid and excluded.
- Given `--cards` and no specs, then usable map cards with `map_type: dungeon` print with the `card` marker.

## 4. Verification

```
pnpm --filter @ogm/gm-cli test -- packs maps
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/gm-cli build
OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local node packages/gm-cli/dist/index.js packs blocklist --json
wc -l /home/orangekid/games/open-game-maker-2000/assets-local/private/blocklist/redistribution-none.txt /home/orangekid/games/open-game-maker-2000/assets-local/private/hash-manifests/profantasy-cc3-v1.txt
OGM_ASSETS_ROOT=... OGM_BLOB_ROOT=$HOME/.local/share/ogm/blobs node packages/gm-cli/dist/index.js packs index --import-previews --json
OGM_ASSETS_ROOT=... node packages/gm-cli/dist/index.js maps search "small crypt one loop secret door"
```

Paste into `## Local tests`: the test summary, the blocklist JSON (collections, files, unique hashes) and the two `wc -l` numbers (the feed must be ≥ the manifest), the import JSON (`put`, `skipped`, `mapped`), and the maps search output (expected `no matches` plus `hidden: N` until Kevin grants `derive-layout` on the ProFantasy collection).

## 5. Deferred to implementation

- Feed default path `assets-local/private/blocklist/redistribution-none.txt` (default) vs `$OGM_DATA_DIR/blocklist.txt`; the env name `OGM_BLOCKLIST_FILE` (OGM-003) carries whichever is chosen.
- Whether `derived/` variants are matched by pack id directory (default) or by `related: derived-from` links in cards (both when present).
- Soft-term scoring weights for map search; default 1 point per matched term.
- `--cards` fallback automatic when zero specs match (default off; explicit flag).
- Mime detection for `put`: by extension (`webp`, `png`, `txt`), default.

## 6. Scope boundaries

- Commit service and gate: OGM-035/039. Blob store, signed URLs, GC: OGM-005. Preview-serving routes: OGM-010/017; the families route uses `previews.blob`: OGM-066.
- Layout-spec extraction, `gm-map-inspiration` adaptation and reachability: deferred / skills lane.
- `hash_manifest.py` changes: none. Import and tagging: OGM-064/065.

## 7. Risks

- The feed grows with every private pack (Sidetrax 128 packs of audio, Synty 13): tens of thousands of lines; the consumer loads a `Set` of hashes (OGM-039); the mtime cache keeps re-runs fast. Default accepted.
- OGM-005's `BlobStore` signature differs from B6's sketch at pickup: adapt to the merged interface; do not fork.
- `gm maps search` returns nothing on this instance until `derive-layout` is granted: expected and stated; the fixture proves the behaviour.
- A preview referenced by a card but missing on disk (cards written by earlier runs): warn, continue; counted in the JSON.
