# OGM-045 plan — Builds, releases, publish, fold, rollback, update indicator

## 1. Problem frame

A tested build on `main` plus the creator's working set is what players should get. Publish must be instant and deterministic: reduce the log into a content-hashed snapshot, fold it into `design/design.json` through the commit service (the only Git writer, behind the content gate), tag, append a release row and move one pointer by compare-and-set. Rollback is another row. The update indicator is one ETag'd read. No model call anywhere; the changelog is assembled from notes and labels.

Requirements trace: R90 → tested build on `main`, deterministic fold through the commit service behind the gate, tag `gm/<gameId>/v<version>`, release row, CAS pointer; R92 → rollback as a new release pointing at the older `(build, snapshot)`, affected-save count, nothing deleted, artifacts kept; R93 → changelog from `.gm/changes` notes and transaction labels, ETag polling route.

## 2. Patterns to follow

- `services/api/src/design/{routes,store,base-doc}.ts` (OGM-041) and `services/api/src/branches/*` (OGM-043): router shape, store transactions, `VersionCounts`.
- `packages/design-log/src/{reduce,canonical}.ts` (OGM-040): the fold is `reduce` applied to the base doc then canonicalised; `sha256Canonical` for the snapshot hash.
- `services/commit/*` (OGM-035) and `packages/contracts/src/commit.ts`: the `CommitOp` union to post; copy its fake-server test helper if one exists.
- `docs/research/v0.3/A5-releases-saves-achievements-analytics-rewind.md` §2.2–2.7 (verified at 9508c1c): option B pointer model, failure modes §2.7, tests §2.8; encode §2.7's cases as tests.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest; API binds `127.0.0.1`; secrets only via `packages/config` names (`OGM_COMMIT_SERVICE_TOKEN`, `OGM_COMMIT_PORT`, `OGM_SERVICE_TOKEN`, `OGM_RELEASES_ROOT`, `OGM_GAMES_ORIGIN`); no new dependency; PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Schema and migrations

Goal: `builds`, `override_snapshots`, `releases`, `change_notes`, and `games.published_release_id`.

Files: Create `packages/db/src/schema/releases.ts` (+ barrel line); migrations `<ts>_builds.sql`, `<ts>_releases.sql` (snapshots, releases, change_notes), `<ts>_games_published_release.sql` (`ALTER TABLE games ADD COLUMN published_release_id TEXT NULL`).

Approach: columns mirror the contract types one to one; `builds.artifact_path` extra (server-side only); `releases` unique `(game_id, seq)`; `change_notes (id, game_id, job_id NULL, tx_id NULL, kind, text, created_at, release_id NULL)`; `override_snapshots.entries`/`entity_ops` as JSON text with `sha256`.

Test scenarios:
- Given an empty database, when migrated, then the four tables and the column exist.
- Given two releases with the same `(game_id, seq)`, then unique violation.

### U2 — Build registration

Goal: the builder can register and update builds; `tested` triggers the siblings.

Files: Create `services/api/src/releases/builds.ts`, `routes.ts` (internal routes); Test `builds.test.ts`.

Approach: `POST /internal/games/:g/builds` validated by `BuildSchema.omit({id, status, artifact, createdAt})` plus `artifactPath`, `changeNotes?: ChangeNote[]` (parsed by the builder from `.gm/changes/*.md` frontmatter `kind` + body; this ticket only stores); status starts `building`; `PATCH /internal/builds/:id {status}`; on `tested`: if the branch's `latest_build_id` is null set it; insert change notes with `job_id`; call `onBuildTested` from `services/api/src/design/reapply.ts` when the module exists (dynamic import guarded; one-line wiring per OGM-042). `GET /api/v1/games/:g/builds` lists for the UI. Auth: `OGM_SERVICE_TOKEN` bearer on `/internal/*` (the same guard OGM-010 established; refresh).

Interface sketch: see the ticket's Scope block.

Test scenarios:
- Given a valid body, then a `building` row; `PATCH tested` → `tested`, `latest_build_id` set when null, change notes stored.
- Given a missing service token, then 401.
- Given `PATCH` to an unknown status, then 422.

### U3 — Fold

Goal: deterministic files from a base doc and a working set.

Files: Create `packages/design-log/src/fold.ts`; export; Test `packages/design-log/test/fold.test.ts`.

Approach: `fold(baseDoc, workingSet)`: start from `baseDoc`; apply `entityOps` creates, then deletes, then entries with status `carried` or `renamed` in sorted key order (set `globals[control]` or `entities[target].props[control]`); result `doc`; `files = [{ path: 'design/design.json', content: canonical(doc) + '\n' }]`; `sha256 = sha256Canonical({entries, entityOps})` for the snapshot. Pure; `needs_choice`, `conflict` (creator value already in `value`; conflicts are carried with the creator's value per E08-4, so include them) and `dropped` handled per the fixed rule: include `carried`, `renamed`, `conflict`; exclude `needs_choice`, `dropped`.

Interface sketch: `export function fold(baseDoc: DesignDoc, ws: WorkingSet): { doc: DesignDoc; files: { path: string; content: string }[]; sha256: string }`.

Test scenarios:
- Given the same input twice, then byte-identical `files` and equal `sha256`.
- Given entries inserted in reverse key order, then identical output.
- Given a `needs_choice` entry, then its value is absent from `doc`.
- Given a create then a set on the created entity, then the entity exists with the set value.

### U4 — Publish

Goal: the full publish sequence with CAS and idempotent retry.

Files: Create `services/api/src/releases/publish.ts`, `commit-client.ts`, `rights.ts`; Test `publish.test.ts` with an in-process fake commit server.

Approach: `publish(db, src, {gameId, buildId, changelog?, actor})`: authorize `game.publish`; load build (`tested`, branch `main`) else `NotTested`/`NotMain`; `rights.ts` runs OGM-062's check on `<artifactPath>/assets.lock.json` with the repo's visibility (from the `games` row; refresh column name) → `RightsViolation{items}`; `workingSet = reduce(readChain(main), baseDoc(build))`; `fold`; insert `override_snapshots` (or reuse by `(game_id, build_id, sha256)`); `commit.fold_design {gameId, base: build.gitSha, files}` → `{sha}` (on `ok:false` throw `GateRefused{verdict}`); `version = deriveVersion({publishCount: current + 1, buildsSinceFork, txSinceLatestBuild})`; `changelog = assemble(...)` (U6) unless supplied; `commit.release {gameId, sha, semver: version, changelog: rendered}`; in one SQLite transaction insert the release `{seq: max+1, version, buildId, snapshotId, gitTag: 'gm/'+gameId+'/v'+version, kind:'publish', predecessorReleaseId: current, changelog, publishedBy}` and CAS the pointer (`UPDATE games … WHERE published_release_id IS :expected`; 0 rows → `PointerMoved`, roll back the insert). Attach `release_id` to the consumed change notes. Call OGM-047's `registerCatalog(gameId, releaseId, defs)` when the module exists (defs from the artifact's `achievements.json`; one guarded import).

Interface sketch: `publish(...) → Release`; errors `NotTested | NotMain | RightsViolation | GateRefused | PointerMoved`.

Test scenarios:
- Given a tested main build, when published, then the fake commit server received `fold_design` then `release` in that order, a release row with `seq 1`, `version '1.0.0'`, the pointer set.
- Given a `failed` build, then `NotTested` and no commit call.
- Given a branch build, then `NotMain`.
- Given the fake server returns `{ok:false, verdict}`, then `GateRefused` with the verdict, no row, pointer unchanged.
- Given the lockfile holds a `redistribution: 'none'` asset and visibility public (AE5), then `RightsViolation` naming the asset and no commit call.
- Given two concurrent publishes of two tested builds, then one release and one `PointerMoved`.
- Given `release` fails after `fold_design` succeeded, when retried, then the snapshot row is reused and `fold_design` is not re-sent (idempotency by `(game_id, build_id, sha256)` with the stored `fold_sha`).

Execution note: test-first for the CAS and the gate-refusal paths.

### U5 — Rollback and the published read

Goal: rollback as a row; the ETag route.

Files: Create `services/api/src/releases/rollback.ts`, `published.ts`; Modify `routes.ts`; Test `rollback.test.ts`, `published.test.ts`.

Approach: `rollback(db, {gameId, releaseId, actor})`: load the target release; `commit.release {gameId, sha: target's fold sha, semver: newVersion, changelog: 'Restores <version>'}` (a new tag on the same commit); insert `{kind:'rollback', restoresReleaseId, buildId, snapshotId, seq, version: deriveVersion(publishCount+1, …), predecessorReleaseId: current}`; CAS pointer; `affectedSaves = saveCounter.countSavesAboveSchema(gameId, restoredBuild.saveSchemaVersion)` where `saveCounter` is an interface in `rollback.ts` with a default returning `null`; OGM-046 wires the real one. `GET /api/v1/games/:g/published`: 404 when the pointer is null; else `{releaseId, version, buildUrl: `${OGM_GAMES_ORIGIN}/g/${gameId}/${buildId}/`, changelog}` with `ETag: "<releaseId>"` and 304 on match; `Cache-Control: no-cache`.

Test scenarios:
- Given releases 1.0.0 and 2.0.0 live, when rolling back to 1.0.0, then a `rollback` row with `restoresReleaseId` = 1.0.0's id, version `3.0.0`, pointer → new row, the 2.0.0 build still `artifact:'present'`.
- Given no OGM-046 counter, then `affectedSaves: null`; given a stub counter returning 2, then 2.
- Given `If-None-Match` equal to the current release id, then 304; after a publish, 200 with the new ETag.
- Given a never-published game, then 404.

### U6 — Changelog assembly and change notes

Goal: deterministic release notes with a privacy lint; the notes route.

Files: Create `services/api/src/releases/changelog.ts`; Modify `routes.ts`; Test `changelog.test.ts`.

Approach: `assemble(db, gameId, sinceReleaseId)`: items = `change_notes` with `release_id IS NULL` (kinds from frontmatter) + `design_transactions` on `main` with `kind:'manual'` after the predecessor's publish rev, mapped to `{txId, kind:'change', text: label}`; dedupe by normalised text; lint removes items containing an email, URL or `@handle` and replaces with "(edited)"; `summary` = first note's text or "Updates"; returns `{summary, items}`; `render` = Markdown list for the `release` op. `POST /api/v1/games/:g/change-notes {jobId?, kind, text}` with the job token (OGM-013's per-job token guard; refresh) for `gm changes add` (CLI owned by the gm-cli lane; not in this ticket).

Test scenarios:
- Given two notes and three labels, then five items in note-then-label order with duplicates removed.
- Given a label containing `kevin@example.com`, then it is replaced by "(edited)".
- Given a note posted with an invalid kind, then 422.

### U7 — Version counts completion

Goal: OGM-043's two stubbed functions read these tables.

Files: Modify `services/api/src/branches/version-counts.ts` (two function bodies).

Approach: `publishCount(gameId)` = count of `releases` rows for the game (publish and rollback both count: a rollback is a new major, E08-6 default D1); `buildsSinceFork(branch)` = count of `builds` with `branch_id = branch.id`, `status='tested'`, `created_at > fork time` (for `main`: after the latest release's `published_at`).

Test scenarios:
- Given one publish and one rollback, then `publishCount` 2.
- Given two tested builds on main after the last release, then `buildsSinceFork(main)` 2.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/design-log test -- fold
pnpm --filter @ogm/api test -- releases
pnpm --filter @ogm/api test -- branches   # version counts now live
pnpm -r typecheck && pnpm lint
pnpm --filter @ogm/api dev &
curl -si http://127.0.0.1:${OGM_API_PORT}/api/v1/games/g_01/published
```
Paste the Vitest summaries (name the AE5 and double-publish tests), the curl headers showing `ETag`, and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Fold file layout: default one file `design/design.json`; if OGM-023/OGM-024 templates split design files, fold mirrors the artifact's file set (names from `design/index.json`).
- Where the repo visibility lives: default `games.visibility` (OGM-012); refresh.
- Rights pre-check mechanism: default import `checkAssets`; fallback spawn `gm check assets --publish`.
- Idempotency key for a retried publish: default `(game_id, build_id, snapshot sha256)` with `fold_sha` stored on the snapshot row.
- Tag on rollback: default a new tag `gm/<gameId>/v<newVersion>` on the restored sha.

## 6. Scope boundaries

- Artifact creation, copying to the release directory, `gm build assets`, `gm verify`: OGM-032/OGM-036/OGM-063/OGM-090/OGM-007.
- Gate rules and the check run: OGM-039; the ops: OGM-035.
- Save status marking and migration: OGM-046 (this ticket only counts through an interface).
- Screens: OGM-077 (publish, releases, rollback confirm), OGM-075 (update banner polling `GET /published`).
- Forks: OGM-048.

## 7. Risks

- Commit service or GitHub App not live at pickup (GATE-GITHUB-APP): default all tests run against the fake server; the live path is exercised by OGM-100.
- Partial failure between `fold_design` and `release`: default idempotent retry keyed by snapshot sha; documented in the ticket's failure section.
- Two writers of `games` (OGM-012 and this ticket): default a separate timestamped migration adding one nullable column; conflicts resolved by re-running `drizzle-kit`.
- Changelog lint false positives: default conservative patterns (email, URL, `@handle`) only.
