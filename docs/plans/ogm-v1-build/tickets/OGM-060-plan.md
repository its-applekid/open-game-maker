# OGM-060 plan — gm CLI skeleton and asset search over cards

## 1. Problem frame

Every V1 skill tells an agent to run `gm assets search …`, and nothing answers (E05-20, E10-16). The library holds 414 packs with collection cards and 4,906 per-asset cards (audio, maps) under `assets-local/`, validated by a rights engine that OGM-004 moves into `@ogm/contracts`. This ticket ships the `gm` binary with a command-per-file registry that every lane registers into, and `@ogm/asset-cards`, which turns the sparse cards into one resolved, rights-aware index that `search`, `facets`, `info`, `sheet` and `list` read.

Requirements trace: R50 → the `gm` binary, namespaces as directories, the conventions other lanes copy. R51 → the index resolves cards with the C3 schema and the OGM-004 rights engine; search filters by effective rights.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright is not used here; every service binds `127.0.0.1` (no service in this ticket); secrets only from `packages/config` names (none needed here); no new dependency below 1k GitHub stars without naming the exception; PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/package.json` and `tsconfig.json`: ESM package with `exports`, `tsc` build to `dist`, `strict`, `NodeNext`; copy the shape, replace `node --test` with Vitest.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs` lines 58–63 (`resolvedRights`): the one-level inheritance rule to extend to every inheritable field.
- `/home/orangekid/games/open-game-maker-2000/scripts/assets/build_catalog.py`: how packs and inspiration collections are enumerated (`packs/*/pack.json`, `inspiration/*/collection.card.json`); the index walks the same roots but reads cards.
- `/home/orangekid/games/open-game-maker-2000/scripts/maps/tag_maps.py` lines 459–475: JSON-lines progress printing with `flush=True`; `gm` prints the same way when `--json` is set.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B11-asset-pack-library.md` §4.7 "Token savers": compact rows, `--limit 10`, `--json`, `--fields`, `gm help` ≤ 15 lines, errors as cause plus next command.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C3-asset-metadata-standard.md` §8 (inheritance) and §10 (default filters, facets, rig queries, output).

## 3. Implementation units

### U1. `@ogm/asset-cards`: index builder with inheritance resolution

Goal: one JSON index of resolved, validated cards for the whole library.

Files: Create `packages/asset-cards/package.json`, `tsconfig.json`, `src/index.ts`, `src/walk.ts`, `src/resolve.ts`, `src/types.ts`; Test `packages/asset-cards/test/index.test.ts`, `test/fixtures/library/**` (copies of the 16 examples arranged as `packs/<id>/collection.card.json` and `packs/<id>/cards/<path>.card.json`, plus `inspiration/profantasy-cartographers-annual/...`, plus `test/fixtures/invalid/*.json`).

Approach: `walk(root)` yields `{path, doc}` for `packs/*/collection.card.json`, `packs/*/cards/**/*.card.json`, `inspiration/*/collection.card.json`, `inspiration/*/cards/**/*.card.json`. `validateCard` from `@ogm/contracts` (OGM-004's port of `validate.mjs`) rejects invalid docs into `index.errors[]`. `resolve(card, collections)` copies `license`, `rights`, `describe.style_family`, `describe.pov_fit`, `describe.settings` and (when the asset has none) `describe.environments` from the collection when absent, marking `provenance[field] = {by: 'collection'}`; `rights` resolution is `effectiveRights(collectionBasis ∪ assetBasis)` from `@ogm/contracts`, never a copy. Write `assets-local/index/cards.index.json` with `{version: 1, built, vocab, cards, collections, errors}`. `isStale(root)`: true when the index is missing or any card `mtime` exceeds the index's. Node 24 `fs.promises`, no glob library (`fs.readdir` with `recursive: true`).

Interface sketch:

```ts
export type CardIndex = { version: 1; built: string; vocab: string; cards: ResolvedCard[]; collections: Record<string, ResolvedCard>; errors: { path: string; errors: string[] }[] };
export async function buildIndex(root: string): Promise<CardIndex>;
export async function loadIndex(root: string, opts?: { rebuildIfStale?: boolean }): Promise<CardIndex>;
export function resolve(card: AssetCard, collections: Record<string, AssetCard>): ResolvedCard;
```

Test scenarios:
- Given the fixture library, when `buildIndex` runs, then 16 cards index and `errors` is empty.
- Given an asset card without `rights`, when resolved, then its `resolved.rights` equals the collection's and provenance says `collection`.
- Given an asset card whose own basis adds `in-game` to a collection without it, when resolved, then `in-game` is absent (never widens).
- Given an invalid card in `invalid/`, when indexed, then it appears in `errors` and the build still succeeds.
- Given an index older than one card, when `loadIndex({rebuildIfStale: true})`, then it rebuilds.

Execution note: write the inheritance tests first; they pin C3 §8 before any search code exists.

### U2. `@ogm/asset-cards`: search, facets, info

Goal: rights-aware query functions over the index.

Files: Create `src/search.ts`, `src/facets.ts`, `src/query.ts`; Test `test/search.test.ts`, `test/facets.test.ts`.

Approach: `SearchQuery = { words: string[]; kind?: string; subkind?: string; family?: string; pov?: string; use?: Use; rigId?: string; sameRigAs?: string; includeDraft?: boolean; tier?: 1|2|3; collection?: string; limit: number }`. Default filters (C3 §10): `resolved.rights.uses ∋ (use ?? 'in-game')`; `status ∈ {tagged, reviewed}` for `audio` and `inspiration`, `status ∈ {measured, tagged, reviewed}` plus `draft` when `includeDraft` for `model|sprite|texture|ui|vfx|anim` (E05-3); `card_type === 'asset'` unless `--collections`; `kind === 'inspiration'` never matches an `in-game` search; `quarantined` never matches. Text score: tokenize `title + describe.description + objects + keywords + source.files[].path`, AND-match on words, score = weighted term hits (title 3, objects 2, rest 1), tie-break `reviewed` > `tagged` > `measured` > `draft`, then id. `facets` counts kind/subkind, collection, environments, settings, roles, moods, materials, condition, style_family, pov_fit, rights.uses, status; `--proposed` counts `proposed_tags[].tag`. No search library in V1 (MiniSearch can replace the scorer later; note in Deferred).

Interface sketch:

```ts
export function search(index: CardIndex, q: SearchQuery): ResolvedCard[];
export function facets(index: CardIndex, q: Omit<SearchQuery, 'limit'>, opts?: { proposed?: boolean }): Record<string, Record<string, number>>;
export function info(index: CardIndex, ids: string[]): (ResolvedCard | { id: string; missing: true })[];
export function formatRow(c: ResolvedCard): string;   // "id  kind/subkind  status  family  title"
```

Test scenarios:
- Given the fixture, when searching `orc`, then the Mini Dungeon orc is first.
- Given a search with default use, when a card is `inspiration/map` with `derive-layout` only, then it is excluded; with `--use derive-layout` it is included.
- Given a quarantined collection, when searching anything, then none of its cards appear even with `--include-draft`.
- Given `--same-rig-as <orc id>`, when searched, then only cards whose `rig.rig_id` equals the orc's return.
- Given `facets --proposed`, when a card has `proposed_tags`, then the tag is counted.

### U3. `@ogm/gm-cli`: binary, registry, context, events

Goal: a `gm` binary whose commands are discovered by directory scan, with the shared conventions.

Files: Create `packages/gm-cli/package.json` (`"bin": {"gm": "dist/index.js"}`), `tsconfig.json`, `src/index.ts`, `src/command.ts`, `src/registry.ts`, `src/context.ts`, `src/events.ts`, `src/help.ts`, `src/flags.ts`; Test `test/registry.test.ts`, `test/context.test.ts`, `test/events.test.ts`.

Approach: `registry.ts` reads `src/commands/*/` (at build time `dist/commands/*/`), imports each file and collects `command.name` (`"<ns> <cmd>"`); duplicate names throw at startup. `flags.ts` uses `node:util` `parseArgs` (Node 24) with the shared flags `--json`, `--limit`, `--fields`, `--help` merged with the command's. `context.ts`: `assetsRoot = process.env.OGM_ASSETS_ROOT ?? findUp(cwd, 'assets-local/catalog.json')`; `out()` writes rows or JSON lines; `emit()` appends to `$GM_EVENTS_FILE` only when set, with `job_id = process.env.GM_JOB ?? null`. Exit codes per the contract; usage errors print one line `<cause>. Try: gm help <cmd>` and exit 2. When stdout is not a TTY: no colour, no progress. `gm help` lists namespaces; `gm help <cmd>` prints summary, flags and one example (≤ 15 lines).

Interface sketch:

```ts
export type GmCommand = { name: string; summary: string; flags: FlagSpec; run(ctx: GmContext, args: string[], flags: Record<string, unknown>): Promise<number> };
export function emit(event: string, payload: unknown): void;  // {"event":"assets.search","job_id":"j_1","ts":"…","payload":{…}}
```

Test scenarios:
- Given a temp `commands/zzz/ping.ts`, when the registry scans, then `gm zzz ping` runs.
- Given two commands with the same name, when scanning, then startup fails naming both files.
- Given no `OGM_ASSETS_ROOT` and no `assets-local/catalog.json` above cwd, when an assets command runs, then exit 2 and the message names `OGM_ASSETS_ROOT`.
- Given `GM_EVENTS_FILE` set, when `gm assets search x` runs, then one JSONL line with `event: "assets.search"` is appended; unset, nothing is written.

### U4. `gm assets search|facets|info|list|sheet`

Goal: the five asset commands over U2.

Files: Create `src/commands/assets/search.ts`, `facets.ts`, `info.ts`, `list.ts`, `sheet.ts`; Test `test/assets.test.ts` (runs the built CLI against the fixture library with `OGM_ASSETS_ROOT`).

Approach: `search` maps flags to `SearchQuery`, prints `formatRow` rows or `--json` resolved cards, limit 10. `facets` prints `facet  value  count` rows sorted by count. `info <id...>` prints one line each: `id  kind  bounds/duration  tris  rig  license  uses`. `list` reads `./assets.lock.json` if present (shape from OGM-062; this ticket only reads `assets[].id|path|license`) and prints rows, else "no assets.lock.json here" exit 0. `sheet <id...> [--out]` resolves each card's `previews.thumb` or `previews.sheet` to a file under `assetsRoot` (bucket key → `assets-local/<key>`), composes a labelled grid with `sharp` (≥ 30k stars) at 256 px cells, max 24, writes PNG; cards without previews get a grey cell with the id. Every command calls `ctx.emit('assets.<cmd>', {args, hits})`.

Interface sketch (CLI): `gm assets search <words> [--kind model/prop] [--family chunky-low-poly] [--pov iso] [--use in-game] [--rig-id r] [--same-rig-as id] [--include-draft] [--tier 1|2] [--collection id] [--limit 10] [--json]`; `gm assets facets [filters] [--proposed]`; `gm assets info <id...>`; `gm assets sheet <id...> [--out sheet.png]`; `gm assets list [--json]`.

Test scenarios:
- Given the fixture, when `gm assets search orc --json`, then stdout is JSON lines parseable one per hit.
- Given `--limit 2`, when 5 cards match, then 2 rows print.
- Given `gm assets sheet <two ids> --out /tmp/x/sheet.png`, then the file exists and is a PNG wider than tall.
- Given no lockfile, when `gm assets list`, then exit 0 with the one-line notice.

## 4. Verification

```
pnpm install
pnpm --filter @ogm/asset-cards test
pnpm --filter @ogm/gm-cli test
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/gm-cli build
OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local node packages/gm-cli/dist/index.js assets facets --kind model
OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local node packages/gm-cli/dist/index.js assets search orc --limit 3
```

Paste into `## Local tests`: the two test summaries, the facets row count (≥ 52 collections with `model` kind), the three search rows (orc first), and the index build time and card count from `assets-local/index/cards.index.json` (expected ≈ 4,906 asset cards + 407 collection cards + index errors list, which should be empty after OGM-061 and may list the 8 uncarded packs before it).

## 5. Deferred to implementation

- Text scorer: hand-rolled token weighting (default) vs MiniSearch (≥ 10k stars); switch only if the fixture ranking tests need it.
- Index file location: `assets-local/index/cards.index.json` (default) vs `$OGM_DATA_DIR/index`; keep it under the library so the sandbox can be given one read-only root.
- `--fields` on `--json`: project the listed top-level keys (default) or dotted paths.
- Whether `gm assets info` prints audio fields (duration, loudness) or model fields by kind: print the kind-specific set, blank where absent (default).
- `sheet` cell size 256 px and max 24 (B11 §4.7); labels use the id's path segment.

## 6. Scope boundaries

- Lockfile writes, `use`, `register`, `why`, `gm check assets`: OGM-062.
- Licence table and card migration: OGM-061. Family default and `style-families.json`: OGM-066.
- `gm packs index` command, preview import into the blob store, `gm maps search`: OGM-067.
- `gm packs import|tag|sync`: OGM-064, OGM-065, OGM-068.
- Other namespaces: OGM-081 (`chat`, `checkpoint`), OGM-090 (`run`, `shot`, `perf`), OGM-091 (`new`, `skills`), OGM-093 (`check`, `test`), OGM-094 (`docs`).
- Rights engine and schemas: OGM-004; this ticket imports them.

## 7. Risks

- OGM-004's exported names differ from `effectiveRights`/`validateCard`: adapt at pickup; do not fork the engine. Default: a thin `src/contracts.ts` re-export so the rest of the package has one import point.
- The 128 Sidetrax `draft` collection cards and 8 uncarded packs make `errors`/missing non-empty until OGM-061: accepted; the index skips them and the ticket's acceptance uses counts that hold either way.
- 4,906 cards parse in under a few seconds on this host (E05-13 scale); if the index build exceeds 10 s, cache per-file validation by mtime (default: no cache).
- `sharp` pulls a native binary; it is already the pick for OGM-063 and OGM-064, so one dependency serves three tickets.
- Hot write surface: other lanes add `src/commands/<ns>/` directories in parallel; `pnpm-lock.yaml` conflicts are resolved by re-running `pnpm install` (D-WRITE-SURFACES).
