# OGM-041 plan — Design-log API, lease and watcher stream

## 1. Problem frame

OGM-040 gives the pure operations; this ticket gives them a home: SQLite tables through Drizzle, a fenced append route, an SSE stream per branch, a snapshot-at-revision read, and the single-writer edit lease. Everything downstream (re-apply, branches, merge, publish, the editor, room watchers) reads and writes design state only through these routes.

Requirements trace: R31 → `design_transactions` append-only with server-assigned `rev`; R32 → `edit_leases` keyed `(gameId, branchId)` with heartbeat, fencing and silent same-user takeover; R35 → SSE per branch relaying the stored `Transaction` unchanged; R36 → `GET …/design?rev=N`.

## 2. Patterns to follow

- `services/api/src/<first-context>/routes.ts` and `packages/db/src/schema/<first-context>.ts` as merged by OGM-010 (refresh at pickup): Hono router with Zod-validated bodies, directory-scanned mount, Drizzle table definitions. Copy the file names and the export shape exactly so the scan picks the router up.
- `packages/design-log/src/{replay,reduce,validate}.ts` (OGM-040): the library this ticket calls; never reimplement.
- T07 §4.2 route table (`docs/plans/ogm-v1-build/evidence/T07-multiplayer.md` lines 247–254): the snapshot route watchers call; keep its query parameter name `rev`.
- `scripts/drive-sync/ogm-drive-sync.service` (verified at 9508c1c): not touched here; the API unit from OGM-002 is the runtime.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; service binds `127.0.0.1`; secrets only via `packages/config` names (`OGM_SERVICE_TOKEN`, `OGM_RELEASES_ROOT`); no dependency below 1k stars (Hono, Drizzle, better-sqlite3 all qualify); PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Schema and migration

Goal: three tables exist and migrate from empty.

Files: Create `packages/db/src/schema/design.ts`; append one export line to `packages/db/src/schema/index.ts`; generate `packages/db/migrations/<timestamp>_design_log.sql`.

Approach: Drizzle `sqliteTable`s. `branches`: `id` PK, `game_id`, `name`, `git_ref`, `fork_parent_branch_id` null, `fork_parent_rev` null, `fork_git_sha` null, `head_rev` int default 0, `latest_build_id` null, `status` text, `created_by`, `created_at`; unique `(game_id, name)`. `design_transactions`: `id` PK, `game_id`, `branch_id` FK, `rev` int, `base_rev`, `lease_token`, `actor`, `kind`, `label`, `base_build_id`, `commands` JSON text, `patches` JSON text, `inverse` JSON text, `created_at`; unique `(branch_id, rev)`. `edit_leases`: `game_id`, `branch_id`, `holder_user_id`, `session_id`, `token` int, `expires_at`; PK `(game_id, branch_id)`.

Interface sketch (SQL excerpt the migration must contain):
```sql
CREATE TABLE design_transactions (... rev INTEGER NOT NULL, ..., UNIQUE(branch_id, rev));
CREATE TABLE edit_leases (game_id TEXT, branch_id TEXT, holder_user_id TEXT NOT NULL, session_id TEXT NOT NULL, token INTEGER NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(game_id, branch_id));
```

Test scenarios:
- Given an empty database, when `migrate` runs, then the three tables exist (`sqlite_master` query).
- Given two inserts with the same `(branch_id, rev)`, then the second fails with a unique violation.

### U2 — Store: ensureMainBranch, append, read

Goal: the fenced append and the ordered read, inside one SQLite transaction.

Files: Create `services/api/src/design/store.ts`; Test `services/api/src/design/store.test.ts`.

Approach: `ensureMainBranch(db, gameId)` inserts `{name:'main', git_ref:'main', fork:null, status:'active'}` on conflict do nothing and returns the row. `appendTransaction(db, input)` runs `db.transaction(() => …)` with `BEGIN IMMEDIATE` (better-sqlite3 `immediate` option): read `head_rev`; if `input.baseRev !== head_rev` throw `StaleBaseRev{headRev}`; if `input.kind === 'manual'` read the lease and throw `LeaseMismatch` when `token !== input.leaseToken` or `session_id !== input.sessionId` or expired; insert with `rev = head_rev + 1`, `id = ulid()`; update `branches.head_rev`; return the row. `readTransactions(db, branchId, afterRev, limit?)` ordered by rev. `readChain(db, branchId)` walks `fork_parent_branch_id` to the root and returns `[{branch, txs}]` for `replay`. Export `insertBranch(db, row)` for OGM-043.

Interface sketch:
```ts
export function appendTransaction(db: Db, input: Omit<Transaction,'id'|'rev'|'createdAt'> & { sessionId?: string }): Transaction;
export function readTransactions(db: Db, branchId: string, afterRev: number, limit?: number): Transaction[];
export function readChain(db: Db, branchId: string): Array<{ branch: Branch; txs: Transaction[] }>;
```

Test scenarios:
- Given head 41 and `baseRev` 41, when appended, then `rev` 42 and head 42.
- Given head 42 and `baseRev` 41, then `StaleBaseRev{headRev:42}` and no row.
- Given 50 appends fired concurrently from `Promise.all` with the correct sequence of `baseRev`s retried on 409, then revs 1–50 exist with no gap (sqlite serializes).
- Given a `system` append with `leaseToken 0`, then no lease check.

Execution note: test-first; the concurrency test must fail if `BEGIN IMMEDIATE` is replaced by a read-then-write outside a transaction.

### U3 — Lease

Goal: acquire, heartbeat, release, silent same-user takeover, expiry.

Files: Create `services/api/src/design/lease.ts`; Test `lease.test.ts`.

Approach: `acquire(db, {gameId, branchId, userId, sessionId})`: authorize `game.edit`; if no row or expired or same `holder_user_id` → upsert `{holder: userId, session: sessionId, token: old.token + 1, expires_at: now + 120 s}` and return; if another user holds an unexpired lease → `LeaseHeld` (403 in the route; admins are not special, release plan §6 Q5). `heartbeat` extends `expires_at` when `session_id` matches (15 s client cadence; 120 s expiry). `release` deletes when session matches. `checkForWrite(db, …)` used by U2.

Interface sketch: `acquire(...) → { token: number; expiresAt: string }`; errors `LeaseHeld{holderUserId}`.

Test scenarios:
- Given no lease, when acquired, then token 1.
- Given user A session s1 holds token 3, when A session s2 acquires, then token 4 and s1's next write → `LeaseMismatch`.
- Given user A holds, when user B (admin) acquires, then `LeaseHeld`.
- Given an expired lease, when B acquires, then granted.

### U4 — Routes and SSE

Goal: the five routes mounted by the scan; SSE fan-out in process.

Files: Create `services/api/src/design/routes.ts`, `stream.ts`; Test `routes.test.ts` (Hono `app.request`), `stream.test.ts`.

Approach: `routes.ts` exports the router the scan expects. Bodies validated with `TransactionSchema.omit({id, rev, createdAt})` plus `sessionId`; `validatePatches` and `validateCommands` (manifest from the branch's latest build, via `BaseDocSource.manifest(buildId)`; when no build exists skip command validation, keep patch validation) → 422 with the error list. Map `StaleBaseRev` → 409 `{headRev}`, `LeaseMismatch` → 423, `PatchTooLargeError` → 413. On success `stream.publish(branchId, tx)`. `stream.ts`: `EventEmitter` per branch; `GET` handler reads rows `> after` (or `Last-Event-ID`), writes them, then subscribes; `streamSSE` with `event: 'tx'`, `id: rev`, keepalive comment every 25 s; unsubscribes on abort. `format=json` returns the array without subscribing (resync). Authorization: owner may write; `game.play` or room grant holders may read (policy action names from OGM-012; stub in tests).

Interface sketch: see the ticket's route block.

Test scenarios:
- Given rows 1–3 and a subscriber at `after=1`, when row 4 is appended, then the client receives ids 2, 3, 4 in order.
- Given `Last-Event-ID: 3`, then only 4+.
- Given a 300 KB patch body, then 413.
- Given a body whose `patches` path starts at `['secrets']`, then 422 and no row.

### U5 — Snapshot at revision and BaseDocSource

Goal: `design?rev=N` returns the effective doc.

Files: Create `services/api/src/design/snapshot.ts`, `base-doc.ts`; Test `snapshot.test.ts`.

Approach: `BaseDocSource { load(gameId, buildId): Promise<DesignDoc>; manifest(gameId, buildId): Promise<GameManifest> }`. `FsBaseDocSource(root = config.OGM_RELEASES_ROOT)` reads `<root>/g/<gameId>/<buildId>/design/design.json` and `manifest.json` (layout per OGM-007; refresh); `MemoryBaseDocSource` for tests. `snapshotAt(db, src, branchId, rev?)`: chain = `readChain`; base = `latest_build_id ? src.load : EMPTY_DOC`; `replay({baseDoc, chain}, rev)`; return `{rev: min(rev, head), buildId, doc}`. Cache the last computed doc per branch in memory keyed by `(buildId, headRev)` and apply incremental patches for `rev === head` reads (optional; measure first).

Interface sketch: `GET …/design?rev=N → { rev: number; buildId: string | null; doc: DesignDoc }`.

Test scenarios:
- Given main revs 1–5, when `rev=3`, then doc equals `replay` to 3 and the response `rev` is 3.
- Given `rev=99` and head 5, then `rev` 5.
- Given branch B forked from main at 3, when B's snapshot is read, then main's rev 4–5 changes are absent.
- Given a branch with no build, then the empty doc with `buildId: null`.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- design
pnpm -r typecheck && pnpm lint
pnpm --filter @ogm/api dev &  # binds 127.0.0.1
curl -s -X POST http://127.0.0.1:${OGM_API_PORT}/api/v1/games/g_01/branches/main/lease -H 'content-type: application/json' -d '{"sessionId":"s1"}'
curl -N http://127.0.0.1:${OGM_API_PORT}/api/v1/games/g_01/branches/main/transactions?after=0
```
Paste the Vitest summary, the two curl outputs (token response; the SSE lines for one appended transaction) and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Branch route key: `:b` accepts the branch id or the literal `main` (default: both; `main` resolves via `ensureMainBranch`).
- Lease expiry window: default 120 s; heartbeat cadence stays the client's 15 s.
- In-memory snapshot cache: default off until a measured need.
- `format=json` page size: default 500 rows with `nextAfter`.

## 6. Scope boundaries

- No branch create/archive, no version numbers (OGM-043).
- No `builds` table; `latest_build_id` is set by OGM-045/OGM-042's switch (this ticket only reads it).
- No room relay or grant verification (OGM-051/OGM-053); no presence.
- No UI, no undo stack (OGM-075).

## 7. Risks

- OGM-010's layout differs from the assumed `services/api/src/<context>/routes.ts`: default follow OGM-010's `AGENTS.md` note, keep this ticket's file names otherwise.
- Policy module not merged when this starts: default a local `authorize` stub behind the same signature, replaced by the import when OGM-012 lands (note in PR).
- SSE through Netlify's proxy may buffer: default keepalives and `Last-Event-ID`; direct-host WebSocket is OGM-053's concern.
- `design/design.json` file name in the artifact is a guess until OGM-007/OGM-023 land: default that name; `FsBaseDocSource` takes the path from one constant.
