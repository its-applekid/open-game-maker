# OGM-048 plan — Forks

## 1. Problem frame

A fork is a new game whose first state equals a published release of another game: the folded design at the release tag, the reusable assets, the achievement definitions and the uploads, in a new repository under the creator's GitHub. It must copy nothing that belongs to players (saves, awards, progress, analytics) or to the source creator's draft (working set), and it must re-check usage rights because the fork's visibility may differ. Every piece exists in sibling tickets; this ticket is the orchestration and the guarantees.

Requirements trace: R95 → copy published design, assets and achievement definitions into a new game and repo in the creator's GitHub, never runtime data, rights re-checked.

## 2. Patterns to follow

- `services/api/src/releases/{publish,commit-client,rights}.ts` (OGM-045): the commit client and the rights pre-check; copy the sequencing style (check → external call → one DB transaction) and the error mapping (`GateRefused` → verdict passthrough).
- `services/api/src/achievements/catalog.ts` (OGM-047): `copyCatalog`; call, don't reimplement.
- `services/api/src/design/store.ts` (OGM-041): `ensureMainBranch`.
- `docs/research/v0.3/A5-releases-saves-achievements-analytics-rewind.md` §4.3 "Forks" and spec §5.17 (verified at 9508c1c): the never-copy list; encode as the zero-rows assertion.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest; API binds `127.0.0.1`; secrets via `packages/config` only (`OGM_COMMIT_SERVICE_TOKEN` reused through OGM-045's client); no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Provenance columns

Goal: `games` carries `forked_from_game_id`, `forked_from_release_id`, `forkable`.

Files: Create migration `packages/db/migrations/<ts>_games_forked_from.sql`; Modify `packages/db/src/schema/games.ts` only if OGM-012's schema file is the declared source of the column list (refresh; otherwise the migration alone plus a type extension in `forks.ts`).

Approach: `ALTER TABLE games ADD COLUMN forked_from_game_id TEXT NULL; ADD COLUMN forked_from_release_id TEXT NULL; ADD COLUMN forkable INTEGER NOT NULL DEFAULT 1;` (skip `forkable` if present).

Test scenarios:
- Given migration, then the columns exist and existing rows read `forkable = 1`.

### U2 — `forkGame`

Goal: the orchestration with the guarantees.

Files: Create `services/api/src/forks.ts` (or `services/api/src/forks/{routes,service}.ts` per the scan); Test `services/api/src/forks.test.ts`.

Approach: `forkGame(db, deps, { sourceGameId, releaseId, visibility, name, actor })`:
1. `authorize(actor, 'game.fork', { gameId: sourceGameId, ownerId, visibility })`; source `forkable` must be true.
2. `release = releases.get(releaseId)`; must belong to `sourceGameId` (404 otherwise); `build = builds.get(release.buildId)`; `snapshot = snapshots.get(release.snapshotId)`; `foldSha` from the snapshot row (OGM-045 stores it).
3. `rights.check({ lockfilePath: join(build.artifactPath, 'assets.lock.json'), visibility, mode: 'publish' })` → `RightsViolation{items}` (422).
4. `newGameId = ulid()`; `commit.fork({ kind:'fork', sourceGameId, sourceSha: foldSha, newGameId, owner: actor.githubLogin })` → `{sha}` or `GateRefused` (502); if `visibility` differs from the commit service default (private), `commit.set_visibility({ gameId: newGameId, visibility })`.
5. One SQLite transaction: insert `games {id: newGameId, name: name ?? source.name + ' (fork)', owner_id: actor.userId, visibility, forked_from_game_id, forked_from_release_id}`; `ensureMainBranch(newGameId)`; insert `builds {id: ulid(), game_id: newGameId, branch_id: main.id, git_sha: sha, sdk_version: build.sdkVersion, save_schema_version: build.saveSchemaVersion, achievement_catalog_hash: build.achievementCatalogHash, status:'tested', artifact:'present', artifact_path: build.artifactPath}`; set `branches.latest_build_id`; `copyCatalog(db, sourceGameId, newGameId, null)`; `blobRoots.addReferences(newGameId, blobRoots.listReferences(sourceGameId, 'uploads'))` (OGM-005 API; refresh names).
6. Return `{ game, build, release: null }`.
`deps` is an object `{ commit, rights, blobRoots, authorize }` so tests inject fakes.

Interface sketch:
```ts
export async function forkGame(db, deps: ForkDeps, input: { sourceGameId: string; releaseId: string; visibility: 'public'|'private'; name?: string; actor: Actor }): Promise<{ game: GameRow; build: Build; release: null }>;
// errors: NotForkable | ReleaseNotFound | RightsViolation | GateRefused
```

Test scenarios (fake commit server from OGM-045's tests, fixture lockfiles):
- Given the worked data (Kenney, `free`), when forked public, then `fork` then `set_visibility` were received, rows exist as described, catalog count equals the source's, and `SELECT count(*)` over `save_slots`, `save_revisions`, `achievement_awards`, `achievement_progress`, `creator_analytics_events`, `creator_analytics_daily` for `g_02` is 0.
- Given a Synty asset (`redistribution: 'none'`) and `public`, then `RightsViolation` naming the asset, no commit call, no rows.
- Given the same with `private`, then 201 and no `set_visibility` op.
- Given the commit server answers `{ok:false, verdict}`, then `GateRefused` and no rows (transaction never opened).
- Given `releaseId` belonging to another game, then `ReleaseNotFound`.
- Given `forkable = 0`, then `NotForkable`.
- Given the new game's `design?rev=0` through OGM-041 with `FsBaseDocSource` pointed at the source artifact, then it equals the release's folded doc.

Execution note: test-first on the zero-runtime-rows assertion and the rights refusal; both fail without the production ordering.

### U3 — Route

Goal: `POST /api/v1/games/:g/fork` mounted by the scan.

Files: same file(s) as U2; Test `forks.routes.test.ts`.

Approach: Zod body `{ releaseId: ulid, visibility: enum, name?: string(1..60) }`; error map `NotForkable` → 403, `ReleaseNotFound` → 404, `RightsViolation` → 422 `{rights}`, `GateRefused` → 502 `{verdict}`; a single retry of `commit.fork` with the same `newGameId` on a network error before surfacing 502.

Test scenarios:
- Given the happy body, then 201 with `game.forkedFrom` and `build.status 'tested'`.
- Given `visibility: 'listed'`, then 422.
- Given a network error on the first `fork` call and success on the retry, then 201 and exactly two calls with the same `newGameId`.

### Test fixtures

Two lockfile excerpts under `services/api/src/forks.fixtures/` (shape from OGM-062's `AssetsLock`):

```json
{ "version": 1, "family": "kenney-mini", "pov": "iso", "assets": [
  { "id": "t1:kenney-mini-dungeon/character-orc@2.0", "sha256": "…", "path": "assets/orc.glb", "license": "CC0-1.0",
    "rights": { "uses": ["in-game"], "audience": "public", "redistribution": "free", "attribution": null }, "added": "2026-11-01" } ] }
```
```json
{ "version": 1, "family": "synty-polygon", "pov": "iso", "assets": [
  { "id": "t1:synty-polygon-dungeon/door@1.0", "sha256": "…", "path": "assets/door.fbx", "license": "LicenseRef-Synty-EULA",
    "rights": { "uses": ["in-game"], "audience": "private", "redistribution": "none", "attribution": null }, "added": "2026-11-01" } ] }
```

Expected op log on the fake commit server for the happy public fork, asserted in order:

```
1. { kind: 'fork', sourceGameId: 'g_01', sourceSha: '9c0d…', newGameId: 'g_02', owner: 'its-everdred' }   → { ok: true, sha: '9c0d…' }
2. { kind: 'set_visibility', gameId: 'g_02', visibility: 'public' }                                      → { ok: true, sha: '9c0d…' }
```

For the private fork only line 1 appears; for the Synty public case the log is empty.

### Execution order

1. U1 migration; U2 with the zero-runtime-rows and rights-refusal tests written first.
2. Wire the fake commit server from OGM-045's test helpers (do not write a second one).
3. U3 route and the retry test; then the `design?rev=0` equivalence test through OGM-041.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- forks
pnpm -r typecheck && pnpm lint
pnpm --filter @ogm/api dev &
curl -s -X POST http://127.0.0.1:${OGM_API_PORT}/api/v1/games/g_01/fork -H 'content-type: application/json' -d '{"releaseId":"rel_3","visibility":"private","name":"Spooky fork"}'
```
Paste the Vitest summary (name the zero-rows and rights tests), the curl response, and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Single file vs directory for the context: default follow OGM-010's scan (directory with `routes.ts` if required; the build-order surface `services/api/src/forks.ts` is honoured by keeping the service in that file and adding only the router file).
- Upload re-referencing API name on `packages/blob-store`: default `addReferences`/`listReferences`; refresh against OGM-005.
- Whether the fork's first build copies the artifact directory or references it: default reference (content is immutable and content-addressed by build id); copy only if OGM-007 requires a per-game directory on disk (then a hard-link tree).
- Default fork name: `"<source name> (fork)"`.

## 6. Scope boundaries

- No suggest-back or PRs between forks; no fork counts.
- No changes to the commit service, gate or repo provisioning (OGM-035, OGM-039, OGM-036).
- No UI (OGM-073/OGM-077).
- No copying of saves, awards, progress, analytics or the working set (R95; test-enforced).

## 7. Risks

- `CommitOp.fork` has no `visibility`: default follow with `set_visibility`; note for OGM-035's owner.
- The rights check needs the lockfile at the release's artifact path: default `<artifactPath>/assets.lock.json` (OGM-063 places it; refresh); if absent, refuse public forks with `rights: [{rule:'lockfile_missing'}]`.
- Artifact referencing across games may not fit OGM-007's `/g/<gameId>/<buildId>/` layout: default a hard-link tree created by OGM-045's artifact helper if it exists, else reference; documented in the PR.
