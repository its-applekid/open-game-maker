# OGM-046 plan — Cloud saves

## 1. Problem frame

A player's progress must survive a dead tab, a second device and a creator's new release. Two independent guards (play lease and `If-Match` revision) make the cloud slot safe; an IndexedDB outbox on the host side makes a flaky phone safe; a one-step lazy migration gate keeps old saves loadable without ever deleting a revision. The game only serializes and restores; the host app uploads.

Requirements trace: R94 → cloud autosave plus three manual slots (`slotId: 'auto'|'1'|'2'|'3'`), OCC revisions with `If-Match`/`Idempotency-Key`, device lease (423), IndexedDB outbox, lazy one-step migration from the predecessor release only, rollback status marking (derived).

## 2. Patterns to follow

- `services/api/src/design/{store,lease}.ts` (OGM-041): `BEGIN IMMEDIATE` writes and the lease pattern (heartbeat, expiry, takeover); copy the structure with a 30 s expiry and explicit `takeover`.
- `packages/sdk/src/core/*` (OGM-022): module layout, how `serialize`/`restore`/`migrate` are reached, how bridge messages are sent; copy the test harness for a fake `GameInstance`.
- `docs/research/v0.3/A5-releases-saves-achievements-analytics-rewind.md` §3.3–3.6 (verified at 9508c1c): the state machine diagram and the migration fixture table; encode the diagram's edges and the `two_back.json` case as tests.
- `prototypes/studio-v0/sw.js` (verified): not reused; the outbox is IndexedDB, not the SW cache.

Repository conventions (state in the PR): pnpm workspace; scripts `build`, `test`, `typecheck`, `lint`; Vitest; API binds `127.0.0.1`; secrets via `packages/config`; new dependency `idb` 8 (ISC, 7.4k stars) and dev `fake-indexeddb` (name the exception if below 1k stars at pickup; fallback in-memory adapter); PR first line `Closes #<issue>`; `## Local tests` section.

## 3. Implementation units

### U1 — Schema and migration

Goal: three tables.

Files: Create `packages/db/src/schema/saves.ts` (+ barrel line); migration `<ts>_saves.sql`.

Approach: `save_slots (user_id, game_id, slot_id, kind, label NULL, head_revision INT, PK(user_id, game_id, slot_id))`; `save_revisions (user_id, game_id, slot_id, revision, branch_id, build_id, release_id NULL, save_schema_version INT, payload BLOB, sha256, device_id, client_seq INT, reason, migrated_from_revision NULL, created_at, PK(user_id, game_id, slot_id, revision), UNIQUE(user_id, game_id, slot_id, device_id, client_seq))`; `play_leases (user_id, game_id, device_id, tab_id, expires_at, PK(user_id, game_id))`. `status` is not stored (derived).

Test scenarios:
- Given migration, then tables exist; a duplicate `(device_id, client_seq)` violates the unique index.

### U2 — Store: put with OCC and idempotency, retention

Goal: the write path inside one SQLite transaction.

Files: Create `services/api/src/saves/store.ts`; Test `store.test.ts`.

Approach: `putRevision(db, input)` in `BEGIN IMMEDIATE`: look up an existing row by `(user, game, slot, deviceId, clientSeq)` → return its `revision` (idempotent replay); read slot head (0 if absent); `ifMatch !== head` → `StaleRevision{headRevision}`; insert `revision = head + 1` with `sha256(payload)`; upsert slot head/label/kind; prune: delete revisions older than the newest 5 unless referenced by any row's `migrated_from_revision`. `listSlots`, `getRevision(user, game, slot, revision?)`, `countSavesAboveSchema(gameId, schema)` (count of slots whose head revision's `save_schema_version > schema`, across users).

Interface sketch:
```ts
export function putRevision(db, input: { userId; gameId; slotId; ifMatch: number; payload: Uint8Array; meta: Omit<SaveRevision,'payload'|'revision'|'sha256'|'createdAt'|'userId'|'gameId'|'slotId'> }): { revision: number; replayed: boolean };
export function countSavesAboveSchema(db, gameId: string, schema: number): number;
```

Test scenarios:
- Given head 7 and `ifMatch 7`, then revision 8; given `ifMatch 6`, then `StaleRevision{7}`.
- Given the same `(deviceId, clientSeq)` twice, then `{revision:8, replayed:true}` and one row.
- Given 7 revisions where revision 2 is `migrated_from_revision` of revision 3, then rows 2 and 4–8 remain.
- Given two users each with a head at schema 4 and one at schema 2, when `countSavesAboveSchema(g, 3)`, then 2.

Execution note: test-first on idempotency and retention.

### U3 — Play lease and status

Goal: lease acquire/heartbeat with explicit takeover; derived compatibility status.

Files: Create `services/api/src/saves/lease.ts`, `status.ts`; Test `lease.test.ts`, `status.test.ts`.

Approach: `acquire({userId, gameId, deviceId, tabId, takeover})`: no row or expired or same device → upsert `expires_at = now + 30 s`; other device unexpired and `!takeover` → `LeaseHeld{heldBy}`; with `takeover` → replace. `heartbeat` extends when `device_id` matches. `assertHolder` used by `PUT`. `status.ts`: `deriveStatus(headSchema, schema, migratesFrom)` → `'ok' | 'needs_migration' | 'incompatible_after_rollback' | 'unsupported_old'` per the ticket's table.

Test scenarios:
- Given device A holds, when B acquires without takeover, then `LeaseHeld{A}`; with takeover, then granted and A's next `PUT` → 423.
- Given `deriveStatus(3,3,2)` → `ok`; `(2,3,2)` → `needs_migration`; `(4,3,2)` → `incompatible_after_rollback`; `(1,3,2)` → `unsupported_old`.

### U4 — Routes

Goal: the five routes mounted by the scan.

Files: Create `services/api/src/saves/routes.ts`; Test `routes.test.ts`.

Approach: `PUT` reads headers (`If-Match`, `Idempotency-Key` parsed as `deviceId:clientSeq`, `X-Save-Schema`, `X-Save-Branch`, `X-Save-Build`, `X-Save-Release`, `X-Save-Reason`, `X-Save-Label`, `X-Save-Kind`), body as `ArrayBuffer`, size check before read via `Content-Length` and again after (> 524,288 → 413), `assertHolder` (423), `putRevision` (409 on stale), 200 `{revision}`. `GET /saves/:g?schema&migratesFrom` lists slots with derived status and `olderCompatible: number[]` (revisions whose schema ≤ `schema`). `GET /saves/:g/:slot?revision=` streams the BLOB with `X-Save-Schema`, `X-Save-Revision`, `Content-Encoding: gzip`. Lease routes as in U3. Policy: `authorize(actor,'game.play',{gameId})`; the user id comes from the session (OGM-011); a user reads only their own slots.

Test scenarios:
- Given the worked data in the ticket, then the three responses (200, replay 200, 423) match.
- Given a 513 KB body, then 413 and no row.
- Given `GET` with `schema=4&migratesFrom=3` on a head at schema 3, then `status:'needs_migration'`.

### U5 — SDK machine (iframe side)

Goal: dirty tracking and triggers that end in `save.write`.

Files: Create `packages/sdk/src/saves/machine.ts`, `index.ts`; Test `packages/sdk/test/saves/machine.test.ts`.

Approach: `createSaveMachine({ instance: GameInstance, bridge, now })`: `markDirty()`; triggers: `pause()`, `checkpoint()` (declared by the game), `hidden()` (from the host's `lifecycle.pause` or a `visibilitychange` forwarded by the host), interval 30 s when dirty; each trigger: if `instance.canSaveNow?.() === false` use `lastSafe` snapshot else `instance.serialize()`; emit `save.write {saveSchemaVersion, data, reason}` (reason extends the envelope's payload; refresh against OGM-020: if the envelope has no `reason`, carry it in `data.__reason` and note it for OGM-020's owner). `restore(save)` on `save.restore`; `migrate(prev)` when asked by the host via a `save.migrate` request if OGM-020 defines one, else via `instance.migrate` reached through the host's `test.*` path; default: host sends `save.restore` with the old schema and the SDK calls `instance.migrate` itself when the schema differs by one and `migrate` exists, then emits `save.write {reason:'migration'}`.

Interface sketch: `export function createSaveMachine(opts): { markDirty(): void; pause(): void; checkpoint(): void; hidden(): void; dispose(): void; state(): SaveMachineState }`.

Test scenarios (fake instance and bridge):
- Given dirty and `pause()`, then one `save.write` with `reason:'pause'`.
- Given not dirty and 30 s elapsed, then no write; given dirty, then one write.
- Given `canSaveNow()` false, then the last safe snapshot is sent, not a fresh `serialize()`.
- Given `save.restore` with schema N-1 and a `migrate` hook, then `migrate` called once and a `migration` write follows; with schema N-2, then no `migrate` call and an `error` envelope `unsupported_old`.

### U6 — Host-side client and outbox

Goal: upload with OCC, idempotency, outbox persistence and conflict keep-both.

Files: Create `packages/sdk/src/saves/outbox.ts`, `client.ts`; Test `outbox.test.ts`, `client.test.ts` (fake fetch, `fake-indexeddb`).

Approach: `Outbox` over `idb` 8: store `pending {key: deviceId:clientSeq, gameId, slotId, ifMatch, headers, body, attempts}`; `enqueue`, `drain(fetch)` with exponential backoff capped at 60 s, resume on `online` and on `create()`. `SaveClient({ baseUrl, deviceId, tabId, outbox, fetch })`: `put(slot, save)` → local write first (`pending_local → saved_local`), then upload; 200 → `saved_cloud` and `head = revision`; 409 → fetch the cloud head, keep the local body as a new local-only entry labelled `Copy from <device>, <time>` and surface `conflict` (never overwrite); 423 → `read_only`; network error → `queued`. Size rule: on `hidden`, bodies > 60 KB are queued without a keepalive attempt. `load(slot, {schema, migratesFrom})` → `GET` list, derive status client-side from the server's answer, return `{status, save, olderCompatible}`; status `needs_migration` → caller runs the migration path (U5) and the client uploads with `migratedFromRevision`. `lease()` / `heartbeat()` every 15 s.

Interface sketch:
```ts
export class SaveClient { put(slotId, save: { saveSchemaVersion: number; data: unknown; reason: SaveRevision['reason']; label?: string }): Promise<SaveState>; load(slotId, ctx: { schema: number; migratesFrom?: number }): Promise<LoadResult>; lease(takeover?: boolean): Promise<void> }
```

Test scenarios:
- Given a 200, then `saved_cloud` and the outbox is empty.
- Given a 409, then the cloud head is untouched, a local copy entry exists, state `conflict`.
- Given a 423, then `read_only` and no further uploads until `lease(true)`.
- Given a network error then `online`, then the same `Idempotency-Key` is retried and succeeds.
- Given a simulated reload with one pending entry, then `drain` uploads it on `create()`.
- Given a 70 KB body on `hidden`, then queued, no fetch call.

### U7 — Wiring for OGM-045

Goal: the rollback confirm count.

Files: Modify `services/api/src/releases/rollback.ts` (one line: inject `countSavesAboveSchema`) when OGM-045 is merged; otherwise export only and note it.

Test scenarios:
- Given OGM-045 present, when rolling back to a build at schema 2 with two heads at schema 3, then `affectedSaves: 2`.

## 4. Verification

```
pnpm --filter @ogm/db migrate
pnpm --filter @ogm/api test -- saves
pnpm --filter @gm/sdk test -- saves
pnpm -r typecheck && pnpm lint
```
Paste the Vitest summaries (name the idempotency, 409 keep-both and migration tests) and the head SHA into `## Local tests`.

## 5. Deferred to implementation

- Where `reason` rides on `save.write`: default extend OGM-020's payload with `reason` in a one-line contract PR if absent; fallback `data.__reason`.
- Lease expiry: default 30 s (A5); heartbeat 15 s.
- `kind: 'checkpoint'` slots (A5 §3.3) are not in the contract: default map checkpoint saves to the `auto` slot with `reason:'checkpoint'`.
- Outbox store name and versioning: default `ogm-saves` v1.

## 6. Scope boundaries

- No UI (OGM-075 owns the slot list, Saved indicator, conflict and rollback dialogs).
- No host-app wiring of `save.write` to `SaveClient` (OGM-075).
- No fixtures recorded in playtests, no publish-checklist gate (OGM-093/OGM-029).
- No releases/builds tables (OGM-045); status is derived from client-supplied schema numbers.

## 7. Risks

- The games iframe is cross-site and cannot carry cookies: resolved by design (host uploads); the SDK client is host-side.
- `fetch keepalive` 64 KB limit unverified: default treat as real (60 KB threshold).
- Idempotency key reuse after a device reset (`clientSeq` restarts): default `deviceId` is regenerated when local storage is cleared, so keys never collide.
- `fake-indexeddb` star count: default use it; if under 1k, swap for an in-memory `Outbox` adapter in tests and name the exception.
