# OGM-052 plan — Invite links, room grants and the join page

## 1. Problem frame

A creator presses Invite; a family member opens the link on a phone, signs in, and lands in the room. The API is the only grant minter (E11-6: sockets authenticate by token, not cookie), invitations already exist as a hashed single-use table (OGM-012), and rooms are created on the rooms service through its loopback API (OGM-051). This ticket wires those pieces into six routes, two tables and one app route that holds the grant in memory and hands over to the game route.

Requirements trace:
- R4 → `kind: 'room'` invitations, single-use, optional email binding, family allowlist enforced at `GET /api/join`, revocable.
- R72 → grants minted with `signGrant` binding user, room, role and a ≤ 10 min expiry; the room verifies offline; revocations pushed to the room.

## 2. Patterns to follow

- `services/api/src/invites/routes.ts` and `services/api/src/invites/service.ts` (OGM-012, new): route-module shape, `createInvitation`/`consumeInvitation` signatures, `authorize()` call site; copy the module layout exactly.
- `services/api/src/<context>/routes.ts` scanned mount and the migration naming (OGM-010, new): follow the first merged context (likely `accounts`).
- `apps/web/src/routes/title/route.tsx` (OGM-071, new) and the query client in `apps/web/src/app/*` (OGM-070, new): screen module shape, loader/redirect idiom.
- `packages/room-protocol/src/grant.ts` (OGM-050): `signGrant` signature; `packages/contracts/src/room.ts` for `RoomPin`.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T01-backend-core.md` §4 (verified: `authorize`, `POST /auth/age`) and T11 §4 (`OGM_PUBLIC_ORIGIN`).

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units; Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not needed here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no dependency under 1k stars without a named exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 3. Implementation units

### U1 — Tables and migration

Goal: `rooms` and `room_members` in SQLite through Drizzle.
Files: Create `services/api/src/rooms/schema.ts`, migration `<timestamp>_rooms.sql` (location per OGM-010; refresh at pickup); Test `services/api/src/rooms/schema.test.ts`.
Approach:
- Drizzle `sqliteTable('rooms', …)` with `id` (the rooms service's `roomId`), `gameId` → `games.id`, `branchId`, `buildId`, `ownerId`, `maxPlayers` default 4, `createdAt`, `endedAt`, `endReason`.
- `sqliteTable('room_members', …)` with composite PK `(roomId, userId)`, `invitationId`, `joinedAt`, `revokedAt`.
- Generate the migration with drizzle-kit; commit it; never edit a prior migration.
- Clamp `maxPlayers` in the service layer (1..8), not with a DB check, so the rule has one home.
Interface sketch:
```sql
CREATE TABLE rooms (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, branch_id TEXT NOT NULL, build_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 4, created_at TEXT NOT NULL, ended_at TEXT, end_reason TEXT);
CREATE TABLE room_members (room_id TEXT NOT NULL, user_id TEXT NOT NULL, invitation_id TEXT, joined_at TEXT NOT NULL, revoked_at TEXT, PRIMARY KEY (room_id, user_id));
```
Test scenarios:
- Given a fresh temp DB, when migrations run, then both tables exist with the listed columns.
- Given a room row, when `ended` is written twice, then `ended_at` keeps the first value.
- Given a `room_members` insert for the same `(roomId, userId)` twice, when upserted, then one row remains.

### U2 — Rooms service client and the six routes

Goal: the API side of T07 §4.2 plus the re-grant route and the ended callback.
Files: Create `services/api/src/rooms/routes.ts`, `services/api/src/rooms/service.ts`, `services/api/src/rooms/rooms-client.ts`; Test `services/api/src/rooms/routes.test.ts`, `services/api/src/rooms/rooms-client.test.ts`.
Approach:
- `rooms-client.ts`: `createRoom(body)` → `fetch(`${OGM_ROOMS_INTERNAL_URL}/internal/rooms`)` with `Authorization: Bearer ${OGM_ROOMS_INTERNAL_SECRET}` and `AbortSignal.timeout(2000)`; `revoke(roomId, body)`; failures throw `RoomsUnavailable` → 503.
- `mintGrant(user, room, role)`: `signGrant({sub: user.id, roomId, gameId, role, name: user.displayName, ttlSec: 600}, secretBytes(OGM_WS_TOKEN_SECRET))`; `roomsUrl = `${OGM_PUBLIC_ORIGIN}/ws/rooms``.
- `createRoomForGame(actor, gameId, body)`: owner check (`game.ownerId === actor.userId`) and `authorize(actor,'game.play',…)`; reuse an open room for `(gameId, branchId)` if one exists; clamp `maxPlayers`; rooms client → insert row → owner grant.
- `createInvite(actor, roomId, email?)`: owner check → `createInvitation({kind:'room', roomId, gameId, email, expiresAt: now+7d, createdBy})` → `url = `${appOrigin}/join/${token}``.
- `join(actor, token)`: session required; age attestation required (403 `age_required`); `consumeInvitation(token, actor)` with the same-user idempotent re-read (410 otherwise, 403 `email_mismatch`); room not ended (410 `room_ended`); `authorize(actor,'game.play',{gameId, ownerId, familyId})` plus family allowlist (OGM-012's switch); upsert `room_members`; player grant.
- `regrant(actor, roomId)`: owner or non-revoked member → fresh grant; `revoke(actor, roomId, body)`: owner → rooms client → set `revokedAt` when `userId` given.
- `ended(roomId, body)`: bearer check with `timingSafeEqual`; set `endedAt`/`endReason` if null; always 204.
- `routes.ts`: mount the six handlers with Zod schemas; reuse `RoomPinSchema` from contracts.
Interface sketch:
```ts
export type JoinResponse = { roomId: string; grant: string; pin: RoomPin; roomsUrl: string };
export declare function join(actor: Actor, inviteToken: string): Promise<JoinResponse>;
export declare function createRoomForGame(actor: Actor, gameId: string, body: { branchId: string; buildId: string; maxPlayers?: number }): Promise<JoinResponse>;
```
Test scenarios:
- Given a non-owner, when `POST /api/games/:g/rooms`, then 403 and no rooms-service call.
- Given the owner, when posted, then 201, the fake rooms API received `ownerId` from the games row, and the grant verifies with `verifyGrant` as `role: 'owner'` with `exp - now ≤ 600`.
- Given `maxPlayers: 20`, when posted, then the row and the rooms call carry 8.
- Given the fake rooms API returns 500, when posted, then 503 `rooms_unavailable` and no row.
- Given an open room for the same `(gameId, branchId)`, when posted again, then the same `roomId` is returned.
- Given the owner, when `POST …/invites`, then `url` ends in `/join/<token>` and the invitation row has `kind: 'room'`, a hashed token and a 7-day expiry.
- Given no session, when `GET /api/join/:token`, then 401.
- Given a session without age attestation, when joining, then 403 `age_required`.
- Given a user outside the family with the allowlist off, when joining, then 403.
- Given a token already used by another user, when joining, then 410; given the same user again, then 200 twice with one `room_members` row.
- Given an invite bound to `a@x` and a session user `b@x`, when joining, then 403 `email_mismatch`.
- Given a room with `endedAt` set, when joining, then 410 `room_ended`.
- Given a non-member, when `GET …/grant`, then 403; given an admitted member, then a fresh grant; given a revoked member, then 403.
- Given revoke `{userId}`, when posted by the owner, then the fake rooms API got it and `room_members.revokedAt` is set.
- Given `POST /internal/rooms/:id/ended` with a wrong bearer, when posted, then 401; with the right bearer, then 204 and `endedAt` set; repeated, then 204 and unchanged.
Execution note: test-first for the four `GET /api/join` failure codes (they are the screens' states).

### U3 — App route `/join/:inviteToken`

Goal: the hand-off from a link to the game route with the grant in memory.
Files: Create `apps/web/src/routes/join/route.tsx`, `apps/web/src/routes/join/grant-store.ts`, `apps/web/src/routes/join/route.test.tsx`.
Approach:
- `grant-store.ts`: zustand `useJoinGrant` with `{ roomId, grant, pin, roomsUrl, expiresAt } | null`, `set`, `clear`; memory only, no persist middleware.
- `route.tsx`: read the session (OGM-070's auth query); no session → `navigate('/age', { state: { next } })` (OGM-011's cookie flow continues to `/signin?next=`).
- With a session: `useQuery(['join', token], () => api.get(`/api/join/${token}`))`; success → `useJoinGrant.set({...data, expiresAt: Date.now() + 9*60_000})` then `navigate(`/g/${pin.gameId}?v=${pin.branchId}&room=${roomId}`, { replace: true })`.
- 410/403/404 → one line each (`Link used`, `Not allowed`, `Room ended`) with `role="status"` and one 64 px button to `/games`; no other text.
Interface sketch:
```ts
export const useJoinGrant: UseBoundStore<{ value: (JoinResponse & { expiresAt: number }) | null; set(v): void; clear(): void }>;
```
Test scenarios:
- Given no session, when the route renders, then navigation is `/age` with `next=/join/<token>`.
- Given a session and a mocked 200, when rendered, then the store holds the grant and navigation is `/g/g_01J?v=main&room=Xk3Fq` with `replace`.
- Given a mocked 410, when rendered, then the used-link line is in the document and nothing navigated.
- Given a mocked 403 `age_required`, when rendered, then navigation is `/age`.
- Given any render, then `window.location.search` and `localStorage` never contain the grant string.

## 4. Verification

```
pnpm --filter @ogm/api test -- rooms
pnpm --filter @ogm/web test -- join
pnpm -r typecheck && pnpm -r lint
# with api and rooms running locally:
curl -s -b "$COOKIE" -X POST http://127.0.0.1:$OGM_API_PORT/api/games/g_01J/rooms -H 'content-type: application/json' -d '{"branchId":"main","buildId":"sha256:ab12"}'
```
Paste into `## Local tests`: Vitest summaries for api and web, the curl response with the grant redacted to its first 8 characters, head SHA, base.

## 5. Deferred to implementation

- Age check source: session claim vs the signed cookie; default the user row's `age_band`/`age_attested_at` (E01-9) since invitees are signed-in users.
- App origin for the invite URL: default reuse OGM-011's Better Auth `baseURL`/trusted origin value rather than a new env name.
- Owner's own grant expiry before anyone joins: default the client re-grants through `GET …/grant` (OGM-053).
- Reusing an open room per `(gameId, branchId)`: default yes.
- Invite `email` optional for `kind: room`: default optional, bound on first use (R4 single-use holds); flag for Kevin in the PR.

## 6. Scope boundaries

- Invitations table, hashing, allowlist switch, `authorize` matrix: OGM-012. Session, bearer, age cookie: OGM-011.
- Rooms process and its internal API: OGM-051. Connecting the socket: OGM-053. Screens and share sheet: OGM-078. Admin allowlist UI: OGM-079.

## 7. Risks

- OGM-012's `consumeInvitation` may be strictly single-use with no same-user re-read: default, check `acceptedBy === actor.userId` in this ticket's `service.ts` before calling consume, without editing OGM-012's module.
- `GET` that consumes a token: kept for the link flow (T07 §4.2); a prefetching mail client cannot consume it because the session cookie is required.
- Netlify proxy limits do not apply (short JSON only).
- `OGM_PUBLIC_ORIGIN` placeholder while OGM-006 is pending: default `http://127.0.0.1:<port>` in dev env files; tests inject it.
