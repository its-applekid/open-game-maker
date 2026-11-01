# OGM-040 plan — Design-log core package

## 1. Problem frame

Every creator edit becomes a transaction against a JSON design doc keyed by stable ids; the per-branch append-only log is the truth and everything else (working set, snapshots, watcher state, merges) is derived from it (D-LOG). This ticket builds the pure library that defines those records and the three operations every later ticket calls: apply/invert, replay across fork points, reduce to a working set. It also publishes the lane's contract files so consumers can start the moment this merges. No I/O, no server, no UI.

Requirements trace: R31 → `Transaction {branchId, rev, baseRev, leaseToken, actor, kind, label, commands, patches, inverse}` as a Zod schema; entities keyed by stable host-minted ids enforced in `validate.ts`; append-only log semantics expressed as `replay`/`reduce` over an ordered list; working set as `reduce(log)`.

## 2. Patterns to follow

- `/home/orangekid/github/aiur/packages/aiur-contracts/README.md` and `test/contracts.test.mjs` (verified): schema + golden fixture per surface, "clients ignore unknown fields, a breaking change adds v2 beside v1". Copy the layout and the fixture test shape, not the code.
- `packages/contracts/src/bridge.ts` (OGM-020, refresh at pickup): Zod-first schema with `z.infer` types, `toJSONSchema` emit into `schemas/<family>.v1.json`. Copy its export style exactly so the barrel stays one line per family.
- `docs/research/v0.5/schemas/tools/validate.mjs` (verified at 9508c1c): negative fixtures as tests (`test-negative.sh`). Copy the idea: four negative fixtures for this family.
- `prototypes/ui-v0/site/js/dungeon.js` lines 60–79 (verified): the shape agents write by default (array of objects, counter ids). Use as the negative example in `validate.test.ts`, never as code.

Repository conventions (state in the PR): pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright is not needed here; no service; secrets not involved; no new dependency below 1k GitHub stars (`immer` 29k, `fast-check` 4k, `zod` as pinned by OGM-004); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Contract files

Goal: the T08 §4 types exist as Zod schemas in four files with emitted JSON Schema and fixtures.

Files:
- Create `packages/contracts/src/design-log.ts`, `packages/contracts/src/branches.ts`, `packages/contracts/src/releases.ts`, `packages/contracts/src/saves.ts`.
- Modify `packages/contracts/src/index.ts` (append four `export * from './…'` lines; nothing else).
- Create `packages/contracts/fixtures/design-log.v1.json`, `branches.v1.json`, `releases.v1.json`, `saves.v1.json`; emitted `packages/contracts/schemas/<family>.v1.json` via the package's existing generate script.
- Test `packages/contracts/test/design-lane.test.ts`.

Approach: transcribe the ticket's quoted TypeScript field by field; `OverrideKey` is `z.string().regex(/^[^@]+@[^@]+$/)`; `payload` in `SaveRevision` is `z.instanceof(Uint8Array)` in TS and `{type:'string', contentEncoding:'base64'}` in the emitted schema (document the mapping in a comment); `Patch.path` is `z.array(z.union([z.string(), z.number()]))`. Do not add fields. `Entity.props`, `globals` and `value` stay `z.unknown()`/`z.record`. Export a `DesignDocSchema.strict()` variant for the API. Fixtures: one valid document per type plus the negatives (array entities, missing `baseRev`, `kind: 'voice'`, `slotId: '4'`).

Interface sketch: `export const TransactionSchema = z.object({...}); export type Transaction = z.infer<typeof TransactionSchema>;` repeated per type; barrel line `export * from './design-log';`.

Test scenarios:
- Given each fixture, when validated against its schema, then it passes (one `it` per fixture, generated from the fixture file).
- Given the four negative fixtures, when validated, then each fails with the named path.
- Given the emitted `design-log.v1.json`, when compared to a fresh emit, then byte-equal (guards drift; run in `check`).

Execution note: write the negative fixtures first; they fail until the schemas exist.

### U2 — Canonical JSON and apply/invert

Goal: deterministic serialization and Immer-backed patch generation with exact inverses.

Files: Create `packages/design-log/package.json` (`@ogm/design-log`, deps `immer`, `@ogm/contracts`), `tsconfig.json`, `src/index.ts`, `src/types.ts` (re-exports from contracts), `src/canonical.ts`, `src/apply.ts`; Test `packages/design-log/test/apply.test.ts`, `test/canonical.test.ts`.

Approach: `canonical(value): string` sorts object keys recursively, serializes without whitespace, rejects `undefined`, `NaN`, functions (throws `CanonicalError`); `sha256Canonical(value)` wraps `node:crypto`. `enablePatches()` at module load. `makeTransaction(doc, commands, meta)`: run each `EditorCommand` through a reducer in `produceWithPatches` (`set` writes `globals[control]` or `entities[target].props[control]`; `reset` deletes the override key's value by writing the base value supplied in `meta.baseValues`; `invoke` is recorded in `commands` and produces no patches in V1), return `{patches, inverse, doc}`. `apply(doc, patches)` = Immer `applyPatches`; `invert(tx)` returns `tx.inverse`. Paths are arrays (Immer form); the JSON-pointer projection for rooms is a one-liner `toPointer(path)` exported for OGM-050.

Interface sketch:
```ts
export function canonical(v: unknown): string;
export function sha256Canonical(v: unknown): string;
export function makeTransaction(doc: DesignDoc, commands: EditorCommand[], meta: { baseValues?: Record<OverrideKey, unknown> }): { doc: DesignDoc; patches: Patch[]; inverse: Patch[] };
export function apply(doc: DesignDoc, patches: Patch[]): DesignDoc;
export function toPointer(path: Patch['path']): string;   // '/entities/e_01/props/locked'
```

Test scenarios:
- Given a doc and a `set` on an entity prop, when `makeTransaction` runs, then exactly one `replace` patch at `['entities', id, 'props', control]` and an inverse restoring the old value.
- Given any doc and any transaction (fast-check arbitrary), when `apply(apply(doc, patches), inverse)` runs, then `canonical` output equals the original.
- Given two objects with keys in different insertion order, when canonicalised, then strings are equal.
- Given a `set` whose target id is absent, when `makeTransaction` runs, then it throws `UnknownTargetError` (no silent create).

### U3 — Validation against manifest controls

Goal: reject commands and patches that break the invariants before anything is persisted or broadcast.

Files: Create `packages/design-log/src/validate.ts`; Test `test/validate.test.ts`.

Approach: import `ControlDecl` and `GameManifest` from `@ogm/contracts` (OGM-020). `validateValue(control, value)` checks type, `min`/`max`, `options`, `step` as the decl declares (refresh field names against OGM-020 at pickup). `validateCommands(manifest, commands)` checks each control id exists, `targets` exist in the doc (`'global'` only for `scope: 'global'` controls). `validatePatches(patches)` requires every path to start with `['globals', …]` or `['entities', id, …]`, forbids numeric indexes directly under `entities`, and enforces a 256 KB canonical size cap (`PatchTooLargeError`). All return `{ ok: true } | { ok: false; errors: { path: string; code: string }[] }`.

Interface sketch:
```ts
export function validateValue(control: ControlDecl, value: unknown): { ok: true } | { ok: false; reason: 'type' | 'range' | 'option' };
export function validateCommands(manifest: GameManifest, doc: DesignDoc, commands: EditorCommand[]): ValidationResult;
export function validatePatches(patches: Patch[]): ValidationResult;
```

Test scenarios:
- Given a numeric control `max: 10` and value 15, then `{ok:false, reason:'range'}`.
- Given a patch path `['entities', 0, …]`, then rejected with code `array_entities`.
- Given a patch path `['secrets', …]`, then rejected with code `path_root`.
- Given 300 KB of patches, then `PatchTooLargeError`.

### U4 — Replay with fork points

Goal: `replay` produces the effective doc for a branch from its parent chain and its own log.

Files: Create `packages/design-log/src/replay.ts`; Test `test/replay.test.ts`.

Approach: `replay(input: { baseDoc: DesignDoc; chain: Array<{ branch: Branch; txs: Transaction[] }> })`: for each ancestor from root to the branch, apply its transactions up to the child's `forkPoint.parentRev`; then apply the branch's own transactions in `rev` order; assert `rev` strictly increases by 1 (throw `GapError` on a hole, which OGM-041 and OGM-053 use to trigger resync). Returns `{ doc, headRev }`. Pure; callers load logs.

Interface sketch: `export function replay(input: ReplayInput, upToRev?: number): { doc: DesignDoc; headRev: number }`.

Test scenarios:
- Given main with revs 1–5 and branch B forked at rev 3 with its own revs 1–2, when replayed, then the doc equals apply(main 1–3) then B 1–2, and main's revs 4–5 are absent.
- Given a log missing rev 3, then `GapError{expected:3}`.
- Given `upToRev: 2`, then only revs ≤ 2 apply (the snapshot-at-rev read in OGM-041).
- Property: `replay(chain)` equals folding `apply` over the concatenated prefix (fast-check).

### U5 — Reduce to a working set

Goal: `reduce(log, baseDoc)` yields the override entries and entity ops, last write per path, status `carried`, order-stable.

Files: Create `packages/design-log/src/reduce.ts`; Test `test/reduce.test.ts`.

Approach: walk transactions in `rev` order; for each `set`/`reset` command derive `OverrideKey` = `${controlId}@${targetId|'global'}`; `set` upserts an `OverrideEntry {value, baseValueAtEdit: baseDoc value at that key, txId, rev, status:'carried'}`; `reset` deletes the key; entity `create`/`delete` commands (from `invoke` commands named `entity.create`/`entity.delete` as OGM-020 declares them; refresh) become `entityOps` with delete tombstoning a prior create. Output `WorkingSet` with `headRev` = last rev, `buildId` = the caller's build. Stroke-type controls (tilemap chunks) reduce per chunk key because the design schema stores terrain per chunk (T08 §6 item 5); no special casing beyond that.

Interface sketch: `export function reduce(input: { gameId: string; branchId: string; buildId: string; baseDoc: DesignDoc; txs: Transaction[] }): WorkingSet`.

Test scenarios:
- Given two sets on the same key at revs 2 and 7, then the entry holds rev 7's value and `baseValueAtEdit` from the base doc, not from rev 2.
- Given a set then a reset, then the key is absent.
- Given create then delete of the same creator entity, then `entityOps` holds the delete tombstone only.
- Property: `reduce` of the same transactions is deep-equal across runs and independent of object key insertion order.
- Performance guard: 10,000 transactions over 2,000 entities reduce in < 100 ms in Node (T08 §6 item 4); assert with a generous 500 ms ceiling in CI, log the measured time.

## 4. Verification

```
pnpm install
pnpm --filter @ogm/contracts generate && git diff --exit-code packages/contracts/schemas
pnpm --filter @ogm/contracts test
pnpm --filter @ogm/design-log test
pnpm -r typecheck && pnpm lint
```
Paste into `## Local tests`: the five commands, the Vitest summary lines (test counts per file), the measured reduce time, and the head SHA tested.

## 5. Deferred to implementation

- Exact `ControlDecl` field names for range/options: follow OGM-020's merged file; default `{ type, min?, max?, step?, options? }`.
- How `invoke` commands for entity create/delete are named: follow OGM-020's manifest; default `entity.create` / `entity.delete`.
- `payload` JSON-Schema encoding: default base64 string with `contentEncoding`.
- Whether `fast-check` runs 100 or 1,000 cases: default 200 locally, 100 in CI.

## 6. Scope boundaries

- No tables, routes, SSE or leases (OGM-041).
- No classification other than `carried` in `reduce` (OGM-042 owns `needs_choice`, `conflict`, `dropped`, `renamed`).
- No version string (OGM-043), merge (OGM-044), fold (OGM-045), save client (OGM-046).
- No bridge delivery or editor undo stack UI (OGM-028, OGM-075).

## 7. Risks

- Immer patch paths on arrays are positional: mitigated by `validatePatches` forbidding arrays under `entities` and by the OGM-020 schema rule; default taken: reject, never repair.
- Reduce performance on large strokes: default per-chunk keys as the schema stores them; measure and record.
- Contract drift between OGM-020's `Patch` and this file: default re-export OGM-020's `PatchSchema` rather than redefining if it exists at pickup; otherwise define it here and note it in the PR for OGM-020's owner.
