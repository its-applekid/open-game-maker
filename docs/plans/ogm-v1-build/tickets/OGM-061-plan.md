# OGM-061 plan — Card migration for all 414 packs and the licence table

## 1. Problem frame

278 collection cards exist (Kenney and Synty, tagged from filename words), 128 Sidetrax cards are `draft`, and 8 packs have no card at all because `build_collection_cards.py` only knows two vendors' licence ceilings (E05-2, E05-3). Five catalog licence values are not SPDX and one script writes a rights shape the schema rejects. The fix is one licence table in TypeScript, emitted as JSON for the Python migration, applied idempotently to every pack, with `processing: local-only` for every vendor-licensed card (E05-10).

Requirements trace: R52 → every pack gets a schema-valid collection card with an SPDX or `LicenseRef-*` licence; audio and map cards keep their Python taggers untouched; 3D/2D per-asset cards stay for OGM-065.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Python tests are stdlib `unittest` run with `python3 -I` (no venv needed); every service binds `127.0.0.1` (none here); secrets only from `packages/config` names (none here); no new dependency below 1k stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/assets/build_collection_cards.py` `LICENSES` dict and `card()`: the basis entry shape and provenance map to keep; replace the dict with the emitted JSON.
- `/home/orangekid/games/open-game-maker-2000/scripts/audio/import_sidetrax.py` lines 100–130 (`INTERPRETATION_NOTE`, draft card): the Sidetrax interpretation entry to preserve verbatim.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/examples/collection-sidetrax-pack-60-battle.json`: the confirmed-Sidetrax target shape.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/test_drive_sync.py`: stdlib `unittest` with a temp tree; copy its layout for the new Python test.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C3-asset-metadata-standard.md` §5 (basis types, interpretation rules) and §9 (migration table).

## 3. Implementation units

### U1. Licence table in TypeScript and the emitted JSON

Goal: one source of truth for licence ids, ceilings, aliases and processing.

Files: Create `packages/asset-cards/src/licenses.ts`, `packages/asset-cards/data/licenses.json`, `packages/asset-cards/scripts/emit-licenses.ts`; Modify `packages/asset-cards/package.json` (script `licenses:emit`); Test `packages/asset-cards/test/licenses.test.ts`.

Approach: define `LicenseRow` and `LICENSES` with the seven rows in the ticket; `licenseFor(value)` matches `id` or any alias case-insensitively (`LimeZu-commercial` → `LicenseRef-limezu-commercial`). `toBasis(row, {ref, date})` returns a schema-valid `license` basis entry (`set_by: {role: 'intake-code'}`, `confirmed_by: 'kevin'` and `date` only when `row.confirmed`). The emit script writes `data/licenses.json` sorted by id with two-space indent so diffs are stable. The test loads the JSON and `deepEqual`s it to `LICENSES` (stale file = red test).

Interface sketch: as quoted in the ticket, plus

```ts
export function toBasis(row: LicenseRow, opts: { ref: string; date: string }): RightsBasis;  // RightsBasis from @ogm/contracts
export function processingFor(license: string, status: string): 'local-only' | 'any';         // LicenseRef-* or quarantined → local-only
```

Test scenarios:
- Given `'synty-personal'`, when `licenseFor`, then the Synty row.
- Given every row, when `toBasis` is passed to `effectiveRights([basis])`, then it equals the row's ceiling.
- Given a `LicenseRef-*` row, then `processing === 'local-only'`.
- Given `data/licenses.json` edited by hand, then the equality test fails.

### U2. `build_collection_cards.py` for every vendor, idempotent

Goal: all 414 packs get a valid collection card; re-runs are no-ops.

Files: Modify `scripts/assets/build_collection_cards.py`; Create `scripts/assets/test_build_collection_cards.py`.

Approach: load `packages/asset-cards/data/licenses.json`; `row = by_alias[m['license']]` (fail loudly on an unknown value, list it). `card(pj, tags, row)`: if `pid in tags` keep the existing `tagged` path; else `status: 'draft'` with `describe: {description: "<title> (<vendor>)"}` only (the schema requires description/objects/roles at `tagged`, not at `draft`), `provenance.describe = {by: 'filename', …}` and `flags: []`. Add `rights.processing` from `processingFor`. Add `--only GLOB`, `--dry-run`, `--report` (prints `{vendor: {written, unchanged, draft, tagged, failed}}` as one JSON line). Idempotence: load the existing card; if the new card equals it except `provenance.*.at`, keep the old `at` values and skip the write. Locks: for any `provenance[key].locked`, copy that field from the existing card. Sidetrax: keep the existing card's `describe`, `collection_info` and `interpretation` entry; replace the `license` basis with the confirmed row; recompute `status` per the C3 rule. Validation: after writing, run the validator once over all written cards (`node docs/research/v0.5/schemas/tools/validate.mjs` shim, or the `@ogm/contracts` CLI if OGM-004 exposes one) and list failures.

Interface sketch (CLI): `python3 -I scripts/assets/build_collection_cards.py [--only 'limezu-*'] [--dry-run] [--report]`.

```python
# scripts/assets/build_collection_cards.py (new helpers)
def license_row(value: str, table: dict) -> dict            # by id or alias; raises KeyError with the pack id
def basis_from_row(row: dict, ref: str, date: str) -> dict   # the schema's rightsBasis entry
def status_for(describe: dict) -> str                        # "tagged" when description, objects and roles present, else "draft"
def unchanged(old: dict, new: dict) -> bool                   # equal ignoring provenance.*.at
```

Test scenarios:
- Given a temp library with one Kenney, one Synty, one LimeZu, one Sidetrax pack, when run, then four cards exist and each validates.
- Given a second run, then no file changes (`os.stat().st_mtime_ns` equal).
- Given a card with `provenance['describe.pov_fit'].locked = true` and a different `pov_fit`, when run, then the locked value survives.
- Given a pack with `license: 'made-up'`, when run, then the script exits non-zero naming the pack and writes nothing for it.
- Given a Sidetrax card with description/objects/roles, then status `tagged`; without, `draft`.

Execution note: characterization first: run `--dry-run --report` on the real library before changing the writer, paste the baseline counts, then make the change.

### U3. `install_itch_pack.py` rights shape

Goal: the installer writes rights the schema accepts.

Files: Modify `scripts/assets/install_itch_pack.py`; Test: a case in `scripts/assets/test_build_collection_cards.py` (same file, `TestInstallItch`), driving the script's `usage_rights` builder extracted into a function `rights_for(license_id, ref, title)`.

Approach: replace lines 362–368 with `rights_for()` returning `{"uses": [...], "audience": "private", "redistribution": "none", "attribution": title, "processing": "local-only", "basis": [{"type": "license", "license": license_id, "ref": f"{ver}/extracted/License.txt", "uses": [...], "audience": "private", "redistribution": "none", "attribution": title, "set_by": {"role": "intake-code"}, "date": ver, "note": "Kevin bought it on itch.io and asked to install it."}]}`; `--license-id` defaults to `LicenseRef-itch-custom`; the `license` written to `pack.json` is the id's alias for the catalog (`custom-commercial-ok` stays as an alias in the table). `redistribution: none` is the strict reading for purchased itch packs; Kevin can widen through a confirmed row later.

Test scenarios:
- Given `rights_for('LicenseRef-itch-custom', 'x/License.txt', 'UFO pack')`, when validated as a collection card's `rights`, then schema-valid and `effectiveRights` matches.

### U4. The run on this machine and the report

Goal: the library is migrated and indexed.

Files: none new; evidence in the PR.

Approach: `python3 -I scripts/assets/build_collection_cards.py --dry-run --report` → `python3 -I scripts/assets/build_collection_cards.py --report` → `python3 -I scripts/assets/build_catalog.py` → `OGM_ASSETS_ROOT=assets-local gm assets facets --collections` and `gm assets search --include-draft --collection t1:limezu-modern-interiors@<ver>`. Nothing under `assets-local/` is committed.

Test scenarios:
- Given the migrated library, when `cards.index.json` is rebuilt, then `errors` is empty and `collections` has 414 pack entries plus the ProFantasy inspiration collection.

## 4. Verification

```
pnpm --filter @ogm/asset-cards licenses:emit && git diff --exit-code packages/asset-cards/data/licenses.json
pnpm --filter @ogm/asset-cards test
pnpm -r typecheck && pnpm -r lint
python3 -I scripts/assets/test_build_collection_cards.py -v
python3 -I scripts/assets/build_collection_cards.py --dry-run --report
python3 -I scripts/assets/build_collection_cards.py --report
python3 -I scripts/assets/build_catalog.py
OGM_ASSETS_ROOT=assets-local node packages/gm-cli/dist/index.js assets facets --collections --json | wc -l
```

Paste into `## Local tests`: the report JSON (per vendor counts), the facets line count (414 + 1), the validator summary ("all checks passed" or the failure list), and the Python test summary.

## 5. Deferred to implementation

- The exact `uses` for LimeZu, ansimuz and hattap: read each pack's licence file; default rows in the ticket; narrow if the text says less, never widen beyond the text.
- Whether `hattap-ufo-asset-pack` (`custom-commercial-ok`) gets its own `LicenseRef-hattap` row or the itch-custom row: default itch-custom with `ref` = its `License.txt`.
- Where the Python script finds `licenses.json`: repo-relative path (default) vs `OGM_LICENSES_JSON` env override for tests (add the override).
- Whether to keep `scripts/assets/data/collection_tags.jsonl` rows for the 8 packs empty or add title-derived rows: keep empty (no invented tags).

## 6. Scope boundaries

- Per-asset cards, contact sheets, CLIP: OGM-065. New imports and drops: OGM-064. Mirrors: OGM-068.
- Schema, `processing` field, validator port: OGM-004. Index and search: OGM-060.
- `pack.json` rewrites, moving originals, deleting scripts: out (originals rule; architecture keeps `scripts/assets/*.py`).

## 7. Risks

- The validator path changes under OGM-004 (shim at `docs/research/v0.5/schemas/tools/validate.mjs`): default, call the shim; if removed, call `node packages/contracts/dist/cli.js` or whatever OGM-004 ships and note it.
- A vendor licence file contradicts the row (for example forbids modification): default, keep the pack `quarantined` with `flags: ['license-unknown']` and list it for Kevin; do not guess.
- Sidetrax status flips 128 cards at once: expected; the report shows the before/after counts.
- `build_catalog.py` reads `pack.json` `license` unchanged, so the catalog still shows old values: accepted, the catalog is a pack list; the index is the truth (C3 §9).
