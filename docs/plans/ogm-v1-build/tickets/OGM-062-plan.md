# OGM-062 plan — Lockfile, gm assets use/register/why, gm check assets, credits

## 1. Problem frame

Nothing today records which library assets a game uses or enforces their rights; the only "enforcement" is a prototype deploy script deleting `synty-*` files by name (E05-14). C2 §10 and C3 §5 require code enforcement at use, build and publish, with refusals that name the asset and the rule. This ticket ships the committed `assets.lock.json` (the rights source of truth), the three commands that write and explain it, the credits file, and `gm check assets`, which `gm check` (OGM-093), publish (OGM-045), forks (OGM-048) and the commit gate (OGM-039) rely on.

Requirements trace: R53 → `gm assets use` writes `assets.lock.json` and `CREDITS.md`; `gm check assets` enforces rights at build and publish; the blocklist half of R53 is OGM-067.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest; no Playwright here; no service (binds nothing); no secrets; no new dependency below 1k stars (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/schemas/tools/validate.mjs` lines 64–86: one named check per line with a `cond` and a message; `rules.ts` mirrors this as data.
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B11-asset-pack-library.md` §4.4 and §4.7 (`use`, `register`, `list`, `why` rows): behaviour and refusal wording ("a refusal gives the reason and CC0 substitutes").
- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.5/C3-asset-metadata-standard.md` §5 "Enforcement": the exact rules for use/build/publish.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/tools/deploy.sh` line 6: the behaviour being replaced (Synty never public).
- OGM-060's `packages/gm-cli/src/commands/assets/search.ts` (at pickup): command file shape, `ctx.emit`, exit-code helpers.
- OGM-035's `packages/contracts/src/commit.ts` (at pickup): `BoundaryVerdict` to copy the `rights` reason shape from.

## 3. Implementation units

### U1. `AssetsLock` contract

Goal: the lockfile type, schema and fixture every consumer copies.

Files: Modify `packages/contracts/src/assets.ts` (append), `packages/contracts/src/index.ts` (one export line); Create `packages/contracts/fixtures/assets.lock.json`, `packages/contracts/schemas/assets-lock.v1.json` (emitted); Test `packages/contracts/test/assets-lock.test.ts`.

Approach: Zod 4 (the version OGM-004 pinned) `AssetsLockSchema` exactly as the T05 §4 shape: `version: z.literal(1)`, `family: StyleFamilyId`, `pov: PovId`, `assets: z.array(LockEntry)` with refinements: ids match the schema's `assetId` pattern, sorted ascending, no duplicates, `rights.redistribution !== 'none'`, `path` relative without `..`. `StyleFamilyId`, `PovId`, `Use` reuse the enums OGM-004 emitted from the card schema (`$defs/vocab`). Emit JSON Schema with the package's existing emit script.

Interface sketch: the quoted `AssetsLock` type plus `export const AssetsLockSchema: z.ZodType<AssetsLock>` and `export type LockEntry = AssetsLock['assets'][number]`.

Test scenarios:
- Given the fixture, when parsed, then ok.
- Given an entry with `redistribution: 'none'`, then the parse fails with that path.
- Given two entries out of order, then fails.
- Given `path: '../x'`, then fails.

### U2. Lock I/O, rules and credits

Goal: shared helpers so `use` and `check` cannot drift.

Files: Create `packages/gm-cli/src/lock.ts`, `src/rules.ts`, `src/credits.ts`; Test `test/lock.test.ts`, `test/rules.test.ts`, `test/credits.test.ts`.

Approach: `readLock(cwd)` returns `null` when absent, throws with the Zod error list when invalid; `writeLock` sorts by id, writes with two-space indent and a trailing newline; `upsert(lock, entry)` replaces by id. `rules.ts`: `type Refusal = { code: 'rights'; rule: 'needs-in-game' | 'placeholder-only' | 'no-redistribution' | 'quarantined' | 'rejected' | 'family-mismatch' | 'private-in-public' | 'stale-rights' | 'missing-file' | 'sha-mismatch' | 'unknown-id'; id: string; detail: string }`; `refusalsForUse(card, lock, opts: {placeholder, exception})` and `refusalsForCheck(entry, card, file, opts: {publish, visibility})` return arrays. Family rule: `card.resolved.style_family ∈ {lock.family, 'any'}` else `family-mismatch` unless `exception` (then an event, no refusal). `credits.ts`: group entries by `license`, one bullet per distinct `attribution` (skip `null`), header `# Credits`, deterministic order; CC0 entries get a single "CC0 assets from: <collections>" line.

Interface sketch:

```ts
export function refusalsForUse(card: ResolvedCard, lock: AssetsLock | null, o: { placeholder: boolean; exception?: string }): Refusal[];
export function refusalsForCheck(e: LockEntry, card: ResolvedCard | undefined, file: { exists: boolean; sha256?: string }, o: { publish: boolean; visibility: 'public' | 'private' }): Refusal[];
export function renderCredits(lock: AssetsLock): string;
```

Test scenarios:
- Given a card whose effective uses lack `in-game` but include `placeholder`, when `placeholder: false`, then `needs-in-game`; when true, none.
- Given `redistribution: 'none'`, then `no-redistribution` regardless of flags.
- Given lock `family: 'pixel-art'` and card `chunky-low-poly`, then `family-mismatch`; with `exception`, none.
- Given `publish: true, visibility: 'public'` and `audience: 'private'`, then `private-in-public`.
- Given an entry whose `rights` differ from the card's resolved rights, then `stale-rights`.
- Given two entries with the same attribution, when rendered, then one credit line.

Execution note: write `rules.test.ts` first from the C3 §5 enforcement list; the commands are thin wrappers.

### U3. `gm assets use`, `register`, `why`

Goal: the three write/explain commands.

Files: Create `packages/gm-cli/src/commands/assets/use.ts`, `register.ts`, `why.ts`; Test `test/assets-use.test.ts` (temp game repo + fixture library).

Approach: `use`: parse ids (and `-f picks.txt`, one id per line, `#` comments); load index; for each id compute refusals; if any and not `--partial`, print each refusal as `<id>  <rule>  <detail>. Try: gm assets why <id>` and exit 2; else copy `source.files[]` from `<assetsRoot>/packs/<collection>/<version>/extracted/<path>` (collection folder and version from the collection card's `collection_info.pack_manifest`/`version`) to `<dest>/<kind>/<collection-name>/<basename>`, sha256 each file after the copy, write the entry `{id, sha256: primary file, path: primary path, license, rights: resolved, added}`, write the lock and `CREDITS.md`, emit `assets.use {ids, refused}`. A missing lock is created with `family`/`pov` from `--family`/`--pov` flags or exit 2 asking for them (OGM-091 `gm new` writes the initial lock). `register <path> --made-by-agent [--from id...]`: path must exist inside the repo; id `t3:<gameId>/<kebab path without ext>` where `gameId` comes from `.gm/game.json` (OGM-091) or `--game`; rights = intersection of the sources' resolved rights via `effectiveRights`-style min rules (uses ∩, audience min, redistribution min, attribution concatenated) or `{uses: all, audience: public, redistribution: free, attribution: null}` when no `--from`; `derived_from` set. `why <id>`: print the resolved rights line, one line per basis entry, then three verdict lines (`use in draft: ok|refused <rule>`, `use in published: …`, `public repo: …`) using the OGM-061 licence row `note` when present.

Interface sketch (CLI): `gm assets use <id...> [-f picks.txt] [--dest assets] [--placeholder] [--exception "<why>"] [--partial] [--refresh] [--family f --pov p]`; `gm assets register <path> --made-by-agent [--from <id>...] [--game <id>]`; `gm assets why <id>`.

Test scenarios:
- Given the orc id, when `use`, then `assets/model/kenney-mini-dungeon/character-orc.glb` exists, the lock has one sorted entry with the file's sha256, `CREDITS.md` mentions CC0.
- Given a Synty torch id in a lock with `family: 'detailed-low-poly'`, when `use`, then ok with `audience: private`.
- Given the ProFantasy example map id, when `use`, then exit 2 and the message names `in-game`.
- Given `register assets/t3/door.glb --from <orc id> --from <synty id>`, then rights are private/in-build (the min).
- Given `why <synty id>`, then output includes `LicenseRef-synty-personal` and `public repo: refused private-in-public`.

### U4. `gm check assets`

Goal: the check that build, publish, forks and the gate call.

Files: Create `packages/gm-cli/src/commands/check/assets.ts`; Test `test/check-assets.test.ts`.

Approach: read lock (missing lock with no `assets/` dir → exit 0 "no assets"; missing lock with files under `assets/` → exit 1 `unknown-id` per file); load index; for each entry compute `refusalsForCheck` with the file's current sha256; with `--publish` also refuse `placeholder` entries and `private-in-public` when `--repo-visibility public` (default: read `.gm/game.json` `visibility`, else `private`); print one line per refusal; `--json` prints `{allowed, reasons: [{code: 'rights', path, detail: "<id> <rule> <detail>"}]}`; exit 1 when any; emit `assets.check {publish, violations}`. Files under `assets/` not in the lock are listed as `unknown-id` (tier-3 output must be registered).

Interface sketch (CLI): `gm check assets [--publish] [--repo-visibility public|private] [--json]`.

Test scenarios:
- Given the lock from U3, when `check assets`, then exit 0.
- Given the copied GLB is modified, then exit 1 `sha-mismatch`.
- Given the lock's `rights.audience` is hand-edited to `public` for the Synty entry, then exit 1 `stale-rights`.
- Given `--publish --repo-visibility public` with the Synty entry, then exit 1 `private-in-public` naming the id and rule (AE5) and `--json` has `allowed: false`.
- Given a stray `assets/extra.png`, then exit 1 `unknown-id`.

## 4. Verification

```
pnpm --filter @ogm/contracts test
pnpm --filter @ogm/gm-cli test
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/gm-cli build
cd /tmp/game && OGM_ASSETS_ROOT=/home/orangekid/games/open-game-maker-2000/assets-local gm assets use t1:kenney-mini-dungeon/character-orc@2.0 --family chunky-low-poly --pov iso && gm check assets && gm check assets --publish --repo-visibility public; echo $?
```

Paste into `## Local tests`: test summaries, the lock JSON written in the manual run, `CREDITS.md`, and the exit codes (0, 0 for CC0; then the Synty run showing exit 1 with the AE5 line).

## 5. Deferred to implementation

- Copy layout under `--dest`: `assets/<kind>/<collection-name>/<basename>` (default) vs flat `assets/<kind>/<basename>`; keep the collection segment to avoid Kenney colormap name clashes (gm-assets skill note).
- Tier-3 default rights when no `--from`: all uses / public / free (default) vs the game's visibility; note in `why`.
- Whether `use` copies companion textures referenced by a GLB when the card's `source.files[]` lists them with `role: texture` (default yes) or only the primary.
- Where the game id comes from: `.gm/game.json` written by OGM-091 (default) or `--game`.
- `--partial` semantics: write entries for accepted ids and exit 2 listing refusals (default) vs exit 0.

## 6. Scope boundaries

- Commit service, boundary check run, publish gate: OGM-035, OGM-039 (they consume the lock and the verdict shape).
- Build tiers and `assets/manifest.json`: OGM-063. Hash blocklist: OGM-067.
- Search, index, `list`: OGM-060. Family file and search default: OGM-066. `AssetManifest`: OGM-020.
- Publish/fork flows and screens: OGM-045, OGM-048, OGM-077.

## 7. Risks

- `packages/contracts/src/assets.ts` collides with OGM-020: append-only, one section each; if OGM-020 already added a lockfile type, replace it with the T05 shape (owner) and say so in both PRs. Default: this ticket's shape wins.
- Index staleness between `use` and `check`: the check compares against the index at check time, so a rights change in the library fails the lock until `--refresh`; that is the intended "rights source of truth with the index as authority" behaviour.
- Game-repo ids before OGM-091 exists: `--game` flag covers tests; default documented.
- Large copies (Synty FBX packs) are not in V1 families (E05-5); `use` on an FBX-only card refuses with `needs-conversion` when the card carries that flag (OGM-064 sets it).
