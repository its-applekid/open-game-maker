# OGM-068 plan — Tier-2 mirrors (gm packs sync)

## 1. Problem frame

B11's tier 2 is "online free sources"; the live ones need API keys and network the sandbox and the budget rule forbid (E05-16, D-SBX, R14). The mirror mode (git or npm, pinned, imported through the normal importer, searched locally with a `t2` label) needs no key and no agent network, so V1 ships only that. This ticket is the operator command that fetches a pinned mirror, maps its licences per item where the source is mixed (LPC), and hands off to `gm packs import`.

Requirements trace: R57 → tier-2 sources ship as pinned mirrors via `gm packs sync`; live API adapters and paid generators are out; tier 3 is OGM-062's `register`.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest; no Playwright; no service; no secrets; no new dependencies (`git` and `npm` are host binaries; CSV parsing is hand-rolled for the five-column file; `tar` from OGM-064); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B11-asset-pack-library.md` §4.6 table (sources, access, licence per source) and §4.7 "Tier 2 adapters: Mirror" and "Per-adapter license mapping" (LPC `CREDITS.csv`; game-icons author table; "any asset without a machine-readable license is dropped").
- `/home/orangekid/games/open-game-maker-2000/scripts/assets/fetch_polypizza_bundle.py` and `fetch_itch_free.py` (verified): `sources.json` provenance convention and the "downloads are untrusted data" rule in docstrings; keep the convention for `~/Downloads/ogm-mirrors/<id>/<pin>/sources.json`.
- `/home/orangekid/games/open-game-maker-2000/scripts/assets/install_itch_pack.py`: `originals/` + `extracted/` + `pack.json` layout that `gm packs import` produces (OGM-064).
- `/home/orangekid/games/open-game-maker-2000/third_party/pixelfx/PIN` and `NOTICE.md` (verified): the repo's existing pin convention (commit hash + review date); mirror pins follow it in `mirrors.ts` comments.
- OGM-064's `packages/gm-cli/src/commands/packs/import.ts` and `src/packs/unpack.ts` (at pickup): the import call and the safe tar extraction.
- OGM-060's command shape and `ctx.emit`.

## 3. Implementation units

### U1. Mirror table and guards

Goal: the pinned table and the refusal rules.

Files: Create `packages/gm-cli/src/packs/mirrors.ts`; Test `test/mirrors.test.ts`.

Approach: `MIRRORS` with four entries: `kaykit` (`kind: 'git'`, `source: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventurers'` plus a `subpaths` list, or one entry per KayKit pack the Executor chooses; pin = a commit hash recorded at the first run, `license: {mode: 'single', spdx: 'CC0-1.0', ref: 'LICENSE.txt'}`), `lpc` (`https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator`, `subpaths: ['spritesheets']`, `license: {mode: 'per-item', mapper: 'lpc-credits-csv'}`), `game-icons` (`https://github.com/game-icons/icons`, `license: {mode: 'per-item', mapper: 'game-icons-authors'}` with default `CC-BY-3.0` and attribution = the author path segment), `fontsource` (`kind: 'npm'`, `source: '@fontsource/<font>'`, pin = version; `mapper: 'fontsource-metadata'` reading the package's `metadata.json`/`LICENSE` → `OFL-1.1` | `Apache-2.0` | drop). Pins are literal strings in the file with a comment `# reviewed <date>`; `--pin` overrides for a new version. Guards: `GM_JOB` set or `OGM_SANDBOX=1` → exit 2 "gm packs sync is an operator command"; unknown mirror → exit 2 listing ids.

Interface sketch: as quoted in the ticket; `export function findMirror(id: string): Mirror | undefined` (handles `fontsource:<font>`).

Test scenarios:
- Given `--list`, then four rows with pins.
- Given `findMirror('fontsource:press-start-2p')`, then an npm mirror with source `@fontsource/press-start-2p`.
- Given `GM_JOB=j_1`, when any sync runs, then exit 2.

### U2. Fetchers: git and npm, pinned and verified

Goal: a verified checkout outside the repo without executing anything.

Files: Create `src/packs/git.ts`, `src/packs/npm.ts`; Test `test/packs-sync.test.ts` (creates a local bare repo with `git init --bare` and one commit via a work tree in a temp dir; creates a fake `.tgz` with `tar`).

Approach: `cloneAtPin(url, pin, dir)`: `git clone --depth 1 --no-checkout url dir`, `git -C dir fetch --depth 1 origin <pin>`, `git -C dir checkout --detach FETCH_HEAD` (or `<pin>` when it is a tag), then `git -C dir rev-parse HEAD` must equal the resolved pin (for tags, `git rev-parse <pin>^{commit}`); on mismatch delete nothing, exit 2 with both SHAs; `git` runs with `GIT_TERMINAL_PROMPT=0` and no credentials (public repos only); a fresh clone has no hooks, so nothing from the mirror executes. `packNpm(name, version, dir)`: `npm pack <name>@<version> --pack-destination dir --ignore-scripts`, then OGM-064's `unpack(tgz, dir/extracted, caps)`; verify `package.json.version === version`. Write `sources.json` `{mirror, source, pin, fetched, files}`.

Interface sketch:

```ts
export async function cloneAtPin(url: string, pin: string, dir: string): Promise<{ sha: string }>;
export async function packNpm(name: string, version: string, dir: string): Promise<{ tgz: string; extracted: string }>;
```

Test scenarios:
- Given the local bare repo and its commit SHA, when cloned at that pin, then `sha` equals it and the work tree has the file.
- Given a wrong pin, then exit 2 with expected/actual.
- Given a fake tgz at version `1.2.3`, when packed (spy on `execFile` to return the fixture), then extracted and version verified; given `1.2.4` in `package.json`, then exit 2.

### U3. Licence mappers

Goal: per-item SPDX and attribution for mixed-licence mirrors.

Files: Create `src/packs/credits-csv.ts`, `src/packs/mappers.ts`; Test `test/credits-csv.test.ts`, `test/mappers.test.ts`.

Approach: `parseLpcCredits(text)`: the CSV has a header `filename,notes,authors,licenses,urls`; licences are a comma- or newline-separated list inside one quoted field; map tokens `CC0` → `CC0-1.0`, `CC-BY 3.0`/`CC-BY-3.0` → `CC-BY-3.0`, `CC-BY 4.0` → `CC-BY-4.0`, `CC-BY-SA 3.0` → `CC-BY-SA-3.0`, `CC-BY-SA 4.0` → `CC-BY-SA-4.0`, `OGA-BY 3.0` → `OGA-BY-3.0`, `GPL 3.0`/`GPL 2.0` → `GPL-3.0-only`/`GPL-2.0-only`; an item with several licences keeps the most permissive kept one (CC0 > OGA-BY > CC-BY > CC-BY-SA); SA and GPL are dropped unless `includeSa`; unknown → dropped with reason `unmapped license "<token>"`. `gameIconsMap(root)`: every `icons/**/<author>/<icon>.svg` → `CC-BY-3.0`, attribution `<author> (game-icons.net)`; authors listed in the repo's licence file as CC0 (parsed from `LICENSE`/`README` lines like "<author>: CC0") → `CC0-1.0`, `attribution: null`. `fontsourceMap(pkgDir)`: `metadata.json.license` or `LICENSE` first line → `OFL-1.1` | `Apache-2.0`; else drop. Output: the `--license-map` JSON `Record<path, {license, attribution, dropped?}>`.

Interface sketch:

```ts
export function parseLpcCredits(csv: string, o: { includeSa: boolean }): Record<string, { license: string; attribution: string | null; dropped?: string }>;
export function gameIconsMap(root: string): Promise<Record<string, { license: string; attribution: string | null }>>;
export function fontsourceMap(pkgDir: string): Promise<{ license: string | null; attribution: string | null }>;
```

Test scenarios:
- Given a 6-row CSV (CC0, CC-BY-3.0, CC-BY-SA-3.0, GPL-3.0, OGA-BY-3.0, `Weird License`), when parsed with defaults, then four mapped and two dropped with reasons; with `includeSa`, the SA row maps.
- Given an item listing `CC-BY-SA 3.0, CC-BY 3.0`, then `CC-BY-3.0` (most permissive kept).
- Given a game-icons fixture tree with two authors, then both map to CC-BY-3.0 with author attribution.

### U4. `gm packs sync` and the two `import` flags

Goal: the command end to end.

Files: Create `src/commands/packs/sync.ts`; Modify `src/commands/packs/import.ts` (`--tier 1|2` → id prefix `t<tier>:`; `--license-map <file>` → per-item `rights` narrowing/attribution and `dropped` handling in `cards.ts`); Test `test/packs-sync.test.ts` (end to end against the local fixture repo with `gm packs import` spied, plus one real import into a temp library).

Approach: `sync <mirror> [--pin] [--dest] [--dry-run] [--include-sa] [--confirmed-by <name>] [--json]`: guards (U1); `dest = --dest ?? ~/Downloads/ogm-mirrors/<id>/<pin>`; `--dry-run` prints the fetch and import commands and exits 0; fetch (U2); build the licence map (U3) when `per-item`; write `sources.json`; call the import module in-process (`runImport({ dir: <dest>/<subpath>, id: <mirror id>, version: pin, tier: 2, license: single spdx or the ceiling of the kept per-item licences (`CC-BY-3.0` for LPC/game-icons by default), licenseMap, confirmedBy })`; the import's collection card gets `collection_info.origin: 'mirror'` and `source: {type: 'git'|'npm', url, pin}` in `pack.json`; print the import report (items by kind, dropped count with reasons) and emit `packs.sync`. `--confirmed-by` is required for a real run (the operator confirms the licence reading; C3 §5 `confirmed_by` names a human).

Interface sketch (CLI): `gm packs sync <kaykit|lpc|game-icons|fontsource:<font>> [--pin <ref>] [--dest <dir>] [--dry-run] [--include-sa] --confirmed-by <name> [--json]`; `gm packs sync --list`.

Test scenarios:
- Given the fixture repo registered as a test mirror (`GM_MIRRORS_FILE` override pointing at a test table), when synced with `--confirmed-by test`, then `gm packs import` receives `--tier 2`, the id `t2:<id>@<sha>` and a licence map, and the temp library has a collection card with `origin: 'mirror'` and per-item rights where mapped.
- Given `--dry-run`, then no `git` call (spy) and the printed plan names the pin.
- Given a map with a dropped item, then the item is absent from `extracted/` and listed in the report.
- Given no `--confirmed-by`, then exit 2.

## 4. Verification

```
pnpm --filter @ogm/gm-cli test -- sync credits mirrors
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/gm-cli build
node packages/gm-cli/dist/index.js packs sync --list
node packages/gm-cli/dist/index.js packs sync kaykit --dry-run
OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local node packages/gm-cli/dist/index.js packs sync kaykit --confirmed-by kevin --json   # Executor, network, free
OGM_ASSETS_ROOT=... node packages/gm-cli/dist/index.js assets search knight --tier 2 --include-draft
```

Paste into `## Local tests`: the test summary (no network in tests), the `--list` table, the dry-run plan, and, from the Executor's one real run, the import report JSON and the `t2:` search row.

## 5. Deferred to implementation

- Which KayKit packs: start with Character Pack Adventurers and Dungeon Remastered (CC0 per their `LICENSE.txt`); pins recorded at the first run.
- LPC ceiling when per-item licences differ: collection `license` = most restrictive kept (`CC-BY-3.0`), items override to CC0 where the CSV says so (C3 §5 "mixed-license sets").
- Download root `~/Downloads/ogm-mirrors/` (matches the fetchers' `~/Downloads/<source>/<pack>/` habit) vs `$OGM_DATA_DIR/mirrors`; default the former.
- Whether `game-icons` imports all 4,000+ SVGs or a curated `subpaths` list: all (they are small), default.
- Fontsource fonts to sync first: `press-start-2p`, `silkscreen`, `pixelify-sans` (OFL), chosen by the Executor.

## 6. Scope boundaries

- Live adapters, keys, sandbox egress: out of V1 (R57, R14, D-SBX).
- Import, measurement, previews: OGM-064 (two flags added here). Tagging: OGM-065. Credits rendering: OGM-062. Licence table rows: OGM-061.
- Download-button sites (Kenney, Quaternius, itch): `gm-pack-scout` and the Python fetchers, unchanged.

## 7. Risks

- Upstream repo moves or force-pushes: the pin check refuses a mismatch; the fix is a reviewed pin change in `mirrors.ts`.
- LPC `CREDITS.csv` format drift: the parser tolerates quoted multi-line fields and unknown columns; unknown licences drop items rather than guessing.
- game-icons' CC0 author list is prose, not data: default everything to CC-BY-3.0 with attribution (always safe); CC0 only where the parser finds an explicit line.
- Large clones (game-icons ≈ 100 MB): `--depth 1`; downloads are outside the repo and not backed up.
- `--confirmed-by` semantics: the operator confirms the licence reading of a public SPDX file; recorded like any tier-1 confirmation (C3 §5).
