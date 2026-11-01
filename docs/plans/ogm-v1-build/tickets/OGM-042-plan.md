# OGM-042 plan — Re-apply overrides across builds

## 1. Problem frame

While an agent builds, the creator keeps editing the current build; when the new build is tested, each override must be re-evaluated against the new base doc and manifest and classified so the creator sees "20 kept, 1 needs a choice, 2 couldn't carry over" before switching. The log stays append-only: the switch is one system transaction, answers are system transactions, and the report is a pure, byte-stable function the backend stores per `(branch, build)`.

Requirements trace: R33 → overrides apply on top of the latest build at once (already true via OGM-041's reduce; this ticket keeps it true across a switch); re-apply report with the five classes using manifest hints; creator's value wins unless the job targeted that control (`targetControls[]` → `superseded_by_job`).

## 2. Patterns to follow

- `packages/design-log/src/reduce.ts` and `validate.ts` (OGM-040): reuse `reduce` to obtain the working set at the current build and `validateValue` for the needs-choice test. Copy the pure-function-with-typed-errors style.
- `services/api/src/design/{store,snapshot}.ts` (OGM-041): `appendTransaction` for system transactions, `readChain` + `BaseDocSource` for base docs and manifests. Copy the route file's error mapping.
- `docs/research/v0.3/A4-engine-sdk-editor.md` §7a (lines 238–257, verified at 9508c1c): the classification table; encode each row as one test.
- `/home/orangekid/github/aiur/packages/aiur-contracts/test/contracts.test.mjs` (verified): fixture-driven tests; use a JSON fixture for the AE2 23-entry case.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest; API binds `127.0.0.1`; secrets only via `packages/config`; no dependency added; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Pure classifier

Goal: `reapply()` in `@ogm/design-log` producing the report, the rebased working set and the switch patches.

Files: Create `packages/design-log/src/reapply.ts`; export from `src/index.ts`; Test `packages/design-log/test/reapply.test.ts`, fixture `test/fixtures/reapply-ae2.json`.

Approach: input `{ from: { buildId, baseDoc, manifest }, to: { buildId, baseDoc, manifest }, workingSet, targetControls }`. Steps in fixed order: (1) entity creates: keep each `entityOps[create]` whose `parent` level exists in `to.baseDoc` (levels derived from `entities[*].level` plus manifest `levels` if OGM-020 declares them); otherwise `dropped target_removed`; (2) deletes: keep tombstones whose target still exists in `to.baseDoc`, drop the rest silently (nothing to delete); (3) property entries sorted by key: resolve alias → `renamed` (re-key); if `controlId` ∈ `targetControls` → `superseded_by_job`; if control absent or ∈ `retired` → `control_removed`; if target absent in `to.baseDoc` and not a surviving creator create → `target_removed`; if control ∈ `overrides.migrate` (list) → `needs_choice` with `allowed = control.default`; if `validateValue(toControl, value)` fails → `needs_choice` with `allowed` = clamped value (shown, never applied); else compare `toBase = getPath(to.baseDoc, key)`: equal to `baseValueAtEdit` or deep-equal to `value` → `carried`; else `conflict {mine: value, builder: toBase}` (creator wins: entry kept with `baseValueAtEdit = toBase`, status `conflict`). Rebased entries get `baseValueAtEdit` from `to.baseDoc`. `switchPatches`: for renamed keys, `remove` old path + `add` new path with the value; for dropped keys, `remove` the override path (so `reduce` at the new build no longer produces them); for conflicts nothing (value stands); `switchInverse` from the same data. Report arrays sorted by key for stability.

Interface sketch:
```ts
export function reapply(input: {
  from: { buildId: string; baseDoc: DesignDoc; manifest: GameManifest };
  to:   { buildId: string; baseDoc: DesignDoc; manifest: GameManifest };
  workingSet: WorkingSet; targetControls: string[];
}): { report: ReapplyReport; rebased: WorkingSet; switchPatches: Patch[]; switchInverse: Patch[] };
```

Test scenarios (each one line, each fails if its rule is deleted):
- Given an alias `enemy.tint→enemy.color`, then the entry is reported `renamed` and the rebased key is `enemy.color@e_1`.
- Given `retired: ['bat.wingFlaps']`, then `dropped control_removed`.
- Given a target entity deleted by the build, then `dropped target_removed`.
- Given value 15 and new max 10, then `needsChoice {mine:15, allowed:10}` and the rebased entry status `needs_choice`.
- Given new base 7, `baseValueAtEdit` 5, mine 9, then `conflicts {mine:9, builder:7}`.
- Given new base 9 equal to mine, then `carried`.
- Given `targetControls: ['jump.height']`, then that key is `dropped superseded_by_job` even if valid.
- Given a creator-created entity whose parent level vanished, then `dropped target_removed` and no switch patch references it.
- Given the AE2 fixture, then counts 20 / 1 renamed / 2 dropped and `canonical(report)` equals the stored golden string.
- Property: `apply(to.baseDoc ⊕ reduce(log + switchTx))` equals applying `rebased` entries directly (fast-check over small docs).

Execution note: write the AE2 fixture and the golden string first; the golden is regenerated once the implementation is reviewed.

### U2 — Report storage and computation

Goal: the backend computes the report for a branch and build, stores it, and exposes `onBuildTested`.

Files: Create `services/api/src/design/reapply.ts`, `packages/db/src/schema/reapply.ts` (+ barrel line, migration `<timestamp>_reapply_reports.sql`); Test `services/api/src/design/reapply.test.ts`.

Approach: `computeReport(db, src, branchId, toBuildId)`: branch row → `fromBuildId = latest_build_id` (if null: report with everything carried, nothing to rebase); `workingSet = reduce(readChain + base doc at from)`; `from/to` docs and manifests from `BaseDocSource`; `targetControls` from the job row of `to.jobId` (import the jobs query from OGM-013's `services/api/src/jobs/*` if merged; else `[]` with a TODO naming OGM-013); call `reapply`; upsert `reapply_reports`. `getReport` returns the stored row or computes. `onBuildTested(buildId)`: for every active branch of the game whose `latest_build_id !== buildId`, `computeReport` (fire-and-forget with logging; it is a cache).

Interface sketch:
```ts
export async function getReport(db, src, branchId, toBuildId): Promise<ReapplyReport>;
export async function onBuildTested(db, src, buildId): Promise<void>;   // called by OGM-045
```

Test scenarios:
- Given a branch at build 13 with the AE2 log, when `getReport(b, build14)` runs, then the row is stored and equals the library result.
- Given a stored row, when `getReport` runs again, then no recomputation (spy on `reapply`).
- Given `onBuildTested(build14)` for a game with two active branches, then two rows.
- Given a build whose manifest fails `GameManifestSchema`, then `ManifestInvalid` and no row.

### U3 — Routes: report, answers, switch

Goal: the three routes appended to the design router.

Files: Modify `services/api/src/design/routes.ts` (append handlers; no edits to existing handlers); Test `services/api/src/design/reapply.routes.test.ts`.

Approach: `GET …/reapply/:buildId` → `getReport`. `POST …/reapply/:buildId/answers`: validate each `key` exists in the report's `needsChoice` or `conflicts`; map `use_allowed` → `set control=allowed`, `keep_mine` → `set control=mine` (re-asserts, status becomes carried), `discard` → `reset`, `use_builder` → `reset`; build one `system` transaction per answer through `makeTransaction` against the current effective doc with `label: "Chose <allowed> for <control label>"`, `baseBuildId: toBuildId`, `leaseToken 0`, caller `sessionId` checked against the lease; delete the stored report so the next `GET` recomputes. `POST …/switch {buildId}`: build must exist and be `tested` (read via OGM-045's `builds` query if merged; otherwise require the artifact to exist in `BaseDocSource`); append one `system` transaction `{label:'Switched to build <seq>', baseBuildId: buildId, commands: [{op:'invoke', command:'build.switch', args:{from,to}}], patches: switchPatches, inverse: switchInverse}`; update `branches.latest_build_id`; respond `{rev, report}`.

Interface sketch: see the ticket's Scope block.

Test scenarios:
- Given a report with one `needsChoice`, when `POST answers use_allowed`, then one system transaction with the allowed value and the next `GET` lists the key under `carried`.
- Given `POST answers` for an unknown key, then 409.
- Given `POST switch` to build 14, then one transaction with `baseBuildId` build 14, `latest_build_id` updated, and `GET design?rev=head` equals `to.baseDoc ⊕ rebased`.
- Given `POST switch` without the lease, then 423.
- Given `POST switch` to a `failed` build, then 409.

### Execution order

1. U1 fixture and golden first (`reapply-ae2.json`, expected counts 20/1/2), then the classifier until every row-test passes.
2. U2 migration and `getReport`; verify `onBuildTested` is importable by name from `services/api/src/design/reapply.ts` (OGM-045 imports exactly that symbol).
3. U3 routes; run the `switch` test against OGM-041's `design?rev=` route to prove the rebased doc, not just the row.
4. Record the measured report time for the AE2 fixture in the PR.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/design-log test -- reapply
pnpm --filter @ogm/api test -- reapply
pnpm -r typecheck && pnpm lint
```
Paste the Vitest summaries, the AE2 counts printed by the fixture test, and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Where `targetControls` lives on the job row: default `jobs.plan.targetControls` (OGM-013); `[]` when missing.
- Level existence for creator-created entities: default derive levels from `entities[*].level` in `to.baseDoc`.
- Whether `switch` carries the full re-keying as patches or only a marker: default full patches (keeps `reduce` honest).
- `needsChoice.allowed` for out-of-range values: default the clamped value; for `migrate`-listed controls the control default.

## 6. Scope boundaries

- `builds` rows, `status` transitions, artifact paths: OGM-045.
- The card UI, Try-it chip, flip back: OGM-075.
- Branch-to-branch merge conflicts: OGM-044.
- Manifest hint authoring rules for agents and the `gm-sdk check` rule that hints exist: OGM-091/OGM-029.

## 7. Risks

- Manifest shape for hints not yet fixed by OGM-020 at pickup: default `manifest.overrides = { aliases, retired, migrate?: string[] }`; add the field to OGM-020's schema in a separate one-line PR if absent and note it.
- Large working sets make the report slow: default compute once per `(branch, build)` and store; measured in the AE2 test.
- Ambiguity between "builder changed it to my value" and a real conflict: resolved as carried (rule in the ticket); test encodes it.
