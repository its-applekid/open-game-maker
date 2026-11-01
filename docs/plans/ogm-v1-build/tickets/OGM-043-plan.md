# OGM-043 plan — Branches: create, switch, archive, per-branch builds, version numbers

## 1. Problem frame

"New version from here" must be cheap: a `Branch` row that remembers where it forked from the parent's log, replays the parent to that point and then its own transactions. `main` is the same kind of row with no fork point, so OGM-041's store already handles both. V1 keeps Git out of branch creation (agents only build on `main`; D-BRANCH-BASE), so this ticket is rows, routes, a cap, and one pure function that turns counts into Kevin's `major.minor.patch`.

Requirements trace: R37 → `Branch` rows with `forkPoint`, cap 5 active, archive never delete, `branchId` on builds/saves/rooms/analytics (the column exists in every sibling's contract; this ticket owns the rows they point at); R91 → `deriveVersion` from counts, nothing stored, `saveSchemaVersion` untouched.

## 2. Patterns to follow

- `services/api/src/design/routes.ts` and `store.ts` (OGM-041): router shape, `:b` resolution (`main` literal or id), `insertBranch`, `readChain`. Copy the error-mapping table.
- `packages/design-log/src/replay.ts` (OGM-040): the fork-point replay this ticket's tests assert through OGM-041's `design?rev=` route.
- `docs/architecture/architecture-scope.html` "Version numbers" row (verified at 9508c1c): Kevin's counter scheme in his words; copy the semantics, not the HTML.
- `prototypes/studio-v0/data.js` (verified): `version` strings on cards; display reference only.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest; API binds `127.0.0.1`; secrets via `packages/config` only; no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — `deriveVersion`

Goal: a pure, tested function for the display number.

Files: Create `packages/design-log/src/version.ts`; export from `src/index.ts`; Test `packages/design-log/test/version.test.ts`.

Approach: `deriveVersion({publishCount, buildsSinceFork, txSinceLatestBuild})` returns `${publishCount}.${buildsSinceFork}.${txSinceLatestBuild}`; all inputs non-negative integers (throw on anything else). Document in a header comment: major = publishes on `main` (first publish → 1), minor = tested builds on this branch since its fork (for `main`: since the last publish), patch = transactions since the branch's latest build was registered (resets when minor rises by construction). Also export `compareVersions(a, b)` (numeric per segment) for OGM-077's sorting.

Interface sketch: `export function deriveVersion(c: { publishCount: number; buildsSinceFork: number; txSinceLatestBuild: number }): string`.

Test scenarios:
- Given `(0,0,0)`, then `'0.0.0'`; given `(1,3,2)`, then `'1.3.2'`.
- Given a negative or fractional count, then it throws `InvalidCounts`.
- Given `compareVersions('1.10.0','1.9.9')`, then `> 0` (numeric, not lexical).

### U2 — Branch service

Goal: create with an atomic fork point, list, rename, archive, cap.

Files: Create `services/api/src/branches/service.ts`; Modify `services/api/src/design/store.ts` (add `assertWritable(branch)` guard called by `appendTransaction`, one function); Test `services/api/src/branches/service.test.ts`.

Approach: `createBranch(db, {gameId, name, fromBranchId = main, userId})` inside one `BEGIN IMMEDIATE` transaction: count active non-main branches (`>= 5` → `CapActive{active}`); read parent row (`head_rev`, `latest_build_id`); read the parent's latest build `git_sha` from the `builds` table if OGM-045 has merged (else `null`; refresh); insert `{id: ulid(), name, git_ref: 'branch/'+id, fork_parent_branch_id, fork_parent_rev: parent.head_rev, fork_git_sha, head_rev: 0, latest_build_id: parent.latest_build_id, status: 'active', created_by}`. `archive(branchId)`: refuse `main`; set `status 'archived'`; OGM-041's append now rejects via `assertWritable` (409 `branch_archived`). `rename` validates the name. `setStatus(branchId, 'merged')` exported for OGM-044. Policy: `authorize(actor, 'game.edit', {gameId, ownerId})`.

Interface sketch:
```ts
export function createBranch(db, input: { gameId: string; name: string; fromBranchId?: string; userId: string }): Branch;  // throws CapActive | NameTaken
export function archiveBranch(db, branchId: string): Branch;        // throws MainImmutable
export function setStatus(db, branchId: string, status: Branch['status']): void;
```

Test scenarios:
- Given main at head 40, when created, then `forkPoint.parentRev` 40 and `latestBuildId` equals main's.
- Given an append to main racing the create (two `BEGIN IMMEDIATE` transactions), then the child's `parentRev` is either 40 or 41 and `design?rev=` on the child matches `replay(main, parentRev)` exactly (no torn fork).
- Given five active branches, then `CapActive` listing them; archiving one allows a new create.
- Given `archive(main)`, then `MainImmutable`.
- Given an archived branch, when OGM-041's append runs, then 409 `branch_archived`.

Execution note: test-first on the cap and the archived-write guard; both fail without the production change.

### U3 — Version counts provider

Goal: per-branch counts from the tables that exist, with the two OGM-045-backed functions stubbed to 0 and named.

Files: Create `services/api/src/branches/version-counts.ts`; Test `version-counts.test.ts`.

Approach: `txSinceLatestBuild(branch)`: count `design_transactions` rows with `branch_id` and `rev > revAtLatestBuild`, where `revAtLatestBuild` is the `rev` of the last transaction with `kind='system'` and `commands[0].command === 'build.switch'` (OGM-042's switch), or the fork point's own rev 0 when none. `publishCount(gameId)` and `buildsSinceFork(branch)`: query `releases` and `builds` when those tables exist (OGM-045); until then return 0 and carry a comment `// OGM-045 completes this`. `versionFor(branch)` composes the three and calls `deriveVersion`.

Interface sketch: see the ticket's `VersionCounts` interface.

Test scenarios:
- Given 3 transactions after a switch transaction and 2 before, then `txSinceLatestBuild` 3.
- Given no switch transaction, then all transactions count.
- Given the OGM-045 tables absent, then `publishCount` 0 and `versionFor` → `'0.0.3'`.

### U4 — Routes

Goal: five routes mounted by the directory scan.

Files: Create `services/api/src/branches/routes.ts`; Test `routes.test.ts` (Hono `app.request`).

Approach: `POST /api/v1/games/:g/branches` (body `{name, fromBranchId?}` Zod), `GET` list with `version` for each row, `GET …/:b`, `PATCH …/:b {name}`, `POST …/:b/archive`. Map `CapActive` → 409 `{error:'cap_active', active}`, `NameTaken` → 409, `MainImmutable` → 409, validation → 422, policy deny → 403. Export the constant `BUILDERS_ON_MAIN_COPY = 'Builders work on the main version'` from `service.ts` for OGM-077.

Interface sketch: see the ticket's route block.

Test scenarios:
- Given a creator, when `POST {name:'Spooky monsters'}`, then 201 with `gitRef: 'branch/<id>'` and `headRev 0`.
- Given another family member who is not the owner, then 403.
- Given a name of 61 characters, then 422.
- Given the list route after one publish is recorded by OGM-045 (skipped with a named reason when OGM-045 is absent), then `main.version` starts with `1.`.

## 4. Verification

```
pnpm --filter @ogm/design-log test -- version
pnpm --filter @ogm/api test -- branches
pnpm -r typecheck && pnpm lint
pnpm --filter @ogm/api dev &
curl -s -X POST http://127.0.0.1:${OGM_API_PORT}/api/v1/games/g_01/branches -H 'content-type: application/json' -d '{"name":"Spooky monsters"}'
curl -s http://127.0.0.1:${OGM_API_PORT}/api/v1/games/g_01/branches
```
Paste the Vitest summaries, the two curl outputs and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Whether `fork_git_sha` is required: default nullable until OGM-045's `builds` rows exist.
- Name uniqueness scope: default per game, case-insensitive.
- Whether archived branches are listed by default: default yes with `status`; OGM-077 filters.
- `revAtLatestBuild` source: default OGM-042's `build.switch` system transaction; if OGM-042 is not merged, every transaction counts (documented).

## 6. Scope boundaries

- No merge computation or landing (OGM-044); no `status: 'merged'` logic beyond `setStatus`.
- No builds, releases, publish or rollback (OGM-045); no version display on cards (OGM-077).
- No Git ref creation (D-BRANCH-BASE; the commit contract has no such op).
- No room pinning (OGM-051) or save tagging (OGM-046); they carry `branchId` already.

## 7. Risks

- Kevin's version scheme is an assumption pending his answer (`questions-or-commands.md` A1, D-VERSION): default implemented as derived counts; changing it later touches one function.
- Branch cap and archive semantics could clash with OGM-077's UX: default cap excludes `main`, archived branches remain readable.
- `CommitOp` lacks `create_branch`: default no Git at creation; OGM-044 lands merges with `fold_design`; the gap is noted for OGM-035's owner.
