# OGM-077 — Versions, releases and merge screens: implementation plan

## 1. Problem frame

Branching, publishing and merging are server algorithms (OGM-043/044/045) with a thin, honest UI. The creator must see which version is which, publish only what the rules allow, roll back with eyes open, and walk through nothing but real conflicts. This ticket adds three route modules under the game screen and reuses OGM-075's frame for previews.

Requirements trace:
- R37 → Versions screen: create from here, switch, play either, cap 5, archive (U1).
- R38 → Merge screen: conflicts by kind, per-conflict or all-mine resolution, preview build, land as one transaction (U3).
- R90 → Publish from `main` with a tested build, derived version, editable changelog, gate errors shown (U2).
- R92 → Rollback dialog with the affected-saves count; nothing deleted (U2).

## 2. Patterns to follow

- OGM-075's `apps/web/src/routes/game/route.tsx` (at pickup): the screen module export; copy it for the three new `route.tsx` files.
- OGM-075's `apps/web/src/features/editor/api.ts`: the fetch wrapper with typed errors; reuse it rather than writing a second one.
- `/home/orangekid/github/aiur/website/tests/visual.spec.ts`: viewport matrix for the e2e.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T08-design-log-branching-releases.md` §4 "Merge" block: the algorithm comment is the vocabulary for conflict labels; do not restate it in code comments.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright for browser tests on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback; every service binds `127.0.0.1`; secrets only from `packages/config` names; no new dependency below 1k GitHub stars without naming the exception (none added); PR first line `Closes #<issue>`; `## Local tests` section with policy, tested head SHA, base, selection, commands and results.

## 3. Implementation units

### U1 — Versions screen

Goal: list, create, switch, play, archive versions within the cap.
Files: Create `apps/web/src/routes/game/versions/{route.tsx,VersionsScreen.tsx,VersionRow.tsx,NewVersionDialog.tsx,api.ts}`; Test `VersionsScreen.test.tsx`, `api.test.ts`; Modify `apps/web/src/routes/game/extras.ts` (append `{ id: 'versions-nav', placement: 'topbar', Component: VersionsNav }`).
Approach: `api.ts`: `useBranches(gameId)` over OGM-043's list route; `createBranch(gameId, { name, fromBranchId, fromRev })`; `archiveBranch(gameId, branchId)`; `canCreateVersion(branches) = branches.filter(b => b.status === 'active').length < 5`. `VersionRow`: name, `version` (the server's derived field), build status chip (`building | tested | failed | none`), Switch (`navigate('/g/:gameId?v=' + id)`), Play (`&mode=play`), Edit (`&mode=edit`), Archive (confirm). Non-main rows carry one line: "Builders work on the main version". `NewVersionDialog`: name field (default "Version N"), creates from the current branch at its `headRev`. `VersionsNav` is the `gameExtras` entry: two 44 px icon buttons (aria-labels "Versions", "Releases").
Interface sketch:
```ts
export function canCreateVersion(branches: Branch[]): boolean;
export function useBranches(gameId: string): { branches: Branch[]; current: Branch | undefined; refetch(): void };
```
Test scenarios:
- Given five active branches, when rendered, then the new-version button is disabled with "5 of 5".
- Given four active and one archived, then enabled.
- Given Switch on "Spooky monsters", when pressed, then the URL is `/g/g1?v=b2`.
- Given Archive confirmed, when the request succeeds, then the row shows `archived` and the count drops.
- Given the `main` row, then no Archive button and no "Builders work on the main version" line.
- Given an `archived` branch, then Switch, Play and Edit are absent and the derived version still shows.

### U2 — Releases screen: publish and rollback

Goal: publish from `main` with a tested build; roll back with the affected-saves count.
Files: Create `apps/web/src/routes/game/releases/{route.tsx,ReleasesScreen.tsx,PublishDialog.tsx,RollbackDialog.tsx,api.ts}`; Test `PublishDialog.test.tsx`, `RollbackDialog.test.tsx`, `api.test.ts`.
Approach: `api.ts`: `usePublished(gameId)` (`GET /games/:g/published`, shares the query key OGM-075's indicator uses so publish invalidates both); `useReleases(gameId)`; `useChangelogDraft(gameId, buildId)` over the draft route OGM-045 exposes (copy its path at pickup); `publish(gameId, { buildId, changelog })`; `rollback(gameId, { releaseId })` as the two-step shape OGM-045 defines (count in the confirm payload, then confirm). `publishEnabled(branch, build) = branch.name === 'main' && build?.status === 'tested'`. `PublishDialog`: derived next version (read from the draft response), textarea prefilled with the assembled notes, one line "These words will be public" when `game.visibility === 'public'`, Publish (64 px); on gate error show the server text and keep the dialog. `RollbackDialog`: "Restores <version>", the count line "N saves will stop loading until you publish again" once loaded, confirm disabled until then; on success invalidate `published` and `releases`.
Interface sketch:
```ts
export function publishEnabled(branch: Branch | undefined, build: Build | undefined): boolean;
export function useChangelogDraft(gameId: string, buildId: string | undefined): { version: string; items: ChangeNote[]; text: string } | undefined;
```
Test scenarios:
- Given branch `main` and a `tested` build, then Publish is enabled; given `building`, then disabled; given a non-main branch, then the button is absent.
- Given a 422 from the gate naming `synty/goblin.glb`, when Publish is pressed, then the dialog stays open and shows that text.
- Given the rollback count is loading, then confirm is disabled; given count 3, then the line reads "3 saves …".
- Given a 409 on publish, when received, then the published query refetches and the dialog asks again.
- Given `game.visibility === 'public'`, when the dialog opens, then the public-words line is present; given `private`, then it is absent.
- Given a successful publish, when the response arrives, then the `published` query used by OGM-075's indicator is invalidated once.
Execution note: characterization-first against OGM-045's fixtures; copy their exact field names before writing the dialogs.

### U3 — Merge screen

Goal: resolve only real conflicts with previews and land as one transaction.
Files: Create `apps/web/src/routes/game/merge/{route.tsx,MergeScreen.tsx,ConflictCard.tsx,SideBySide.tsx,resolution.ts,api.ts}`; Test `resolution.test.ts`, `MergeScreen.test.tsx`.
Approach: `api.ts`: `startMerge(gameId, { sourceBranchId, targetBranchId })` → `MergePlan`; `usePlan(planId)` polling every 5 s while `status` is `previewing`; `resolve(planId, conflictId, resolution)`, `resolveAll(planId, 'ours' | 'theirs')`, `preview(planId)`, `land(planId)`, `abandon(planId)` (OGM-044's routes; copy paths). `resolution.ts`: a reducer over `MergeConflict[]` with `setResolution(id, r)`, `allMine()`, `landable(plan)` (= every conflict has a resolution and `status !== 'previewing'` and `code !== { conflictJobId }` unresolved). `ConflictCard`: kind label ("Both of you changed this", "One side removed it", "A newer build removed this control"), entity and control names, ours/theirs values, a `SideBySide` with two `GameFrame`s from OGM-075 mounted in `play` mode on the two preview docs (`design.apply` of `base ⊕ ours` and `base ⊕ theirs`, computed with `packages/design-log` `apply` from the plan's `auto` plus each side's change), both sent `editor.select [entityId]`; when a frame errors, show stills from the plan's `previewUrls` if present, else only the values. Choices as a 64 px segmented control: Mine, Theirs, Both (where the kind allows), Value (an input for scalars). A `code.conflictJobId` renders a link to `/…` that opens OGM-076's chat for that job.
Interface sketch:
```ts
export type ResolutionState = Record<string, MergeConflict['resolution']>;
export function landable(plan: MergePlan, state: ResolutionState): boolean;
export function previewDocs(plan: MergePlan, base: DesignDoc, conflict: MergeConflict): { ours: DesignDoc; theirs: DesignDoc };
```
Test scenarios:
- Given the AE3 fixture (one `both_changed` at `entities.door1.props.locked`), when rendered, then one card with Mine `false` and Theirs `true`.
- Given `allMine()`, then every resolution is `ours` and `landable` is true.
- Given a conflict without resolution, then Land is disabled.
- Given `status: 'previewing'`, when the poll returns `previewBuildId`, then the Preview button becomes "Open preview" linking to `/g/:gameId?v=<target>&build=<previewBuildId>`.
- Given `code: { conflictJobId: 'j9' }`, then a link to that job exists and Land is disabled until the plan reports `code: 'clean'`.
- Given a `delete_vs_edit` conflict, then the Both choice is absent; given `both_changed` on a scalar, then Value is offered.
- Given the fixture game answers `ready` for one frame and errors for the other, then the first shows the frame and the second shows the values only.

### U4 — Playwright e2e

Goal: the three screens against mocked routes with contract fixtures.
Files: Create `apps/web/e2e/versions-releases-merge.spec.ts`, `apps/web/e2e/fixtures/merge-ae3.json`.
Approach: `page.route('**/api/**')` serving `packages/contracts/fixtures/{branches,releases}/*.json` and the AE3 plan; an in-memory state so Archive and Publish mutate what the next GET returns; OGM-075's fixture game on port 10001 for the side-by-side frames. Steps mirror the agent gate.
Test scenarios:
- Given five active branches, when Versions opens, then the create button is disabled.
- Given `main` with a tested build, when Publish is pressed and the textarea edited, then the POST body's `changelog` equals the edit.
- Given the AE3 plan, when "Keep all of mine" is pressed, then Land enables and the POST carries `{ resolution: 'ours' }` for the conflict.
- Given 390×844, then Publish, Land and Switch are ≥ 64 px.

## 4. Verification

```
pnpm -r typecheck && pnpm -r lint
pnpm --filter @ogm/web test -- routes/game/versions routes/game/releases routes/game/merge
pnpm --filter @ogm/web e2e -- versions-releases-merge
pnpm --filter @ogm/web build
```
Paste into `## Local tests`: Vitest counts, Playwright summary (three viewports, renderer string), head SHA, base.

## 5. Deferred to implementation

- Changelog draft route path: default, the one OGM-045's ticket names; if none exists, assemble client-side from `GET /games/:g/changes?since=<lastReleaseSha>` only if OGM-045 exposes it; otherwise an empty textarea with the derived version.
- Rollback two-step shape: default, `POST /games/:g/rollback { releaseId, confirm: false }` → counts, then `{ confirm: true }`; copy OGM-045's actual shape.
- Preview doc computation: default, client-side with `packages/design-log`; if the plan carries `previewDocs`, use them.
- Stills for previews: default, none in V1 unless the plan includes `previewUrls` (OGM-044/OGM-093 may add them).
- "Bring main in" (merge target = branch): default, offered; same screen with swapped ids.

## 6. Scope boundaries

- No branch storage, fork points, cap enforcement or version derivation (OGM-043).
- No merge computation, conflict classification or resolution endpoints (OGM-044); no code-conflict jobs (OGM-033/044).
- No fold, tags, CAS pointer, changelog assembly, save counting (OGM-045).
- No game screen or editor changes beyond one `extras.ts` entry (OGM-075); no forks (OGM-048).

## 7. Risks

- Two live frames on a phone are heavy: default, mount the second frame lazily (tap "Compare") on viewports under 600 px; values are always visible.
- Server field names drift from T08 §4: default, copy from the merged contracts at pickup; the plan's sketches are illustrative.
- Gate errors are long: default, show the server text in a scrollable box, no paraphrase.
- Users merge with a stale plan: default, `land` sends the plan's `id` and `baseRev`; a 409 restarts the merge with a notice.
