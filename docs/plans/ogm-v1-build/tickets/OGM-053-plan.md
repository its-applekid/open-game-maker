# OGM-053 plan — Host-app room client and watcher sync

## 1. Problem frame

The host app is the only process that holds a room grant and a socket (E07-4). It must join, mirror room state into a store, bring watchers to the editor's exact design revision from two sources (a snapshot at a rev from the API and relayed transactions from the room), forward `net.*` traffic between the room and the game iframe, and survive drops and grant expiry. Everything is headless: screens come in OGM-078, the game route in OGM-075.

Requirements trace:
- R73 → `watcher-sync.ts`: snapshot at rev ≤ `lastRev`, apply `rev > snapshotRev` in order, `resync` and gaps → re-fetch, never guess.
- R74 → phase from server state with `phaseAt`/`playRev`; peers switch on receipt; late joiners load the pinned build and design at `playRev`; `net.players` on membership change so the host spawns.

## 2. Patterns to follow

- `packages/host/src/*` `HostBridge` (OGM-028, new): `send(envelope)` / `on(kind, handler)` with Zod validation; copy its subscription shape and never bypass it with raw `postMessage`.
- `packages/contracts/src/room.ts` (OGM-050) and `packages/contracts/src/bridge.ts` (OGM-020): import types; `LIMITS` for client-side caps.
- `packages/design-log/src/apply.ts` (OGM-040, new): `apply(doc, patches)` for watcher-side reduction; the same function the editor uses so both sides agree.
- `apps/web/src/app/*` store slice and query client (OGM-070, new): zustand store style, TanStack Query for `GET …/design?rev=`.
- `/home/orangekid/games/open-game-maker-2000/prototypes/studio-v0/app.js` lines 256–259 (verified): the mode switch message the prototype sent; evidence of need, not code to keep.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest (jsdom for units, node for the integration test); Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback (used by OGM-055, not here); every service binds `127.0.0.1`; secrets only from `packages/config` names (the browser holds none; the grant comes from the API); no dependency under 1k stars without a named exception (`colyseus.js` is the Colyseus client, same project, 7.4k); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 3. Implementation units

### U1 — `RoomClient` and `useRoom` store

Goal: a typed wrapper over `colyseus.js` and a store that mirrors `RoomState`.
Files: Create `apps/web/src/net/room-client.ts`, `apps/web/src/net/room-store.ts`, `apps/web/src/net/index.ts`; Modify `apps/web/package.json` (add `colyseus.js`); Test `apps/web/src/net/room-client.test.ts`, `apps/web/src/net/room-store.test.ts`.
Approach:
- `RoomClient` takes `{ roomsUrl, bridge: HostBridge, fetchGrant(): Promise<{grant, pin, expiresAt}> }`.
- `join(initial)`: `new Client(roomsUrl)`; `joinById(roomId, { grant, buildId: pin.buildId, protocol: PROTOCOL_VERSION })`; on error parse `e.message` as `JoinRejection` JSON (fallback `GRANT_INVALID`) → `status: 'rejected'`.
- Register `onMessage` for `welcome | input | snapshot | event | design.tx | resync | ended | pong`; `onStateChange(s => store.setFromState(s.toJSON()))`; `onLeave(code => code >= 4000 ? ended : reconnect())`.
- `reconnect()`: `client.reconnect(room.reconnectionToken)` with backoff 0.5/1/2/4 s bounded by the role's window; `status: 'reconnecting'` meanwhile.
- Expiry: timer at `expiresAt - 60 s` → `fetchGrant()` stored for the next (re)join; on `GRANT_EXPIRED`, fetch once and retry.
- `send(msg)`: validate with `ClientMessageSchema` and the byte caps before `room.send(msg.t, msg)`; `ping` every 5 s → `rttMs`.
- `received`: ring buffer of 2,000 `ServerMessage`s (tests and the canary assertion).
- Store: `useRoom` with `status`, `you`, `role` (derived: `you.sessionId === state.editorSessionId ? 'host' : 'peer'`), `phase`, `phaseAt`, `playRev`, `members`, `presence`, `pin`, `draft`, `ended`, `rttMs`; actions `play()`, `edit()`, `kick()`, `setPresence()`, `loadDraft()`, `publishTransaction()`.
Interface sketch:
```ts
export class RoomClient {
  constructor(opts: { roomsUrl: string; bridge: HostBridge; fetchGrant(): Promise<{ grant: string; pin: RoomPin; expiresAt: number }>; store?: typeof useRoom });
  join(j: { roomId: string; grant: string; pin: RoomPin; expiresAt: number }): Promise<void>;
  send(m: ClientMessage): void; leave(consented?: boolean): Promise<void>;
  readonly received: ServerMessage[];
}
```
Test scenarios:
- Given a fake `Client` whose `joinById` resolves a fake room, when `join` runs, then the options are `{grant, buildId, protocol: 1}` and `status` is `connected` after `welcome`.
- Given `joinById` rejects with `'{"code":"BUILD_MISMATCH","expected":{…}}'`, when joined, then `status: 'rejected'` and `rejection.code === 'BUILD_MISMATCH'`.
- Given `joinById` rejects with a non-JSON message, when joined, then `rejection.code === 'GRANT_INVALID'`.
- Given `onLeave(1006)`, when fired, then `status: 'reconnecting'` and `reconnect` is called with the token.
- Given `expiresAt = now + 61 s`, when 1.5 s pass (fake timers), then `fetchGrant` was called once.
- Given `ended {reason:'host-left'}`, when received, then `store.ended === 'host-left'` and `status: 'ended'`.
- Given `send({t:'snapshot', data: 70000 bytes})`, when called, then nothing is sent and one warning is logged.
- Given a state patch with `editorSessionId` equal to `you.sessionId`, when applied, then `role === 'host'`; otherwise `'peer'`.
Execution note: test-first for the rejection mapping and reconnect; they decide OGM-078's screens.

### U2 — Watcher catch-up

Goal: the watcher's effective design equals the editor's at every rev.
Files: Create `apps/web/src/net/watcher-sync.ts`; Test `apps/web/src/net/watcher-sync.test.ts`.
Approach:
- `class WatcherSync` with deps `{ fetchSnapshot(gameId, branchId, rev), apply, bridge }` and state `doc`, `appliedRev`, `pending: Map<rev, DesignTx>`, `fetching`.
- `onWelcome(state)`: `fetchSnapshot(pin.gameId, pin.branchId, state.lastRev)` → `doc`, `appliedRev = rev` → `bridge.send({t:'design.apply', rev, doc, patches: []})` → drain `pending`.
- `onTx(tx)`: `rev <= appliedRev` → ignore; `rev === appliedRev + 1` → `doc = apply(doc, tx.patches)`, `appliedRev = rev`, `design.apply {rev, doc, patches}`, drain; else buffer and start a 2 s gap timer.
- Gap timer and `onResync(fromRev)`: `fetchSnapshot(…, max(fromRev, highest pending rev))`, replace `doc`, drop pending ≤ rev, drain; dedupe concurrent fetches.
- Draft: when `state.draft` appears and the iframe's `ready` for the new build arrives, `client.send({t:'draft.ready', buildId})` and re-send `design.apply` at `appliedRev`.
- After the first full doc, send `patches` only (full `doc` again only after a snapshot fetch) to stay under the 256 KB bridge cap.
Interface sketch:
```ts
export class WatcherSync { onWelcome(s: RoomState): Promise<void>; onTx(tx: DesignTx): void; onResync(fromRev: number): Promise<void>; readonly appliedRev: number; readonly doc: DesignDoc | null }
```
Test scenarios:
- Given `welcome` with `lastRev 40` and a fetch resolving `{rev:40, doc0}`, when handled, then one `design.apply` at 40 with the full doc.
- Given txs 41, 43, 42 in that order, when handled, then `design.apply` fires for 41, 42, 43 in order and `doc` equals `apply(apply(apply(doc0,p41),p42),p43)`.
- Given tx 45 after 43 and 2 s of silence (fake timers), when the timer fires, then `fetchSnapshot` is called with rev ≥ 45 and no `design.apply` for 44 ever fires.
- Given `resync {fromRev: 50}`, when handled, then a fetch at ≥ 50 and pending below 50 are discarded.
- Given two gaps at once, when both timers fire, then only one fetch is in flight.
- Given a fetch that fails three times, when retried, then `status: 'desynced'` is set and no stale doc is applied.
Execution note: use `@ogm/design-log` fixtures (OGM-040) for `doc0` and patches so this test fails if `apply` semantics change.

### U3 — Bridge forwarding and the test handle

Goal: room ↔ iframe forwarding by role, plus `window.__ogmHost.room`.
Files: Create `apps/web/src/net/bridge-forwarding.ts`, `apps/web/src/net/test-handle.ts`; Test `apps/web/src/net/bridge-forwarding.test.ts`, `apps/web/src/net/room-client.integration.test.ts`.
Approach:
- `attachForwarding(client, store, bridge)`: store subscriptions: `members`/`you` → `net.players {local, players}`; `role` → `net.role`; `phase` → `phase {phase}` and `lifecycle.pause` on `pausedForHost`/`ended`, `lifecycle.resume` on return to `playing`.
- Room → iframe: `input` → `net.input` only when `role === 'host'`; `snapshot`/`event` → `net.snapshot`/`net.event` only when `role === 'peer'`.
- Iframe → room: `bridge.on('net.input', …)` when peer → `input`; `bridge.on('net.snapshot' | 'net.event', …)` when host → `snapshot`/`event` after the byte cap.
- If `bridge.ts` lacks the `net.*` kinds, append them additively (OGM-053.md Contract) and re-run the contracts emit.
- `test-handle.ts`: when `?test` is present, `window.__ogmHost.room = { join, state, received, play, edit, leave }`.
- Integration test (`environment: node`): `boot()` from `@colyseus/testing` with `@ogm/rooms`' `GameRoom` and the fixture secret; two `RoomClient`s with a fake bridge; host sends three txs; assert watcher doc equality per rev.
Interface sketch:
```ts
export function attachForwarding(client: RoomClient, store: typeof useRoom, bridge: HostBridge): () => void; // returns detach
declare global { interface Window { __ogmHost?: { room?: RoomTestHandle } } }
```
Test scenarios:
- Given `role: 'host'` and a room `input`, when forwarded, then the bridge got `net.input` with the server's `playerIndex`; given `role: 'peer'`, then nothing.
- Given `role: 'peer'` and a room `snapshot`, when forwarded, then `net.snapshot`; given host, nothing.
- Given the iframe sends `net.snapshot` while host, when forwarded, then the room got `snapshot`; given 65 KiB, nothing and one warning.
- Given the iframe sends `net.input` while host, when handled, then nothing is sent (the host's own input never crosses the wire).
- Given members change, when forwarded, then `net.players.local` equals `you.playerIndex`.
- Given phase `pausedForHost`, when forwarded, then `lifecycle.pause`; given `playing` afterwards, then `lifecycle.resume`.
- Given `?test`, when the app boots, then `window.__ogmHost.room` exists; without it, undefined.
- Given the real `GameRoom` and two clients, when the host sends three txs, then the watcher's `appliedRev` is 3 and its doc deep-equals the host's.

## 4. Verification

```
pnpm --filter @ogm/web test -- net
pnpm --filter @ogm/web typecheck && pnpm -r lint
pnpm --filter @ogm/contracts generate && git diff --exit-code packages/contracts/schemas   # only if bridge.ts was appended
```
Paste into `## Local tests`: Vitest summary for `net` (unit + integration), whether `bridge.ts` was appended, head SHA, base.

## 5. Deferred to implementation

- Store library: default zustand (OGM-070's choice); if OGM-070 picked another, match it.
- Reconnect backoff numbers: default 0.5/1/2/4 s, capped by the role's window from `LIMITS`.
- Ring buffer size for `received`: default 2,000 messages.
- Where the game route obtains `RoomClient`: default a module singleton `getRoomClient()` in `index.ts`; OGM-075 calls `join` when `?room=` is present.
- Snapshot chunking when a full doc exceeds the 256 KB bridge cap: default chunk by `entities` keys and note in the PR.

## 6. Scope boundaries

- Screens and copy: OGM-078. Game route and editor transaction posting: OGM-075. Interpolation and SDK API: OGM-054. Room server: OGM-051. Routes/join page: OGM-052. Snapshot route: OGM-041.

## 7. Risks

- `bridge.ts` naming (`mp.*` vs `net.*`): default append `net.*` additively as stated; if the Executor prefers `mp.*`, rename in this ticket's forwarding map only (one object) and keep OGM-050's payload shapes.
- `colyseus.js` reconnection API differences in the installed version: default read the installed `d.ts`; keep reconnection behind one method.
- `@ogm/rooms` as a devDependency of `apps/web` for the integration test: default allowed (test-only); if the workspace forbids app→service edges, move that test to OGM-055's scenario and say so.
- Full-doc `design.apply` over the bridge cap: default patches-only after the first doc (U2).
