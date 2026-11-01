# OGM-020 — Engine contracts: implementation plan

## 1. Problem frame

Seven tickets (OGM-021, 022, 026, 028, 040, 063, 090) start the moment a reviewed contract file exists (architecture §3 rule). Today there is no TypeScript in the repo (E12-1) and the message set lives in two untyped prototype dialects (E12-4). This ticket writes the four contract files, their Zod 4 schemas, emitted JSON Schemas and golden fixtures, following the aiur-contracts layout. Nothing here runs at game time.

**Requirements trace.** R40: the versioned envelope, `HostToGame`/`GameToHost` unions, Zod schemas, emitted JSON Schema and fixtures (`bridge.ts`). R42: `GmTestHooks` with the D-HOOKS names plus the T10 additions (`game.ts`). R45: `Tier`, `AssetManifest` with logical ids mapped to per-tier files so the loader never derives names (`assets.ts`).

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/README.md`: the "schema and golden fixture with the same `<surface>.vN` stem" rule, "clients ignore unknown IDs and additive fields; a breaking change adds v2 beside v1". Copy the README table shape (stem, producer, contract) for the four new stems.
- `/home/orangekid/github/aiur/packages/aiur-contracts/scripts/generate.mjs`: one `outputs[]` entry per contract family; here the direction is reversed (Zod → JSON Schema), but keep the `--check` drift mode.
- `/home/orangekid/github/aiur/packages/aiur-contracts/test/contracts.test.mjs`: fixture-against-schema loop; port to Vitest.
- `packages/contracts/src/index.ts` as OGM-004 leaves it: append-only barrel, one `export * from './<family>'` line per family (D-WRITE-SURFACES).
- `docs/research/v0.5/schemas/tools/validate.mjs:30-57` (moved by OGM-004): the style of "code checks the schema cannot express", used here for `replyTo` and payload-size assertions.
- `prototypes/title-city/city.js:877-958` and `prototypes/ui-v0/site/js/dungeon.js:861-865`: the hook names the fixtures must spell (`marks` as `[string, number][]`, `tick`, `__frame`, `__info` → `renderInfo`).

## 3. Implementation units

### U1 — `bridge.ts`: envelope, unions, `Patch`
- **Goal:** one Zod discriminated union per direction, generic `envelope(t, payload)` helper, `SDK_PROTOCOL`.
- **Files:** Create `packages/contracts/src/bridge.ts`; Test `packages/contracts/test/bridge.test.ts`.
- **Approach:** `const envelope = <T extends string, P extends z.ZodTypeAny>(t: T, payload: P) => z.object({ v: z.literal(1), id: z.string().min(1).max(64), t: z.literal(t), payload, replyTo: z.string().max(64).optional() })`. Build `hostToGameSchema = z.discriminatedUnion('t', [...])` with every member of the T04 §4 quote except the four `mp.*` members, plus the `net.*` and `phase` members from T07 §4.3 (payload `data` as `z.string()` base64, max 87,382 chars = 64 KiB encoded). Define `patchSchema` (T08 §4 shape), `inputFrameSchema` (`{seq; tick; axes: number[]; buttons: number}`) and `phaseSchema` locally with a comment naming T07 §4.1 as the owner. Export inferred types `HostToGame`, `GameToHost`, `Patch`, `InputFrame`, `Phase`. `test.*` request members and `test.result` carry `replyTo` by convention; document in a JSDoc block on each.
- **Interface sketch:** as quoted in the ticket; plus `export const BRIDGE_MAX_BYTES = 262_144; export const BRIDGE_MAX_MSGS_PER_S = 120;` (constants OGM-021 reads, so the numbers live once).
- **Tests:** Given `bridge-hello.v1.json`, when parsed with `hostToGameSchema`, then it succeeds and `payload.tier === 'mobile'`. Given `{t:'mp.snapshot'}`, when parsed, then it fails at `t`. Given an envelope with `v: 2`, when parsed, then it fails at `v`. Given `net.snapshot` with `data` longer than the cap, when parsed, then it fails at `payload.data`. Given `design.apply` with a patch `op: 'move'`, when parsed, then it fails at `payload.patches[0].op`.
- **Execution note:** write the negative fixtures first; they define what "unknown-type drop" means for OGM-021.

### U2 — `game.ts`: module, instance, hooks, manifest
- **Goal:** `GameManifest`, `ControlDecl`, `Widget`, `Selector` as Zod schemas (they are data the host renders); `GameModule`, `GameInstance`, `HostApi`, `GmTestHooks`, `MultiplayerHooks` as TypeScript interfaces (they carry functions).
- **Files:** Create `packages/contracts/src/game.ts`; Test `packages/contracts/test/game.test.ts`.
- **Approach:** `widgetSchema` = A4 §6's union (`slider`, `toggle`, `choice`, `color`, `count` with `semantics: 'param'|'instances'` from B7 §3, `text` with `maxLength`, `place`, `path`, `tilemap`, `rule`, `custom`). `controlDeclSchema` = `{ id: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/, label ≤ 200, icon?, help? ≤ 200, group?, scope: z.union([z.enum(['global','instance','prefab']), z.object({selector})]), path: JSON pointer string, widget, default: z.unknown(), tier?: 'basic'|'advanced' }`. `gameManifestSchema` per the ticket's amendment 3, with `sdk: z.string()` semver range and `overrides: { aliases: z.record(z.string()), retired: z.array(z.string()) }` defaulting to empty. Interfaces: paste the T04 §4 quote, rename `mp` → `net`, add `migrateOverride?` to `GameModule`, add `test: GmTestHooks` registration slot on `HostApi` (`host.test.register(hooks)`), extend `GmTestHooks` with `probes`, `events`, `seed`, and the widened `renderInfo`.
- **Interface sketch:**
  ```ts
  export interface GmTestHooks {
    ready: boolean; marks: [string, number][];
    advanceTime(ms: number): void; renderAt(ms: number): void;
    renderGameToText(): { coords: string; tick: number; mode: 'play' | 'edit'; state: unknown; players: unknown[]; truncated?: true };
    renderInfo(): { calls: number; triangles: number; frameMs: number; textureBytes: number; backend: string };
    hitTest(nx: number, ny: number): boolean; setSeed(seed: number): void; seed(): number; inject(frame: ActionFrame): void;
    probes(): Record<string, number | string | boolean>; events(since: number): { t: number; type: string; data?: unknown }[];
  }
  ```
- **Tests:** Given `game-manifest.v1.json` (a two-control platformer manifest, iso view, two palette items), when parsed, then it succeeds. Given a control id `EnemyColor`, when parsed, then it fails (ids are stable dotted lowercase). Given a manifest whose `tools` includes `'lasso'`, when parsed, then it fails. Type test: `expectTypeOf<GmTestHooks>().toHaveProperty('renderAt')` for all twelve members.

### U3 — `input.ts`: action frames and rigs
- **Goal:** `actionFrameSchema`, `ActionValue`, `ViewId`, `CameraRig` interface, `Vec3`, `Insets`.
- **Files:** Create `packages/contracts/src/input.ts`; Test `packages/contracts/test/input.test.ts`.
- **Approach:** `actionValueSchema = z.union([z.boolean(), z.number(), z.object({x: z.number(), y: z.number()})])`; `actionFrameSchema = z.object({ playerIndex: z.number().int().min(0).max(7), tick: z.number().int().min(0), source: z.enum([...]), actions: z.record(z.string().max(32), actionValueSchema).refine(≤ 32 keys) })`. `viewIdSchema = z.enum(['iso','topdown','side','follow','fps','orbit','fixed'])`. `CameraRig` stays an interface (functions); its `inputMapping` sub-object gets a Zod schema `rigInputMappingSchema` so manifests can declare overrides later.
- **Interface sketch:** as quoted in the ticket.
- **Tests:** Given `input-action-frame.v1.json` with a stick `{x: 0.3, y: -1}` and `jump: true`, when parsed, then it succeeds. Given `playerIndex: 8`, when parsed, then it fails (ceiling 8 players, D-ROOMS). Given 33 actions, when parsed, then it fails.

### U4 — `assets.ts`: manifest and lockfile
- **Goal:** `tierSchema`, `assetManifestSchema` (C4 §5.2), `assetsLockSchema` (T05 §4) in a marked tail.
- **Files:** Create `packages/contracts/src/assets.ts`; Test `packages/contracts/test/assets.test.ts`.
- **Approach:** `assetManifestSchema = z.object({ version: z.literal(1), built: z.string().datetime().optional(), tiers: z.array(tierSchema).min(1), files: z.record(fileEntry), assets: z.record(assetEntry) }).superRefine(every assets[*].file value names a key of files)`; `assetEntry.source` optional (C4 has it, T04's type omits it; keep optional). `AssetLoader` and `pickTier` are declarations only (`export interface AssetLoader`, `export type PickTier = () => Tier`); OGM-026 implements. Tail section: `// ---- lockfile (OGM-062 edits below this line) ----` then `assetsLockSchema` with `family`, `pov`, `rights.uses[]` as plain strings.
- **Interface sketch:** as quoted in the ticket (T04 §4 assets block, T05 §4 lock block).
- **Tests:** Given `assets-manifest.v1.json` (the C4 §5.2 example verbatim), when parsed, then it succeeds. Given an asset whose `file.mobile` names a file missing from `files`, when parsed, then it fails with the asset id in the path. Given `assets-lock.v1.json` with one `t1:` and one `t3:` id, when parsed, then it succeeds.

### U5 — Emit, fixtures, barrel, README
- **Goal:** `schemas/{bridge,game,input,assets}.v1.json` emitted from Zod; fixtures validated by both Zod and ajv; barrel lines; README rows.
- **Files:** Modify `packages/contracts/src/index.ts` (+4 lines), the emit script OGM-004 created (add four inputs), `packages/contracts/README.md` (four table rows); Create the fixtures listed in the ticket; Test `packages/contracts/test/fixtures.test.ts`.
- **Approach:** `z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' })` per family; `$id` = `https://ogm.local/contracts/<family>.v1.json`. The fixtures test loads every `fixtures/*.v1.json`, picks the schema by stem prefix, asserts Zod parse and ajv (2020-12, `strict: false`) validation agree; every `fixtures/negative/*.json` must fail both. `generate --check` re-emits to memory and diffs against disk.
- **Tests:** Given all fixtures, when the loop runs, then each positive passes both validators and each negative fails both. Given a schema edited without re-emitting, when `generate --check` runs, then it exits 1.
- **Execution note:** run `generate` before `test`; CI runs `generate --check` so a stale emit fails the build.

## 4. Verification

```sh
pnpm install
pnpm --filter @ogm/contracts generate
pnpm --filter @ogm/contracts generate --check
pnpm --filter @ogm/contracts test
pnpm -r typecheck
pnpm lint
```

Paste into `## Local tests`: policy (`full`), tested head SHA, base `main`, selection (`@ogm/contracts` unit + generate check), the five commands and their pass counts (expect ≥ 24 tests, 0 skipped).

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest; Playwright is not needed here; no service; secrets never touched; Zod 4.6.x and ajv 8.20.x pinned at install (both far above 1k stars); PR first line `Closes #<issue>`; `## Local tests` section as above.

## 5. Deferred to implementation

- Exact emit script name and flags from OGM-004: default `scripts/generate.mjs --check`.
- Whether `payload` objects use `.passthrough()` or `.strip()`: default `.passthrough()` (clients ignore unknown fields) with `.strict()` only on the envelope.
- Base64 cap arithmetic for `net.snapshot.data`: default `Math.ceil(65_536 / 3) * 4 = 87,384` chars.
- Whether `GameManifest.capabilities` is an open `string[]` or an enum: default open strings with a `KNOWN_CAPABILITY_IDS` constant (A4 §5 table) exported for linting, copying aiur-contracts' `KNOWN_CAPABILITY_IDS` pattern.
- `coords` note format in `renderGameToText`: default a free string such as `"x right, y up, z toward camera; units metres"`.

## 6. Scope boundaries

- No runtime: no port, no origin check, no size enforcement (OGM-021); no clock, RNG or hook implementation (OGM-022).
- No `Transaction`, `WorkingSet`, `ReapplyReport`, `Branch`, `Release`, `SaveSlot` (OGM-040 writes `design-log.ts` and siblings and re-exports `Patch` from here).
- No room protocol file (OGM-050 `room.ts`); `InputFrame`/`Phase` are copied shapes with the T07 locus in a comment.
- No lockfile semantics, no `gm assets use` (OGM-062), no manifest production (OGM-063), no verify report (OGM-090).
- No audio API types beyond the `audio.relay` message (OGM-027 defines its module API in code).

## 7. Risks

- **Zod 4 `toJSONSchema` cannot represent `z.function` or refinements** → keep functions out of Zod (interfaces only) and mirror `superRefine` checks as tests, not schema; default taken.
- **Two writers on `assets.ts`** (this ticket, then OGM-062) → marked tail section; OGM-062 touches nothing above the marker; default taken.
- **`net.*` vs `mp.*`** could be reopened by a reader of T04 §4 → negative fixture `bridge-unknown-t` uses `mp.snapshot` so the choice is enforced by a test.
- **`GameManifest` grows during OGM-075/OGM-091** → additive fields only in v1; a renamed field means `game.v2.json`.
- **64 KiB base64 snapshot cap is a guess at phone wire limits** (T07 risk) → constant in one place, OGM-054 measures and may lower it.
