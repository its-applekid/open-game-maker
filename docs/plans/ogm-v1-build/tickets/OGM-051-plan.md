# OGM-051 plan — Rooms service: GameRoom relay and lifecycle

## 1. Problem frame

Friends play a creator's game through a relay room on this machine: the owner's browser simulates, peers send inputs and receive snapshots, watchers see the editor's transaction stream, and the room never holds game code or design state. This ticket builds that server on Colyseus 0.18 as one Node process with a loopback internal API, implementing every rule of T07 §4.1 with a test per rule.

Requirements trace:
- R70 → relay-only `GameRoom`, no game code on the server, one process, no Redis.
- R71 → `GameRoomState` schema: pin, owner, phase, members with server-assigned `playerIndex`, presence with `privateMode`, `lastRev`, `maxPlayers`.
- R74 → `phase` with `phaseAt` and `playRev`; late joiners get the pin and `playRev` in `welcome`.
- R75 → input relayed to the editor session with stamped `playerIndex`; snapshot/event host → peers with size and rate caps.
- R76 → `validateDesignTx` paths, presence zeroing, no prompt-capable field in state.
- R77 → 120 s / 60 s windows, `pausedForHost`, `host-left` callback, 5 min idle dispose.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/ogm-drive-sync.service` (verified): the unit shape and hardening lines; this ticket's README quotes its own `ExecStart`.
- `packages/room-protocol/src/*` and `packages/contracts/src/room.ts` (OGM-050): import, never redefine; every `onMessage` handler parses with the matching schema member first.
- `services/api/src/<context>/routes.ts` (OGM-010, new): Hono route-module style, `@ogm/config` load at startup, `@ogm/health` for `/healthz`; copy the startup and shutdown order.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T11-hosting-and-ops.md` §4: env names and the `127.0.0.1` bind rule.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest for units (`@colyseus/testing` runs inside Vitest); Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (not used here); every service binds `127.0.0.1`; secrets only from `packages/config` names; no dependency under 1k stars without a named exception (`colyseus` 7.4k, `hono` ok); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 3. Implementation units

### U1 — Package, entry, health, internal API

Goal: the process boots, binds loopback, serves `/healthz` and the internal routes, defines the `game` room.
Files: Create `services/rooms/package.json`, `services/rooms/tsconfig.json`, `services/rooms/src/main.ts`, `services/rooms/src/config.ts`, `services/rooms/src/internal.ts`, `services/rooms/README.md`; Test `services/rooms/test/internal.test.ts`.
Approach:
- `config.ts`: `@ogm/config` `loadEnv(['OGM_ROOMS_PORT','OGM_WS_TOKEN_SECRET','OGM_ROOMS_INTERNAL_SECRET','OGM_API_INTERNAL_URL','OGM_GAMES_ORIGIN'])`; optional `OGM_ROOMS_TEST_TIMINGS` (JSON) for tests and scenarios. If OGM-003's loader keeps a central names list, append the two new names in one line and say so in the PR.
- `main.ts`: Hono `app` (health from `@ogm/health`, internal routes); `const server = http.createServer(getRequestListener(app))`; `const gameServer = new Server({ transport: new WebSocketTransport({ server }) })`; `gameServer.define('game', GameRoom)`; `gameServer.listen(port, '127.0.0.1')`; `SIGTERM` → `gracefullyShutdown()`.
- `internal.ts`: bearer middleware using `crypto.timingSafeEqual` on equal-length buffers (401, empty body otherwise).
- `POST /internal/rooms`: Zod body, `maxPlayers` clamped 1..8 (default 4), `matchMaker.createRoom('game', body)` → `201 {roomId}`.
- `POST /internal/rooms/:roomId/revoke`: `matchMaker.remoteRoomCall(roomId, 'revoke', [body])`; 404 when the room is gone.
- Pin `colyseus`, `@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema`, `@colyseus/testing`, `colyseus.js` to the exact versions resolved at install; record them in the README with the `ExecStart` line for OGM-002.
Interface sketch:
```
POST /internal/rooms  {gameId,branchId,buildId,ownerId,maxPlayers?} → 201 {roomId}
POST /internal/rooms/:roomId/revoke {jti?|userId?} → 204 | 404
GET  /healthz → {ok:true,service:'rooms',version,uptimeSec,rooms:number,dropped:Record<string,number>}
```
Test scenarios:
- Given no bearer, when `POST /internal/rooms`, then 401 and no room exists.
- Given a wrong bearer of a different length, when posted, then 401 (no length leak via exception).
- Given a valid body, when posted, then 201 with a `roomId` that `matchMaker.getRoomById` finds and whose state pin equals the body.
- Given `maxPlayers: 12`, when posted, then the room's `maxPlayers` is 8.
- Given revoke on an unknown room, when posted, then 404.
- Given the process is started with the test env, when `GET /healthz`, then `ok: true` and `rooms: 0`, and the listener address is `127.0.0.1`.

### U2 — State schema and GameRoom core rules

Goal: `onAuth`, join/welcome, `playerIndex`, owner-only gating, relay handlers with caps and validation.
Files: Create `services/rooms/src/state.ts`, `services/rooms/src/game-room.ts`, `services/rooms/src/limits.ts`; Test `services/rooms/test/auth.test.ts`, `services/rooms/test/relay.test.ts`, `services/rooms/test/presence.test.ts`.
Approach:
- `state.ts`: `@colyseus/schema` classes `PinSchema`, `MembershipSchema` (`sessions: ArraySchema<string>`), `PresenceSchema`, `DraftSchema`, `GameRoomState` with `members: MapSchema<MembershipSchema>`; keep fields shallow.
- `static async onAuth(token, options, ctx)`: `verifyGrant(options.grant, secret)` → failures become `ServerError(4xx, JSON.stringify(JoinRejection))`; check `options.protocol === PROTOCOL_VERSION`, `grant.roomId === roomId`, revocation sets, `options.buildId === pin.buildId || draft?.buildId`.
- `onCreate(opts)`: pin, `ownerId`, `maxPlayers`, `autoDispose = false`, timings from opts/env, one `onMessage` per `ClientMessage['t']`.
- `onJoin(client, options, auth)`: find or create `Membership` by `auth.sub`; owner → `playerIndex 0`; else lowest free in `1..maxPlayers-1`, `ROOM_FULL` when none; push `sessionId`; owner → `editorSessionId = client.sessionId` (newest wins); `client.send('welcome', {you, state})`.
- Gate `fromEditor(client)` for `design.tx|snapshot|event|presence|phase|draft.load|kick`; a non-editor sender → `dropped[type]++`, no reply.
- `input`: `validateInputFrame`, `RateTable.allow(sessionId:'input', 60)`, `editorClient.send('input', {f: {...f, playerIndex: member.playerIndex, from: auth.sub}})`.
- `snapshot`/`event`: `byteLength ≤ LIMITS`, rate check, `broadcast(type, msg, {except: client})`; `design.tx`: `validateDesignTx(tx, pin)`, `lastRev = max(lastRev, tx.rev)`, broadcast except sender, update each recipient member's `lastSeenRev`.
- `presence`: merge `Partial<Presence>`, `zeroPrivatePresence` when `privateMode`, write to state; `phase`: set `phase`, `phaseAt = Date.now()`, `playRev = lastRev` on entering `playing`.
- `draft.load`: `url.startsWith(OGM_GAMES_ORIGIN)` else drop; set `draft`, `phase = 'migrating'`, reset `readySet`; `draft.ready`: add session; all connected ready → `pin.buildId = draft.buildId`, `phase = 'editing'`, clear draft.
- `kick`: `leave(4003)` for every session of `userId`; `ping` → `pong {c, s: Date.now()}`; public `revoke(body)` for `remoteRoomCall`.
Interface sketch:
```ts
export class GameRoom extends Room<GameRoomState> {
  static onAuth(token: string, options: JoinOptions, ctx: AuthContext): Promise<RoomGrant>;
  onCreate(opts: { gameId; branchId; buildId; ownerId; maxPlayers; timings?: Timings }): void;
  onJoin(client: Client, options: JoinOptions, auth: RoomGrant): void;
  onLeave(client: Client, consented: boolean): Promise<void>;
  revoke(body: { jti?: string; userId?: string }): void;
}
```
Test scenarios:
- Given an owner then a player join with valid grants and the pinned `buildId`, when both are in, then `welcome.you.playerIndex` is 0 and 1 respectively.
- Given `buildId: 'other'`, when joining, then the rejection is `BUILD_MISMATCH` with `expected` equal to the pin.
- Given `protocol: 2`, when joining, then `PROTOCOL_MISMATCH`.
- Given an expired grant, when joining, then `GRANT_EXPIRED`; given a grant for another `roomId`, then `GRANT_INVALID`.
- Given a `jti` in the revocation set, when joining, then `GRANT_REVOKED`.
- Given four members at `maxPlayers: 4`, when a fifth joins, then `ROOM_FULL` with `max: 4`.
- Given a player sends `design.tx`, when relayed, then no other client receives it and `/healthz.dropped['design.tx']` is 1.
- Given the owner sends a tx with `branchId: 'other'` or a patch path `['prompt']`, when handled, then it is dropped and `lastRev` unchanged.
- Given the owner sends tx rev 5 then rev 7, when handled, then `lastRev` is 7 and the watcher received both in order.
- Given a player sends `input` with `playerIndex: 0` inside `f`, when relayed, then the editor session receives `playerIndex` equal to the player's assigned index and `from` equal to its userId.
- Given a 65 KiB snapshot from the host, when handled, then no peer receives it and `dropped.snapshot` is 1.
- Given 31 snapshots within one second, when handled, then peers receive 30.
- Given presence `{privateMode:true, cursor:{x:.5,y:.5}, building:{jobId:'j',label:'building',pct:40}}`, when synced, then the watcher's state has no cursor and keeps `building`.
- Given `phase: 'playing'`, when synced, then every client's state shows `playing`, `playRev === lastRev`, `phaseAt` within 1 s of now.
- Given `draft.load` with `url: 'https://evil.example/x'`, when handled, then dropped; given a games-origin url and `draft.ready` from every member, then `pin.buildId` changed and phase is `editing`.
- Given a player sends `kick`, when handled, then nobody leaves and `dropped.kick` is 1.
Execution note: test-first; each rule's test is written red before its handler branch.

### U3 — Lifecycle: reconnection, host-leave, second device, idle, ended callback

Goal: the E07-8/E07-14/E07-15 behaviour with injectable timings.
Files: Create `services/rooms/src/lifecycle.ts`; Modify `services/rooms/src/game-room.ts`; Test `services/rooms/test/lifecycle.test.ts`.
Approach:
- `onLeave(client, consented)`: remove `sessionId`; consented owner with no owner session left → `end('owner-closed')`; consented player with no sessions → free the index.
- Unconsented: `member.connected = sessions.length > 0`; if the client was `editorSessionId` → `prevPhase = phase`, `phase = 'pausedForHost'`.
- `await allowReconnection(client, owner ? timings.ownerReconnectSec : timings.playerReconnectSec)`; on success re-add the session, owner → `editorSessionId = client.sessionId`, `phase = prevPhase`, send `resync {fromRev: member.lastSeenRev + 1}`.
- On timeout: owner with no other session → `end('host-left')`; player → delete membership (index freed), state sync lets the host despawn.
- Idle: when `clients.length === 0`, `clock.setTimeout(() => end('idle'), idleDisposeSec*1000)`, cleared on join.
- `end(reason)`: `broadcast('ended', {reason})`; `POST ${OGM_API_INTERNAL_URL}/internal/rooms/${roomId}/ended` with bearer and `{reason, endedAt}`; retries 250 ms, 1 s, 4 s; then `disconnect()`.
- `revoke({jti, userId})`: add to sets; connected matching sessions get `ended {reason:'revoked'}` then `leave(4001)`.
Interface sketch:
```ts
type Timings = { ownerReconnectSec: number; playerReconnectSec: number; idleDisposeSec: number }; // defaults from LIMITS
```
Test scenarios (timings 0.2 s, mocked API on an ephemeral port):
- Given the owner's socket drops (`leave(false)`), when the next patch arrives, then phase is `pausedForHost`.
- Given the owner reconnects before the window, when reconnected, then phase is restored and the client receives `resync` with `fromRev` = last relayed rev + 1.
- Given the owner does not return, when the window elapses, then every client receives `ended {reason:'host-left'}` and the mocked API got `{reason:'host-left'}`.
- Given a player drops and does not return, when the next user joins, then it receives the freed `playerIndex`.
- Given the owner opens a second device, when joined, then `editorSessionId` is the new session, `sessions.length === 2`, and a `design.tx` from the old session is dropped.
- Given the owner leaves consented from its only device, when handled, then `owner-closed` reaches clients and the API.
- Given every client leaves consented, when the idle window elapses, then the API receives `idle` and `matchMaker.getRoomById` is undefined.
- Given revoke `{userId}`, when handled, then that user's clients get `revoked` and are gone, and a fresh grant for that user is rejected `GRANT_REVOKED` for the room's lifetime.
- Given the API returns 500 three times, when `end` runs, then the room still disposes and one error line is logged.

## 4. Verification

```
pnpm --filter @ogm/rooms test
pnpm -r typecheck && pnpm -r lint
OGM_ROOMS_PORT=2567 OGM_WS_TOKEN_SECRET=dev OGM_ROOMS_INTERNAL_SECRET=dev OGM_API_INTERNAL_URL=http://127.0.0.1:1 OGM_GAMES_ORIGIN=http://127.0.0.1:10000 pnpm --filter @ogm/rooms dev &
curl -s http://127.0.0.1:2567/healthz; ss -ltn | grep 2567   # must show 127.0.0.1 only
```
Paste into `## Local tests`: Vitest summary (≈ 35 tests), the `healthz` JSON, the `ss` line proving the loopback bind, head SHA and base.

## 5. Deferred to implementation

- Rejection transport: `ServerError(code, JSON)` from `onAuth` vs a `JoinRejection` object in the close reason; default `ServerError` with the JSON body, so OGM-053 parses `e.message`.
- Presence representation in schema (nested vs flat numbers with flags): default nested `PresenceSchema` if 0.18 syncs it cleanly under `@colyseus/testing`; otherwise flat.
- Violation threshold before `leave(4002)`: default 1,000 per minute.
- Whether `input` is relayed during `editing`: default yes; documented.
- `remoteRoomCall` availability in the installed version: default use it; fallback a module-level `Map<roomId, GameRoom>`.

## 6. Scope boundaries

- API routes, DB rows, grant minting, invitations: OGM-052.
- Browser client, bridge forwarding, catch-up fetch of design snapshots: OGM-053.
- Interpolation, `gm.net`: OGM-054. Scenario: OGM-055. Unit file: OGM-002. Ingress: OGM-006.

## 7. Risks

- Colyseus 0.18 API drift since 2026-10-21 (static `onAuth`, `allowReconnection` signature, `@colyseus/testing` helpers): default, pin what installs, read the installed `d.ts`, keep room code against `@colyseus/core`, note versions in the README.
- Nested schema sync edge cases: default flat fields (T07 §6 risk).
- Agents starving the event loop (E07-15): out of scope here; `ogm.slice` CPUWeight 200 (D-HOSTING) is the guard; OGM-055 runs its scenario with one aiur job active.
- `ws` payload limits: default set `maxPayload` on the transport to 128 KiB so oversized frames are cut at the socket before the handler.
