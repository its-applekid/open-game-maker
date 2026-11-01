# OGM-044 plan — Three-way design merge with voice-guided conflicts

## 1. Problem frame

Two branches of the same game have diverged in design state since a fork point. Merging must be automatic wherever only one side touched a path or both agree, and must surface only real conflicts (same path different values, delete versus edit, a control retired by one side's build). The result is one `kind: 'merge'` transaction on the target that can be previewed first and rolled back by its inverse. Git is not involved in V1 (D-BRANCH-BASE), which keeps this ticket to the design log.

Requirements trace: R38 → base at the fork point, last-write-per-path reduction per side, auto where one side changed or both agree, the three conflict kinds, per-conflict or all-mine resolution, one merge transaction with a preview first, code merges through Git with an agent job only on conflict (reserved, always `'clean'` in V1).

## 2. Patterns to follow

- `packages/design-log/src/reduce.ts` (OGM-040): last-write-per-path reduction; `sideDelta` is the same walk keyed by JSON pointer instead of override key.
- `packages/design-log/src/reapply.ts` and `services/api/src/design/reapply.ts` (OGM-042): pure function + stored result + routes; copy the split and the error mapping.
- `services/api/src/branches/{service,routes}.ts` (OGM-043): `setStatus`, `:b` resolver, policy call.
- `docs/research/v0.5/C2-v1-scope-additions.md` §8 "Merging" (verified at 9508c1c): the product rules the tests encode.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest (fast-check for the property test); API binds `127.0.0.1`; secrets via `packages/config` only; no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Side deltas

Goal: reduce one side's transactions since the fork into last-write-per-path changes with tombstones.

Files: Create `packages/design-log/src/merge.ts` (part 1); Test `packages/design-log/test/merge.sideDelta.test.ts`.

Approach: `sideDelta(baseDoc, txs)`: walk patches in rev order; key = `toPointer(path)`; `replace`/`add` → `FieldChange {path, before: current value (from the evolving doc), after, txId}` (the `before` of the first write to a path is the base value; later writes keep that `before` and update `after`); `remove` on `/entities/<id>` → `'deleted'` for that pointer and drop any deeper keys under it; `add` of `/entities/<id>` → a `FieldChange` whose `before` is `undefined`; stroke controls (paths under a chunk key, detected by the manifest `kind: 'stroke'` or by the schema's `chunks` segment; refresh against OGM-020) are reduced at the chunk pointer, not per cell. Returns `SideDelta`.

Interface sketch: `export function sideDelta(baseDoc: DesignDoc, txs: Transaction[]): SideDelta`.

Test scenarios:
- Given two writes to the same path at revs 2 and 7, then one entry with `before` = base value and `after` = rev 7's value.
- Given an entity edited then deleted, then only `'deleted'` at `/entities/<id>`.
- Given cell writes under `/entities/map1/props/chunks/3_4/...`, then one entry at the chunk pointer.

### U2 — Plan computation

Goal: `planMerge` yields `auto` patches and typed conflicts, deterministic.

Files: Modify `packages/design-log/src/merge.ts` (part 2); Test `merge.plan.test.ts` with fixture `test/fixtures/merge-ae3.json`.

Approach: `planMerge({ baseDoc, ours: SideDelta, theirs: SideDelta, oursManifest, theirsManifest })`. Union of pointers. For each: only in ours → auto patch from ours; only in theirs → auto patch from theirs (when merging into the target, "theirs" is already applied on the target, so auto patches are only ours' changes that do not conflict; keep both for the symmetric preview and let the API choose which set to apply); in both: deep-equal `after` → auto (one copy); `'deleted'` on one side and `FieldChange` on the other, or deeper edits under a deleted entity → `delete_vs_edit`; a pointer whose control is in the other side's manifest `overrides.retired` (or missing from its controls) → `control_removed` with the removed side as `'removed_by_build'`; otherwise `both_changed`. Conflict ids are `ulid()`; sort by pointer for a stable `canonical(plan)`. `applyResolutions(plan)`: for each conflict `ours` → ours.after, `theirs` → theirs.after, `both` (delete_vs_edit only) → keep entity and apply the edit, `{value}` → validated against the control; returns `auto` + resolved patches as Immer-form patches (`fromPointer`).

Interface sketch:
```ts
export function planMerge(input: { baseDoc: DesignDoc; ours: SideDelta; theirs: SideDelta; oursManifest: GameManifest; theirsManifest: GameManifest }): { auto: Patch[]; conflicts: MergeConflict[] };
export function applyResolutions(plan: Pick<MergePlan,'auto'|'conflicts'>, controls: ControlDecl[]): Patch[];   // throws UnresolvedConflict | InvalidResolution
```

Test scenarios:
- Given the AE3 fixture, then exactly one `both_changed` conflict at `/entities/door1/props/locked` and all other changes in `auto`.
- Given both sides set the same value, then auto and no conflict.
- Given ours deleted `goblin2` and theirs changed its colour, then `delete_vs_edit` with `ours: 'deleted'`.
- Given theirs' build retired `bat.wingFlaps` and ours tuned it, then `control_removed` with `theirs: 'removed_by_build'`.
- Given `'both'` on a `both_changed` conflict, then `InvalidResolution`.
- Property: planning with `ours`/`theirs` swapped yields the same conflict set with sides swapped (fast-check over small deltas).

Execution note: fixture-first; the AE3 golden plan is committed once reviewed.

### U3 — Plan storage and state machine

Goal: plans persist with their target head and move through the states.

Files: Create `services/api/src/branches/merge.ts`, `packages/db/src/schema/merges.ts` (+ barrel line, migration `<timestamp>_merge_plans.sql`); Test `services/api/src/branches/merge.test.ts`.

Approach: `createPlan(db, src, {gameId, sourceBranchId, targetBranchId, userId})`: load both branches; require `source.forkPoint.parentBranchId === target.id` or the reverse (main → branch: base is the branch's fork point on main); `baseDoc = snapshotAt(target or parent, parentRev)`; `oursTxs` = source rows with rev > 0 (branch side) and `theirsTxs` = target rows with rev > parentRev; manifests from `BaseDocSource` for each side's `latestBuildId`; `planMerge`; store `{plan, target_head_rev, status: conflicts.length ? 'resolving' : 'planned'}`. `resolve(planId, conflictId, resolution)` and `resolveAll` mutate the stored plan. `preview(planId)`: `applyResolutions` → effective doc = `apply(snapshotAt(target, head), patches)`; return `{previewBuildId: target.latestBuildId, doc, rev: target.headRev}`; status `previewing`. `land(planId, sessionId)`: re-read target head; if `!== target_head_rev` → `TargetMoved`; `makeTransaction` inverse from the current doc; `appendTransaction({kind:'merge', leaseToken:0, label, baseBuildId: target.latestBuildId, commands:[{op:'invoke', command:'merge.land', args:{planId}}], patches, inverse})`; status `landed`, `landed_tx_id`; if target is `main` → `setStatus(source,'merged')`. `abandon` → status. `rollback(planId)`: landed only; append a new `kind:'merge'` transaction with the landed transaction's `inverse` as patches and its `patches` as inverse, label "Undid merge of <source>".

Interface sketch: functions named as above, each returning `MergePlan` or `{rev}`; errors `TargetMoved`, `UnresolvedConflict`, `WrongStatus`.

Test scenarios:
- Given AE3 branches, when `createPlan`, then one conflict and `status 'resolving'`.
- Given `land` with a conflict unresolved, then `UnresolvedConflict`.
- Given a new transaction on main after the plan, when `land`, then `TargetMoved` and no row.
- Given all resolved `'ours'`, when `land`, then one `kind:'merge'` row, main's `design?rev=head` has `door1.locked=false`, B is `merged`.
- Given a landed plan, when `rollback`, then main's doc equals the pre-merge snapshot and the plan stays `landed` with `rolledBackTxId` recorded.
- Given `main → B` direction, when landed, then B stays `active` and main is untouched.

### U4 — Routes and the tool shape

Goal: eight routes appended to the branches router; the T06 tool names documented.

Files: Modify `services/api/src/branches/routes.ts` (append only); Modify `packages/contracts/src/branches.ts` (comment block naming `list_conflicts`, `resolve_conflict`, `resolve_all` and their route mapping; no schema change); Test `merge.routes.test.ts`.

Approach: Zod bodies; policy `game.edit`; error map `TargetMoved`/`UnresolvedConflict`/`WrongStatus` → 409, validation → 422. `GET …/merges/:planId` returns the plan with `previewUrls` left empty (OGM-077/OGM-090 fill stills).

Test scenarios:
- Given the AE3 setup over HTTP, when the full sequence `POST merges → POST conflicts/:id {resolution:'ours'} → POST preview → POST land` runs, then statuses `resolving → resolving → previewing → landed` and one transaction.
- Given a non-owner, then 403 on every route.

### Execution order

1. U1 then U2 with the AE3 fixture committed as a golden plan (`canonical(plan)` string) before the API work starts.
2. U3 store and state machine against OGM-041's store; the `TargetMoved` test is written before `land` exists.
3. U4 routes last; the HTTP sequence test doubles as the example OGM-077 reads to call these routes.
4. Measure `planMerge` on a 2,000-entity fixture (both sides 500 changes) and record the time in the PR.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/design-log test -- merge
pnpm --filter @ogm/api test -- merge
pnpm -r typecheck && pnpm lint
```
Paste the Vitest summaries (name the AE3 test explicitly), the measured plan time for a 2,000-entity fixture, and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Stroke detection: default by a `chunks` path segment; refine to the manifest `kind` if OGM-020 declares one.
- Whether `auto` stores both sides' non-conflicting changes or only the side being applied: default store ours-only for apply and keep theirs in a `context` field for the preview UI.
- Conflict id scheme: default `ulid()`; stable sort by pointer.
- `rollback` after further transactions on the target: default allowed (inverse applied on top, may produce stale values); OGM-077 warns.

## 6. Scope boundaries

- No code merge, no agent job filing (reserved; OGM-031 if D-BRANCH-BASE is lifted).
- No fold or Git write (OGM-045 at Publish).
- No screens, stills or side-by-side rendering (OGM-077, OGM-090).
- No voice host wiring (OGM-085/OGM-086); the tool names are documented only.

## 7. Risks

- Patch-path semantics for `add`/`remove` on objects vs arrays: mitigated by OGM-040's `validatePatches` (no arrays under `entities`); default reject.
- Large plans (thousands of auto patches) in one transaction exceed OGM-040's 256 KB cap: default raise the cap for `kind:'merge'` to 2 MB in `validatePatches` options, noted in the PR.
- Both-direction merges and later re-merges of the same branch (fork point unchanged): default allowed; the base stays the original fork point, which can resurface resolved conflicts; OGM-077 explains "already merged" via `status`.
