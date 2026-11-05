# 497 rooms research: four seats, teams, routing, ready check, synchronised start, pause, forfeit and rejoin

**Implementation ticket:** #497 (N3 of the netcode family) · **Research ticket:** #502 · **Design input:** #495
**Repository evidence:** `main` at `a6d7dcf49c90829cd254749d78750fb8164a1b52` (2026-11-05)
**Plan-pack evidence:** `research` — `docs/plans/ogm-v1-build/evidence/T07-multiplayer.md` (§4.1 server rules, §4.5, E07-6/8/9/12/14),
`docs/plans/ogm-v1-build/decisions.md` (D-ROOMS, D-HOOKS), `tickets/OGM-051.md` (the v1 room this ticket extends).

This is a research spike: it decides how `services/rooms` grows from a two-role editor relay into the v2 room of
`docs/plans/netcode-platform.md` §7 and §9, and it changes no product code. It is written to be executable by a weaker
implementer: every unit names the file it touches, every test names an input and an expected value, and every place the
platform design left a gap is either resolved here with a decision or carried in §10 with a recommended default.

The first consumer is a 2–4 player versus puzzle game; the later one is a shared-world co-op game. Both appear here only
as behaviour. No private game content is quoted, and none was reachable from this workspace (the private asset library is
outside the sandbox, so §8 uses the public, behaviour-only issue summaries).

## 0. Where this document stands

`docs/plans/netcode-platform.md` (N1) fixes the contract families, the authority modes and the room's responsibilities.
It is not re-litigated here. This document adds what an implementer cannot infer from it:

1. Which of §7's behaviours the current room already has by accident, and which ones contradict it (the seat table, the
   creator's leave rule, the editor-only input path).
2. The mechanism for the two things §7 states as outcomes only: a **tick the room can publish without simulating**, and a
   **reconnect window that cannot create two live sessions for one seat**.
3. Exact message schemas, limits, room-state additions and file layout, with the v1 compatibility seams named.
4. Expected values for every test, so a review can tell an implementation from a coincidence.
5. Six gaps found in N1 while writing this, each with a decision (§11) rather than an open question, because a rewritten
   ticket must not stop to ask: the seat claim in §4.7, the private seed's source in §7.3, the missing epoch end for
   best-of-three, who applies the forfeit policy, what a spectator is made of, and who computes `rulesetHash`.

## 1. Outcome

`services/rooms` serves protocol 2 beside protocol 1: four seats bound to authenticated instance users with teams, a ready
check, an epoch minted by the room with a start time every client derives its ticks from, routed events and state with the
sender's seat re-stamped by the room, a 30-second rejoin window per seat that pauses the match for everyone, forfeit
announcements, `rulesetHash` pinning, and an editor path unchanged from v1. No new dependency, no new environment
variable, no new secret, no game code and no simulation in the service; `game-room.ts` gains dispatch and wiring while the
new behaviour lives in three small modules (`seats.ts`, `epoch.ts`, `routing.ts`).

The room's single new obligation is arithmetic: `tick = floor((serverNow - startAt) * 60 / 1000)`, with `startAt` shifted
on resume. That one line is what makes a synchronised countdown, a match pause, a late-joining seat and a re-elected
primary all expressible inside a relay that never steps a simulation.

**Acceptance (what the Executor can check).** `pnpm --filter @ogm/rooms test` and `pnpm --filter @ogm/web test` green;
`pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build` green; `services/rooms/README.md` documents seats, teams, epochs,
routing and the "what the room never gains" list; a v1 client still joins a v1 room and still gets `host-left`, asserted
by a test that is not skipped; the two-client verify scenario still passes against a v1 room (§11, D-N3-17).

## 2. What exists today

### 2.1 The room is a two-role editor relay

| Fact | Locus | Consequence for v2 |
| --- | --- | --- |
| `PROTOCOL_VERSION = 1`, one constant for the process | `packages/contracts/src/room.ts:10` | The version must become per room; §4.3 |
| `onAuth` rejects `options.protocol !== PROTOCOL_VERSION` | `services/rooms/src/game-room.ts:92` | Compare against `this.state.protocol` instead |
| Seats are `playerIndex` on a membership; owner is 0, others the lowest free index from 1 | `game-room.ts:140`, `:341` | Correct numbers, wrong container: no teams, no forfeit state, no spectator |
| A membership is deleted when its last session leaves | `game-room.ts:375-389` | A v2 seat must survive its occupant, or a forfeited seat returns to the pool |
| `input` is relayed to the editor session only, with `playerIndex` and `from` stamped | `game-room.ts:236-245` | Per-seat authority needs inputs at every seat; the stamping rule stays |
| `snapshot`/`event` are editor-only and broadcast to everyone else | `game-room.ts:246-249` | v2 events are routed by target, not broadcast; state comes from any seat |
| The creator's last session leaving ends the room (`host-left`, `owner-closed`, `revoked`) | `game-room.ts:196-204` | §7.4 replaces this for v2 rooms only |
| `allowReconnection(client, owner ? 120 : 60)` | `game-room.ts:164-166` | v2 uses a room timer instead; §3.6 |
| Owner editor departure sets `phase: 'pausedForHost'` | `game-room.ts:355-370` | Stays for editing; must not fire during a v2 match; §3.7 |
| `RATE_LIMITS` is `satisfies Record<ClientMessage['t'], number>` | `game-room.ts:41-53` | Every new client message needs an entry or the build fails — a good gate to keep |
| Room state has `protocol`, `members`, `presence`, no `seats`, no `epoch` | `services/rooms/src/state.ts:85-101` | §4.1 adds six fields to the schema |

### 2.2 Nothing outside the room knows a seat

- The grant carries `sub, roomId, gameId, role, name, iat, exp, jti` and no seat (`packages/contracts/src/room.ts:43-57`),
  and the API signs it without one (`services/api/src/rooms/rooms.ts:50-67`). The API has no view of the room's seat table:
  `GET /api/v1/rooms/:roomId/grant` (`services/api/src/rooms/routes.ts:82`) only re-signs for a member.
- The web derives its role from `editorSessionId` (`apps/web/src/net/room-store.ts:105-107`), so it learns nothing about
  seats, teams or an epoch.
- The bridge forwards exactly `net.input`, `net.snapshot` and `net.event`, gated on `role` (`apps/web/src/net/bridge-forwarding.ts:65-78`,
  `:106-127`).
- The SDK's whole network surface is `role`, `localPlayerIndex`, `players`, `onInput`, `sendEvent`/`onEvent`,
  `snapshotHz: 20`, `interpolationDelayMs: 100` (`packages/sdk/src/net/index.ts:19-31`); the game hooks are
  `spawn`, `despawn`, `snapshot`, `applySnapshot`, `hud` (`packages/contracts/src/game.ts:201-211`).

So N3 is not an extension of an existing seat model; it introduces the model, and everything above consumes it in N2/N5.
The two-client verify harness joins with `protocol: PROTOCOL_VERSION`
(`packages/gm-verify/scenarios/two-client/harness.ts:60`), which is why §11/D-N3-17 pins that scenario to a v1 room.

### 2.3 What a v2 room must not lose

The v1 tests are the specification of the relay: 775 lines across `services/rooms/test/*.test.ts`, one case per rule
(owner-only drops and counting, the 1 000-violation removal, `design.tx` validation and `lastRev`, input stamping,
oversize and rate drops, presence zeroing, phase/`playRev`, draft load and ready, reconnection, idle dispose, revocation).
Every one of them must keep passing unchanged, because the same file serves protocol 1 and 2. That is the cheapest proof
that protocol 2 is additive, and it is why §11/D-N3-3 keeps `members` and `allowReconnection` intact for v1 rooms.

## 3. Design

Seventeen decisions carry the design; the log is §11. Each is written as the decision, the reason, and the alternative
that was rejected — that last part is what an implementer needs when the code gets awkward.

### 3.1 Seats are authoritative, `members` is a projection (D-N3-1)

A v2 room keeps a fixed-length seat table (`seats[0..maxPlayers-1]`) as the truth, and rebuilds the existing `members`
map from it whenever it changes: one entry per seated user, `playerIndex` = seat, `role` from the grant. Everything that
reads `members` today — presence relay, `editorSessionId` handling, the bridge's `net.players`, watcher catch-up — keeps
working without a change, and the v1 room keeps using `members` alone.

Rejected: replacing `members` outright. It would force a rewrite of `bridge-forwarding.ts`, `room-store.ts` and the
watcher path in the same PR that introduces seats, and it would put v1 regression risk behind a v2 feature.

A seat is `{ seat, userId, name, team, connected, ready, forfeited }` (§4.1). A seat number is stable for the life of the
room — every client keys its state on it — but the *occupant* can change: a forfeited seat is held for the rest of its
epoch and released at `net.epoch.end` (§3.8), so the next round starts from a full pool. A seat whose occupant leaves
*within* the window keeps `connected: false` and is re-bound on return; past the window it keeps `forfeited: true` and the
room will not assign it again until the epoch ends.

### 3.2 Seat assignment, and why the grant carries no seat (D-N3-2)

The room assigns seats, never the client:

1. The joining user already holds a seat (`seat.userId === grant.sub`) → that seat, whether it is connected, offline
   inside its window, or forfeited (a returning player after a forfeit rejoins as a spectator or waits for the next
   epoch; it never silently reclaims a forfeited seat's authority — the seat stays `forfeited` and the join is refused
   with `SEAT_TAKEN`). Failure: `SEAT_TAKEN`.
2. Otherwise the lowest free seat (not occupied, not forfeited), starting at 0. The creator is `ownerId` and takes seat 0
   by construction because it creates the room before anyone joins. Failure: `ROOM_FULL`, or a spectator if
   `spectators: 'on'`.
3. `grant.seat`, when present, must equal a seat bound to that same user, else `SEAT_TAKEN`. The room never honours a
   seat number for a user who does not hold it.

§4.7 of N1 adds `seat` to the grant's claims. The API cannot fill it: it has no view of the room's seat table, and a grant
is minted up to 600 s before it is used. So `seat` is an **optional** claim that only a resume-aware caller (a later
ticket, or a client that already knows its seat) may set, and the room treats it as a *claim about the same user*, never
as an allocation. This keeps `signGrant`'s signature and the API's routes unchanged.

Rejected: minting the grant from the room's state. It would make the API depend on a live room and break the loopback
rule the rooms service already keeps (`services/api/src/rooms/client.ts` is the only edge).

A rejected join must not consume a seat: `onAuth` only **evaluates** (protocol, pin, revocation, `SEAT_TAKEN`, `ROOM_FULL`)
and `onJoin` **commits** the assignment. Colyseus may run `onAuth` for a join that never completes, and allocating there
would leak seats until the room disposed.

### 3.3 The epoch, and the tick the room can publish without simulating (D-N3-4)

An epoch is one match. The room stores `epoch` (a UUID string), `startAt` (server epoch ms of tick 0), `pausedAt`
(0 while running), `seed`, `primarySeat`. It publishes

```
tick(now) = floor(((pausedAt || now) - startAt) * SIM_TICK_HZ / 1000)
```

from `net.tick` at 1 Hz, in every `net.start`, `net.pause`, `net.resume` and `net.epoch.end`, and in the `welcome` of a
late joiner. The 1 Hz beat runs only while an epoch exists — a room in its ready check is silent. Nothing else in the room
is time-dependent.

Consequences an implementer must respect:

- A pause is `pausedAt = now`; a resume is `startAt += now - pausedAt; pausedAt = 0`. The derived tick therefore *freezes*
  while paused and *continues* from the same value afterwards, with no state to reconcile anywhere.
- The room never runs a clock forward to catch up, and never simulates: `SIM_TICK_HZ = 60` is a constant of the mapping,
  not a loop.
- Every deadline in §7 is expressed in ticks by the clients and in milliseconds by the room (`startAt + lead`), and the
  two agree because they share this formula.

Rejected: a `tick` counter incremented by `setInterval`. It drifts against `startAt`, and a pause then has to rewind it.

### 3.4 Ready check and synchronised start (D-N3-5, D-N3-6)

`net.ready { ready }` sets `seats[i].ready`; the room broadcasts `net.seats` on any change. `net.start.request` from the
primary is honoured when every occupied, connected, non-forfeited seat is ready, or unconditionally with `force: true`
(the room option `forceStart: 'primary'` of §7.3 becomes the `force` flag on the message; one mechanism, not two).

On an honoured request the room mints `epoch = randomUUID()`, sets `startAt = now + startLeadMs` with
`startLeadMs = 1000`, elects the primary (lowest connected non-forfeited seat), mints `seed = crypto.randomInt(0, 2**32)`,
and broadcasts one `net.start` whose `seats` snapshot and `privateSeed` per-seat copy close the loop. `phase` becomes
`'playing'` and `phaseAt` is set, so the editor screens and the watcher view keep working unchanged.

**The lead is fixed at 1 000 ms and no client-supplied RTT is consumed.** N1 §7.3 writes `startAt = now + max(startLeadMs,
3 × worstRtt)`; the room cannot measure RTT (it answers `pong { c, s }` and the client computes the offset), and a
client-reported number would be an unverifiable input that only extends a countdown. A late-arriving `net.start` is safe
by construction: the client adopts the derived tick rather than simulating from 0 (§4.4 "late start"), so a 300 ms arrival
delay costs a recovery snapshot, not a desync. Taking `max(worstRtt)` would buy at most 200 ms of extra lead for the
slowest seat and would add a trusted input for it.

**Seeds are always minted.** `seed` is the shared stream; `privateSeed = hash(seed, seat)` is included in the copy
addressed to that seat, always, whether or not the mode uses it. §7.3 makes the per-seat copy conditional on "when the
mode uses it", which would need the room to know the manifest — the one thing it must not see. Four extra 32-bit fields
cost nothing, make N5's `private(n)` stream a client-side change only, and remove the condition entirely.

A start request while an epoch is running is dropped and counted as `EPOCH_ACTIVE` (§7.3), never queued. If a seated
player drops before `startAt`, the room cancels: `epoch` clears, `startAt` returns to 0, `net.start.cancel { reason:
'seat-offline' }` is broadcast and the ready flags are kept, because no tick 0 existed to rewind.

### 3.5 Event routing, and "applied once" (D-N3-15, D-N3-16)

A v2 `net.event` carries `{ epoch, id, seq, from, target, to?, team?, round?, data }`. The room:

1. validates the envelope (schema, `eventBytes`, `net.event` rate) and drops silently-and-counted on failure, exactly as
   v1 does;
2. **re-stamps `from`** with the sender's seat from its grant, and validates `to` (a seat in range) and `team` (a team the
   room has). A spectator has no seat and therefore cannot emit an event: dropped as `SPECTATOR_NOT_SEATED`;
3. routes: `'all'` → every seated session except the sender, plus every spectator; `'seat'` → the sessions bound to
   `to`, except the sender; `'team'` → the sessions whose seat's team equals `team`, except the sender. Delivery excludes
   the sender for all three targets, because the sender has already applied the event locally — including when it targets
   itself, which is the case §7.2's "the sender applied it" rule implies;
4. never renumbers, reorders, dedupes or parses `data`.

Ordering per sender is the transport's (one WebSocket per session, relayed in order). Cross-sender order is not
guaranteed, as §7.2 states.

**The dedupe lives in `packages/contracts/src/net-events.ts`**: `EventInbox` with `apply(event) → 'applied' |
'duplicate' | 'gap'`, a `(from, id)` seen-set and a per-sender `seq` window of `eventHistory = 256`, plus `missing(): {
from, seqs }[]` for the recovery request. It is pure with no Node-only import, so the room's tests, the SDK (N2) and the
bridge (N5) all assert the same thing, and that is what makes "a duplicated `net.event` is applied once" a room-level
test rather than a promise. It cannot live in `@ogm/room-protocol`: that package's entry point imports `node:crypto` for
`randomUUID` (`packages/room-protocol/src/grant.ts:1`), so a browser consumer cannot use it. The room itself does **not**
run the inbox — a relay that dedupes would be interpreting.

### 3.6 Disconnect, pause, rejoin and forfeit (D-N3-3, D-N3-12, D-N3-14)

A v2 seat's window is `playerReconnectSec = 30` for every seat, the creator included.

| Moment | Room | Clients see |
| --- | --- | --- |
| A seated session drops, unconsented | `connected: false`, window timer armed, `net.seats`, `net.seat.offline`; if an epoch runs and `pauseOnDisconnect` (default `true`), `pausedAt = now` and `net.pause { epoch, tick, startAt }` | The countdown freezes for everyone |
| The drop happens before `startAt` | The epoch is cancelled (§3.4) | `net.start.cancel` |
| The same user joins again inside the window | Seat re-bound (`connected: true`), timer cleared, `net.seat.online`, a unicast `net.start` with the epoch's `startAt` (in the past) and a unicast `net.tick`; the seat then asks the arbiter(s) for `net.recovery` | `net.seat.online`; the match resumes when no seat is still offline and not forfeited: `startAt += now - pausedAt`, `net.resume` |
| The window expires | `forfeited: true`; primary re-elected if it was that seat (`net.primary`); `net.seat.forfeit { epoch, seat }` | Clients apply the game's `forfeit` policy (`continue`/`skip`/`surrender`) from the announcement |
| That was the creator's seat | Identical. No `end()`, no `host-left`, no phase change while `playing` | `net.seat.offline` then `net.seat.forfeit` |
| A session leaves with `CloseCode.CONSENTED` | Forfeit immediately, no window | `net.seat.forfeit` |
| Every seat is forfeited | `ended { reason: 'abandoned' }`, then dispose after `idleDisposeSec` | `ended` |

Four specifics this pins down:

- **A seat is offline only when it has no sessions left.** The room must count a seat's live sessions (the same
  `sessions` list `members` already keeps) and mark it offline, start the window and pause only on the *last* one. A user
  with two devices who closes one tab has not disconnected.
- **v2 does not use `allowReconnection`.** A returning v2 player is an ordinary authenticated join whose seat the room
  recognises by user. Colyseus's reservation would leave two live sessions for one seat (the reserved one and the new
  join), and there is no supported way to cancel it. The window is therefore `this.clock.setTimeout` on the room. v1 rooms
  keep `allowReconnection` untouched, which is what the v1 lifecycle tests assert.
- **Pause is a room fact, not a client freeze** (§7.4): the room owns `startAt`, so the pause is one field and the resume
  is one addition. No seat can pause or resume unilaterally; the pause exists only while a window is open and `pauseOnDisconnect` is on.
- **The forfeit policy is client-side.** `continue`/`skip`/`surrender` are gameplay outcomes of the game's simulation, and
  the room has no simulation. Because the announcement is total and ordered, every client applies the same policy to the
  same seat and agrees. The room's only role is to say *who* forfeited and *when*. A `surrender` policy that must end the
  match reaches the room as the primary's `net.end.request` (§3.8), not as a room-side policy engine.

### 3.7 The editor path is untouched (D-N3-13)

Editing stays exactly as it is: `design.tx`, `presence`, `draft.load`, `draft.ready`, `kick`, `phase` remain
editor-session-only (`editorSessionId`), and the owner is still the editor. One change is required by §7.4: while a v2
room is `playing`, the owner's departure must not set `phase: 'pausedForHost'` (that would freeze a match for a reason the
match has its own mechanism for). So the editor-departure hook runs only while `phase` is `editing` or `migrating`; in a
v2 room whose phase is `playing`, the creator's drop is an ordinary seat drop and no phase changes.

### 3.8 Ending an epoch (D-N3-11)

N1 §7.3 refuses a start inside an existing epoch (`EPOCH_ACTIVE`) and says "the room never runs two matches at once", but
it defines no way to end one. The first consumer plays a best of three, so a room that cannot mint a second epoch cannot
serve it. N3 adds one client message and one server message:

- `net.end.request { epoch }` — primary only, 1/s, dropped as `NO_EPOCH` when `epoch` is stale.
- `net.epoch.end { epoch, tick }` — broadcast; the room clears `epoch`, `startAt`, `pausedAt`, `seed`, sets
  `phase: 'editing'` and `phaseAt`, and returns to the ready check. Every seat number is kept; every forfeited seat is
  **released** (`userId: ''`, `forfeited: false`) and every `ready` returns to `false`, because a forfeit is final for its
  epoch and not for the room. A best-of-three whose round 1 lost a player must be able to seat four for round 2.

This is the smallest shape that serves best-of-three and a `surrender` policy, and it is the only new message pair N3 adds
beyond N1's §9.2/§9.3 tables.

### 3.9 Ruleset pinning (D-N3-10)

`rulesetHash` is computed **by the client**, from the simulation-relevant manifest fields N1 §7.5 lists
(`authority`, `maxSeats`, `inputDelayTicks`, `forfeit`, the action table, the design document's `globals`) with a canonical
key-sorted JSON serialisation and 64-bit FNV-1a (`packages/sdk/src/net/ruleset.ts`, synchronous, no `crypto.subtle`
because the hash must be available before a room exists and must be identical in Node and the browser). The room receives
it as an opaque string at create and at join and compares strings: equal, absent, or `RULESET_MISMATCH`. An empty value
disables the comparison, which is how a v1 room stays valid.

Rejected: the room computing the hash. It would need the manifest, which §2 rule 1 forbids, and it would make the pin a
server-side interpretation of game data.

The trade-off is honest: 64-bit FNV-1a is not a security hash. It detects a divergent build, which is the only failure it
must detect; a collision between two gameplay-different builds is ~1 in 10^19.

### 3.10 Protocol 2 beside protocol 1 (D-N3-17)

- `PROTOCOL_VERSION` becomes `2`; `PROTOCOL_VERSION_V1 = 1` is exported beside it (`packages/contracts/src/room.ts`).
- The version is **per room**: `GameRoomOptions.protocol?: 1 | 2` (default `1`), stored in the existing
  `GameRoomState.protocol` field, and `onAuth` compares the join's `protocol` against `this.state.protocol`.
- The API's create body gains `protocol`, which the web sends as `PROTOCOL_VERSION`, so a v1 tab still creates a v1 room and
  a v2 tab creates a v2 room. The `(gameId, branchId)` room-reuse path in `services/api/src/rooms/rooms.ts:96-101` returns
  the open room whatever its protocol, so a mixed pair gets `PROTOCOL_MISMATCH` at join and the existing "reload to join"
  path shows it. That is loud, immediate and already implemented — a shim is not worth it.
- v2 message families live in `packages/contracts/src/net.ts` (new file, appended to `index.ts` and `browser.ts`);
  `room.ts` keeps every v1 schema byte-identical and gains `PROTOCOL_VERSION_V1` and `LIMITS_V2`.
- `ClientMessageSchema` and `ServerMessageSchema` become v1 ∪ v2 unions so the single room handler and the web client keep
  one validation call each, and `RATE_LIMITS`' `satisfies Record<ClientMessage['t'], number>` keeps every new type honest.
- The two scenarios that must keep asserting v1 are pinned, not deleted: `services/rooms/test/helpers.ts`'s `newRoom` gets
  no `protocol` (the default `1` keeps all 775 lines of v1 tests meaningful), and the two-client verify harness gains a
  `protocol` option defaulting to `1` (`packages/gm-verify/scenarios/two-client/harness.ts:60`) so its seven v1 assertions
  — including `ended: host-left` — keep passing until N6 replaces the scenario.

**Two traps the emitted-schema machinery sets for this ticket, both found while writing this document:**

1. **N1's stem names collide.** `scripts/emit-schemas.mjs` emits one JSON schema per entry of every `*Schemas` record, and
   `scripts/check-fixtures.mjs` pairs each emitted file with `fixtures/<family>/<name>.json` where `family` and `name` come
   from `^([a-z-]+)\.(.+)\.v\d+\.json$`. So `room.client-messages.v2.json` would be paired with the *same*
   `fixtures/room/client-messages.json` as `room.client-messages.v1.json`, and one fixture cannot validate against two
   different unions. The v2 family must therefore be named `net`: stems `net.client-messages.v1`,
   `net.server-messages.v1`, `net.room-state.v1`, `net.start.v1`, fixtures under `fixtures/net/`. (The version suffix is
   the family's own revision, not the protocol's; the protocol number lives in the message payloads.)
2. **`RoomStateSchema` is `.strict()` and is what the web client validates `welcome.state` with**
   (`apps/web/src/net/room-client.ts:217-225`). A v2 `welcome` carrying `seats`/`epoch`/`primarySeat` would fail that parse
   and be dropped *silently*, leaving the client in `connecting` until the 10 s timeout. `net.ts` must export
   `RoomStateV2Schema = RoomStateSchema.extend({ seats, spectators, epoch, startAt, pausedAt, primarySeat, seed,
   rulesetHash }).strict()` and the v2 `welcome` must use it. `RoomStateSchema` itself never changes.

### 3.11 What the room still never gains

No simulation, no checksum comparison, no arbitration, no snapshot storage, no per-game module loading, no `eval`, no
reading of `data`/`snapshot`/`frames` payloads. N3's review checklist item (§10.2 of N1) is a test: an event whose `data`
is a game-shaped object must be relayed byte-identical and have no effect on room state.

## 4. Interfaces

### 4.1 Room state additions (`services/rooms/src/state.ts`, Colyseus schema)

```ts
export const SeatState = schema(
  {
    seat: t.uint8().default(0),          // index in the array; assert seat === index on every write
    userId: t.string().default(''),      // '' = never assigned
    name: t.string().default(''),
    team: t.uint8().default(0),
    connected: t.boolean().default(false),
    ready: t.boolean().default(false),
    forfeited: t.boolean().default(false),
  },
  'SeatState',
);

// GameRoomState, additive fields only:
protocol: t.uint8().default(PROTOCOL_VERSION)   // exists today; per-room from GameRoomOptions
seats: t.array(SeatState)                        // length == maxPlayers from onCreate; index == seat
spectators: t.array('string')                    // userIds, no seat, no authority
epoch: t.string().default('')                    // '' = no epoch
startAt: t.number().default(0)                   // server epoch ms of tick 0; 0 = none
pausedAt: t.number().default(0)                  // 0 = running
primarySeat: t.uint8().default(0)
seed: t.uint32().default(0)                      // shared stream seed for the current epoch
rulesetHash: t.string().default('')              // opaque; '' disables the comparison
```

`members` (v1) stays and is rewritten from `seats` by one function, `syncMembersFromSeats()`, called after every seat
mutation. A v1 room never populates `seats`.

### 4.2 Room options (`GameRoomOptions`, `services/rooms/src/game-room.ts`)

```ts
type GameRoomOptions = {
  gameId: string; branchId: string; buildId: string; ownerId: string; maxPlayers: number;
  /** 1 = today's room; 2 = §7 of N1. Default 1. */
  protocol?: 1 | 2;
  /** Teams: 'none' (default; every seat team 0) or 'alternate' (seat n → team n % 2). */
  teams?: 'none' | 'alternate';
  /** Spectators: 'off' (default; a full room rejects) or 'on' (a full room admits a spectator). */
  spectators?: 'off' | 'on';
  /** Pause the epoch for everyone while a seat's window is open. Default true. */
  pauseOnDisconnect?: boolean;
  /** Opaque client-computed pin; '' disables the join comparison. */
  rulesetHash?: string;
  /** N1's `AuthorityMode`, carried through to `net.start` as an opaque string. Default 'host'. */
  mode?: string;
  /** Test seam only: the production lead is the fixed `startLeadMs = 1000` of D-N3-5. Clamped to 500..5000. */
  startLeadMs?: number;
  timings?: Partial<RoomTimings>;
  runtime?: RuntimeOptions;
};
```

`teams: 'custom'` is **deferred**: no consumer needs it (2v2 is `alternate` over four seats) and N1 gives no shape for it.
A `custom` value is rejected at create with 400 rather than silently treated as `none`.

### 4.3 Join options and rejections

`JoinOptionsSchema` (v2) adds two optional fields; the v1 shape is unchanged and remains valid because both are optional:

```ts
{ grant: string; buildId: string; protocol: number; seat?: number; rulesetHash?: string }
```

`JoinRejectionSchema` gains two variants, appended:

```ts
| { code: 'SEAT_TAKEN'; seat: number }
| { code: 'RULESET_MISMATCH'; expected: string }
```

### 4.4 Client → room (`packages/contracts/src/net.ts`)

`InputFrame` is v1's (`seq, tick, axes, buttons`), so `packages/sdk/src/net/input-codec.ts` and the manifest action table
do not change. `data`/`snapshot` are `Uint8Array` on the wire and base64 in the JSON twin, matching `room.ts`'s
`bytesSchema`/`base64Schema` pair (which moves to a shared helper; see U2).

| `t` | Payload | Rate | Size |
| --- | --- | --- | --- |
| `net.inputs` | `{ epoch, seat, firstTick, frames: InputFrame[] }` (1–8 frames, contiguous) | 45/s | 512 B |
| `net.state` | `{ epoch, seat, seq, tick, data }` | 10/s | 8 192 B |
| `net.event` | `{ epoch, id, seq, from, target, to?, team?, round?, data }` | 30/s | 16 384 B |
| `net.checksum` | `{ epoch, scope: 'shared' \| 'seat', tick, sum }` (`sum` uint32) | 4/s | 128 B |
| `net.recovery.request` | `{ epoch, scope: 'shared' \| 'seat' \| 'events', tick, seat? }` | 4/s | 128 B |
| `net.recovery` | `{ epoch, scope, tick, seat?, snapshot?, events? }` | 4/s | 65 536 B |
| `net.ready` | `{ ready }` | 5/s | 32 B |
| `net.start.request` | `{ force?: boolean }` — primary only | 2/s | 32 B |
| `net.end.request` | `{ epoch }` — primary only (D-N3-11) | 1/s | 32 B |
| `net.signal` | `{ epoch, to, data }` — opaque, routed to `to` | 20/s | 4 096 B |
| `net.seat.request` | `{ seat }` — honoured only for a free, non-forfeited seat, and only before an epoch starts | 2/s | 32 B |

`seat` in `net.inputs`, `net.state` and `from` in `net.event` are **re-stamped by the room from the grant**; a payload
that disagrees is overwritten, never rejected (v1 already behaves this way for `input`, and rejecting would turn a
buggy client into a dropped match).

### 4.5 Room → client (`packages/contracts/src/net.ts`)

| `t` | Payload | Notes |
| --- | --- | --- |
| `welcome` (v2) | `{ you: { userId, seat: number \| null, playerIndex, sessionId, spectator, team }, epoch?, state }` | `seat` is `null` for a spectator; `playerIndex` mirrors `seat` (and is `-1` for a spectator) and is kept only so v1-era readers (`apps/web/src/net/room-store.ts`) keep working; dropping it needs protocol 3 |
| `net.start` | `{ epoch, mode, startAt, seed, primarySeat, seats: Seat[], privateSeed? }` | Per-seat copy carries `privateSeed`; every copy carries the same `seed`, `startAt`, `epoch` |
| `net.start.cancel` | `{ reason: 'seat-offline' \| 'not-ready' }` | |
| `net.tick` | `{ epoch, serverTime, tick }` | 1 Hz, plus one unicast on join and on rejoin |
| `net.primary` | `{ epoch, seat }` | On start and on re-election |
| `net.seats` | `{ epoch, seats: Seat[], spectators: string[] }` | On any membership or ready change |
| `net.seat.online` / `net.seat.offline` / `net.seat.forfeit` | `{ epoch, seat }` | |
| `net.pause` / `net.resume` | `{ epoch, tick, startAt }` | `resume` carries the shifted `startAt` |
| `net.epoch.end` | `{ epoch, tick }` | D-N3-11 |
| `net.inputs` / `net.state` / `net.event` / `net.checksum` / `net.signal` | relayed, sender's fields intact | The room never reorders or renumbers |
| `net.recovery.request` / `net.recovery` | relayed to the arbiter | Routing in §4.6 |
| `ended` | `{ reason: 'host-left' \| 'owner-closed' \| 'idle' \| 'revoked' \| 'abandoned' }` | `abandoned` is v2-only |

`mode` is the `AuthorityMode` string from N1 §3.1, carried in the `net.start` snapshot because clients may not have the
manifest for the version they joined. It is a string the room received at create (`mode?: string`, default `'host'`) and
does not interpret.

### 4.6 Routing table (what `routing.ts` returns, given a sender and an envelope)

| Message from a seated session | Recipients |
| --- | --- |
| `net.inputs` | every other seated session in the current epoch (never a spectator) |
| `net.state` | every other seated session in the current epoch (the sender has already filtered by `view`, N5) |
| `net.event`, `target: 'all'` | every other seated session + every spectator |
| `net.event`, `target: 'seat'` | the sessions of seat `to`, minus the sender |
| `net.event`, `target: 'team'` | every session whose seat team equals `team`, minus the sender |
| `net.checksum` | every other seated session in the current epoch |
| `net.recovery.request`, `scope: 'shared'` | the primary seat's sessions |
| `net.recovery.request`, `scope: 'seat'` | the sessions of seat `seat` (required unless the sender is that seat) |
| `net.recovery.request`, `scope: 'events'` | the sessions of seat `seat` (the sender whose stream is missing) |
| `net.recovery` | every other seated session (a recovery snapshot is a shared fact) |
| `net.signal` | the sessions of seat `to` |
| anything from a spectator | dropped, counted (`SPECTATOR_NOT_SEATED`), except `net.seat.request` and `net.ready` |

Every message from a session in a room with no epoch (`epoch === ''`) is dropped and counted as `NO_EPOCH`, except the
ready check, `net.seat.request`, the editor messages of §3.7 and `ping`. That single rule is what keeps a stale tab from
writing into a fresh match.

### 4.7 Internal API and the API edge

`POST /internal/rooms` body (`services/rooms/src/internal.ts`) gains the room options, all optional:

```json
{ "gameId": "g_01J", "branchId": "main", "buildId": "sha256:ab12", "ownerId": "u_01J", "maxPlayers": 4,
  "protocol": 2, "teams": "alternate", "spectators": "off", "pauseOnDisconnect": true,
  "rulesetHash": "fnv1a64:9f2c…", "mode": "per-seat" }
```

`POST /api/v1/games/:gameId/rooms` (`services/api/src/rooms/routes.ts:63`) gains the same optional fields in its body
schema and passes them through `createRoom` → `createRelayRoom`. `maxPlayers` keeps its clamp (1..8, default 4). No route,
no grant shape and no environment variable changes: the room needs no new secret because D-N3-7 drops the resume token.

### 4.8 Bridge envelopes (`packages/contracts/src/bridge.ts`, `apps/web/src/net/bridge-forwarding.ts`)

Host → game, added: `net.mode`, `net.seats`, `net.primary`, `net.start`, `net.start.cancel`, `net.tick`, `net.seat`,
`net.pause`, `net.resume`, `net.epoch.end`, and the relayed `net.inputs`, `net.state`, `net.event`, `net.recovery`,
`net.checksum`, `net.transport`.

Game → host, added: `net.inputs`, `net.state`, `net.event`, `net.checksum`, `net.recovery.request`, `net.ready`,
`net.start.request`, `net.end.request`, `net.signal`.

The v1 pair (`net.input`, `net.snapshot`) stays. Size caps are enforced on both sides of the iframe boundary from
`LIMITS_V2`, in the same `warnOnce` shape as today (`apps/web/src/net/bridge-forwarding.ts:41-49`).

## 5. Implementation units

Ordered. Each unit is one commit's worth of work and names the test that proves it. `game-room.ts` is 458 lines today; the
plan adds at most ~150 lines to it (dispatch, lifecycle wiring, and the v2 branch of `onAuth`/`onJoin`/`onLeave`) and puts
the logic in modules, so a reviewer can read the room in one sitting.

| # | Files | Work | Proved by |
| --- | --- | --- | --- |
| U1 | `packages/contracts/src/room.ts` | `PROTOCOL_VERSION = 2`, `PROTOCOL_VERSION_V1 = 1`, `LIMITS_V2` (spread of `LIMITS` with §4.4's numbers), `JoinRejectionSchema` + `SEAT_TAKEN`/`RULESET_MISMATCH`, `JoinOptionsSchema` + optional `seat`/`rulesetHash`. No v1 schema changes. | `packages/contracts` typecheck; a schema test that parses a stored v1 `welcome`/`RoomState` fixture unchanged |
| U2 | `packages/contracts/src/bin/binary.ts` (new), `room.ts` | Move `bytesSchema`/`base64Schema` out of `room.ts` so `net.ts` can share them without a second copy, and so `room.ts` does not grow. | `pnpm --filter @ogm/contracts test` |
| U3 | `packages/contracts/src/net.ts` (new), `index.ts`, `browser.ts` | `SIM_TICK_HZ`, `TeamPolicySchema`, `SeatStateSchema`, `RoomStateV2Schema` (§3.10), every §4.4/§4.5 message (`NetClientMessageSchema`, `NetServerMessageSchema`, plus the base64 JSON twins), the `netSchemas` record with the stems of §3.10, and the union exports that make `ClientMessageSchema`/`ServerMessageSchema` cover v1 ∪ v2. | A round-trip test per message: parse `Uint8Array` and base64 forms, reject one over-size field, reject an unknown key |
| U4 | `packages/contracts/src/bridge.ts` | The §4.8 envelope names on both unions with `LIMITS_V2` caps. | `apps/web/src/net/bridge-forwarding.test.ts` (U12) |
| U5 | `packages/contracts/src/net-events.ts` (new), `packages/contracts/test/net-events.test.ts`, `browser.ts` | `EventInbox`: `apply`, `missing`, `reset(epoch)`; `(from, id)` dedupe, per-sender `seq` window of 256, `'gap'` on a jump. | Dedupe test: same `(from, id)` twice → `['applied','duplicate']` |
| U6 | `services/rooms/src/seats.ts` (new) | `assignSeat`, `bindUser`, `markOffline`, `markOnline`, `forfeit`, `freeSeat`, `electPrimary`, `teamOf(seat, policy)`, `syncMembersFromSeats`, `seatsSnapshot`. All pure over the schema objects except the members write. | `services/rooms/test/seats.test.ts` |
| U7 | `services/rooms/src/epoch.ts` (new) | `mintEpoch` (uuid, `startAt`, `seed`, `privateSeedFor(seed, seat)`), `tickAt(now)`, `pause(now)`, `resume(now)`, `endEpoch`, `canStart(seats)`. | `services/rooms/test/epoch.test.ts` (pure arithmetic, no Colyseus) |
| U8 | `services/rooms/src/routing.ts` (new) | `recipientsFor(envelope, senderSeat, seats, spectators, primarySeat)` returning `{ sessions: string[], drop?: DropCode }`, per §4.6. | `services/rooms/test/routing.test.ts` (pure) |
| U9 | `services/rooms/src/state.ts` | §4.1 fields + `createRoomState` takes the new options and pre-creates `seats` of length `maxPlayers`. | `services/rooms/test/state` covered by U10 |
| U10 | `services/rooms/src/game-room.ts` | v2 `onAuth` (protocol from state, `rulesetHash`, `SEAT_TAKEN`), `onJoin` (seat assignment, spectator path, `welcome` v2), `onDrop`/`onLeave`/`onReconnect` v2 branch (window timer, no `allowReconnection`, no `host-left`), the 1 Hz `net.tick` interval, and the eleven `handleMessage` cases dispatched to U6–U8. v1 branches untouched. | `services/rooms/test/{seats,teams,routing,start,reconnect,forfeit,protocol}.test.ts` |
| U11 | `services/rooms/src/internal.ts`, `services/rooms/src/lifecycle.ts`, `services/api/src/rooms/{routes,rooms}.ts` | §4.7: option pass-through on both hops, enum validation, clamp preserved. `EndReason` and the API's `/internal/rooms/:id/ended` body enum gain `abandoned`, or the v2 abandoned callback is posted with a v1 reason and the fact is lost. | `services/api/test/rooms.test.ts` (existing) + one create-with-v2-options case and one `abandoned` callback case |
| U12 | `apps/web/src/net/room-store.ts`, `room-client.ts`, `bridge-forwarding.ts` | Store gains `seats`, `spectators`, `epoch`, `primarySeat`, `startAt`, `paused`, `ready` and the actions `ready(bool)`, `requestStart()`, `requestEnd()`; `room-client` parses the v2 server messages into the store; `bridge-forwarding` maps the v2 envelopes both ways and keeps the v1 gates for v1 rooms. | `apps/web/src/net/{room-store,bridge-forwarding,room-client}.test.ts` |
| U13 | `packages/sdk/src/net/ruleset.ts` (new) | `rulesetHash(manifest, designGlobals)` — canonical JSON, 64-bit FNV-1a, `fnv1a64:<hex>`. | `packages/sdk/src/net/ruleset.test.ts`: key order does not matter, a changed `inputDelayTicks` does |
| U14 | `packages/gm-verify/scenarios/two-client/harness.ts` | `protocol` option, default `PROTOCOL_VERSION_V1`, used at `joinById`. | The existing seven-assertion scenario, unchanged |
| U15 | `services/rooms/README.md` | Seats, teams, epochs, routing, the window, and the "what the room never gains" list (N1 §10.2 acceptance). | Doc review |
| U16 | `packages/contracts/scripts/emit-schemas.mjs` (no change needed), `packages/contracts/fixtures/net/*.json` (new) | Emit the `net.*` stems of §3.10 beside the v1 entries and add one valid fixture per stem, or `pnpm --filter @ogm/contracts check` fails on a missing fixture. | `pnpm --filter @ogm/contracts check` |

Deferred with a note rather than a TODO: `net.transport` relaying (N4), the diagnostics overlay (N6), `view()` filtering
(N5), and `private(n)` streams being *used* (N5). N3 carries the messages and the seeds, not the consumers.

## 6. Test scenarios with expected values

Room-level tests use `@colyseus/testing` through `services/rooms/test/helpers.ts` (`startHarness`, `newRoom`, `connect`,
`joinOptions`, `waitFor`) with `defaultTimings` (`playerReconnectSec: 0.2` for the window tests and the real `30` asserted
separately from `LIMITS_V2`). Every scenario below fails without its production change; the pure units (U5–U8, U13) are
tested without Colyseus at all.

**Every "dropped and counted" assertion is paired with the same envelope succeeding in its valid form, in the same test.**
A room that does not implement `net.start.request` at all still increments `droppedCounts['net.start.request']` for an
unrecognised type, so a drop assertion alone is a test that passes on an empty implementation — the paired success is what
makes it a guard.

### 6.1 Seats and teams

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| S1 | v2 room, `maxPlayers: 4`, `teams: 'alternate'` | join as `owner`, `p1`, `p2`, `p3` | `seats` = `[{seat:0,team:0},{1,1},{2,0},{3,1}]`, `userId` = the grant's `sub`; `members` (the v1 projection) has the same four users with `playerIndex` 0–3 |
| S2 | S1 | `p1` sends `net.seat.request { seat: 3 }` | dropped and counted; `seats[1].userId` is still `p1` |
| S3 | S1 | a fifth user joins | `ROOM_FULL { max: 4 }` |
| S4 | S1 with `spectators: 'on'` | a fifth user joins | admitted with `you.spectator === true`, `you.seat === null`, `seats` unchanged, `spectators` length 1 |
| S5 | S1 | `p1` drops, rejoins inside the window | `seats[1].userId === 'p1'`, `connected` back to `true`, no `net.seat.forfeit` |
| S6 | a room whose seat 1 is forfeited, epoch still running | `p1` joins again | `SEAT_TAKEN { seat: 1 }`; seat 1 is not re-assigned until the epoch ends |
| S7 | v2 room, `teams: 'none'` | four joins | every `team === 0` |
| S8 | S1 | `p1` joins a second time from a second device, then closes the first | seat 1 stays `connected: true`, no `net.seat.offline`, no window, no `net.pause`; closing the second session does all three |
| S9 | S1 | a join rejected by `ROOM_FULL` (and one by `SEAT_TAKEN`) | `seats` is byte-identical before and after: a rejected join never allocates |

### 6.2 Ready check and start

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| S10 | S1, no epoch | primary sends `net.start.request {}` with 3 of 4 seats ready | dropped, `droppedCounts['net.start.request'] === 1`, `state.epoch === ''` |
| S11 | S10 with `force: true` | same | honoured: `epoch` is a UUID, `phase === 'playing'`, every seat receives `net.start` with the same `epoch`, `seed`, `startAt`, `primarySeat === 0` |
| S12 | S11 | read `startAt` and the clock | `startAt - now ∈ [950, 1 150]` ms at the moment the request was handled (`startLeadMs = 1000`, ±event-loop slop) |
| S13 | S11 | wait for `net.tick` | first `net.tick` arrives within 1 100 ± 200 ms; `tick === floor((serverTime - startAt) * 60 / 1000)` exactly, recomputed from the payload's own fields |
| S14 | S11 | a non-primary seat sends `net.start.request` | dropped and counted as `NOT_PRIMARY`; the epoch is unchanged |
| S15 | S11 | the primary sends `net.start.request` again | dropped and counted as `EPOCH_ACTIVE`; `epoch` unchanged |
| S16 | S11 with seat 3 forfeited | `net.end.request` from the primary | `net.epoch.end` reaches every seat; `epoch === ''`, `startAt === 0`, every `ready === false`, `phase === 'editing'`, seats 0–2 keep their `userId` and seat 3 is released (`userId === ''`, `forfeited === false`); the former seat 3 user rejoins and takes seat 3 again; a following start mints a *different* `epoch` and a later `startAt` |
| S17 | S11 | seat 2 drops before `startAt` (`playerReconnectSec: 0.2`, lead 1 000 ms → inject `startLeadMs: 5 000` in the test room) | `net.start.cancel { reason: 'seat-offline' }`, `epoch === ''`, the ready flags of the other seats are unchanged |

### 6.3 Routing

Four seats `owner,p1,p2,p3` (teams 0,1,0,1) and one spectator.

| # | Sender | Envelope | Expected recipients |
| --- | --- | --- | --- |
| S18 | owner (seat 0) | `net.event { target: 'all' }` | `p1`, `p2`, `p3`, spectator — 4 receives, owner 0 |
| S19 | owner | `net.event { target: 'seat', to: 1 }` | `p1` only (1 receive) |
| S20 | owner | `net.event { target: 'team', team: 0 }` | `p2` only (1 receive) |
| S21 | `p1` | `net.event { from: 0, target: 'all' }` | relayed with `from === 1` at every recipient; owner's copy has `from === 1` |
| S22 | `p1` | `net.event { target: 'seat', to: 999 }` | dropped, `droppedCounts['net.event'] === 1`, no delivery |
| S23 | spectator | `net.event { target: 'all' }` | dropped and counted as `SPECTATOR_NOT_SEATED`; no delivery |
| S24 | any seat | `net.inputs { epoch: 'wrong' }` | dropped and counted as `NO_EPOCH` |
| S25 | `p1` | `net.inputs` with `frames: [f1, f2, f3]` | `p2`, `p3`, owner each receive one envelope with `seat === 1` and the three frames in order; `p1` receives nothing |
| S26 | `p1` | `net.state { seat: 2, data }` | relayed with `seat === 1` to the other three seats only |
| S27 | `p1` | `net.event` with `data` = a 16 385-byte payload | dropped, not relayed |
| S28 | S1 | `EventInbox` applied to `p2`'s stream with the same `(from, id)` twice | `['applied', 'duplicate']`; a jump from `seq 4` to `seq 7` yields `'gap'` and `missing()` lists the two skipped seqs |
| S29 | S1 | `net.event` whose `data` is `{"t":"spawn","entities":[{"id":"e1"}]}` | relayed byte-identical at every recipient; `roomStateJson(state)` before and after the message is deep-equal (the room interpreted nothing) |
| S30 | S1, epoch active | `net.recovery.request { scope: 'shared' }` | reaches seat 0's sessions and nobody else; `{ scope: 'events', seat: 3 }` reaches seat 3's sessions |
| S31 | v2 room with the room's own clamp | `maxPlayers: 99` at create | clamped to `8`; seats array length 8 |

### 6.4 Drop, pause, rejoin, forfeit

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| S32 | S11 (`pauseOnDisconnect: true`), `playerReconnectSec: 0.2` | seat 1 drops | every seat receives `net.pause`; the pause payload's `tick` equals the derived tick at `pausedAt`; two `net.tick`s one second apart during the pause carry the *same* `tick` |
| S33 | S32 | seat 1 rejoins within the window | `net.seat.online`; every seat receives `net.resume` whose `startAt` equals the old `startAt` plus the paused duration (±50 ms); the rejoining seat receives one unicast `net.start` with `startAt` in the past and one unicast `net.tick`; the tick after resume continues from the paused tick (+1 per 16.7 ms) |
| S34 | S32, `pauseOnDisconnect: false` | seat 1 drops | `net.seat.offline` only, no `net.pause`; `net.tick` advances normally |
| S35 | S32 | the window expires | `seats[1].forfeited === true`, `net.seat.forfeit { seat: 1 }`, and `net.primary` re-election is *not* sent (seat 0 still primary) |
| S36 | S11 | seat 0 (primary) drops past its window | `net.seat.forfeit { seat: 0 }` then `net.primary { seat: 1 }` — the lowest connected non-forfeited seat after the election |
| S37 | S11 | seat 2 leaves with `CloseCode.CONSENTED` | `net.seat.forfeit` immediately, no window, no `net.pause` |
| S38 | S11 | all four seats forfeit | `ended { reason: 'abandoned' }` reaches the last session before it leaves; the room then disposes |
| S39 | v2 room, `phase: 'playing'` | the creator's session drops | no `ended` within 1 s of the forfeit, no `phase` change, `phase !== 'pausedForHost'` |
| S40 | v2 room, `phase: 'editing'` | the creator's session drops | `phase === 'pausedForHost'` (unchanged v1 editor rule) and the room does not end while another owner session exists |
| S41 | v1 room (default protocol) | the creator's last session drops | `ended { reason: 'host-left' }` — the untouched v1 path (this is one of the 775 existing lines; it must not need editing) |
| S42 | any v2 room | a forged resume: `joinOptions` for a *different* user with `seat: 1` | `SEAT_TAKEN { seat: 1 }`; seat 1's `connected`/`userId` unchanged |

### 6.5 Protocol, pinning and compatibility

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| S43 | v2 room | join with `protocol: 1` | `PROTOCOL_MISMATCH` (409) |
| S44 | v1 room (default) | join with `protocol: 2` | `PROTOCOL_MISMATCH` (409) |
| S45 | v2 room created with `rulesetHash: 'fnv1a64:aa'` | join with `rulesetHash: 'fnv1a64:bb'` | `RULESET_MISMATCH { expected: 'fnv1a64:aa' }` |
| S46 | S45 | join with `rulesetHash: 'fnv1a64:aa'` and with none | both succeed |
| S47 | a room created with no `rulesetHash` | join with any hash | succeeds (comparison disabled) |
| S48 | v1 room | the whole existing `services/rooms/test` suite | unchanged: 775 lines green with no edit, which is the additivity proof |
| S49 | `apps/web/src/net/room-client.test.ts` | feed a v2 `welcome` with `state` carrying `seats`, `epoch`, `startAt`, `primarySeat` | `status === 'connected'` and `store.seats.length === maxPlayers` — this is the trap-2 regression (§3.10) |
| S50 | `packages/sdk/src/net/ruleset.test.ts` | hash the same manifest with keys in a different order; hash after changing `inputDelayTicks` | equal; different |

### 6.6 Values worth pinning in constants rather than in tests

`SIM_TICK_HZ = 60` (a test in `packages/sdk` asserts `1 / FIXED_DT === SIM_TICK_HZ`, so the two cannot drift),
`startLeadMs = 1000`, `playerReconnectSec = 30`, `eventHistory = 256`, the §4.4 size caps, and `startAt` computed from
`Date.now()` — the same clock the room already stamps `pong.s` with (`services/rooms/src/game-room.ts:306`), so a client's
min-RTT offset estimate and its epoch mapping share one time base.

## 7. Assets

None. N3 adds no model, texture, audio, font, animation or fixture asset: the room is opaque to bytes, the tests use
in-memory `Uint8Array` payloads, and the grey-box shapes already used by `services/rooms/test` fixtures stand in for game
data. No licensed or downloaded content is involved, nothing is written to `assets-local/`, and the first consumer's
private asset library is untouched and out of scope. There is no visual surface to check: the room has no UI, and the
draft-only diagnostics overlay and per-seat HUD belong to N5/N6.

## 8. Evidence

| Claim | Locus | How it was checked |
| --- | --- | --- |
| The room is two-role with `playerIndex` seats and no teams | `packages/contracts/src/room.ts:36`, `services/rooms/src/game-room.ts:140` | read |
| Input is editor-only; snapshot/event are editor-only broadcasts | `game-room.ts:236-249` | read |
| The creator's departure ends the room | `game-room.ts:196-204` | read, and asserted by `services/rooms/test/lifecycle.test.ts` |
| Reconnection uses `allowReconnection` with 120/60 s | `game-room.ts:164-166` | read |
| Editor departure sets `pausedForHost` | `game-room.ts:355-370` | read |
| The grant carries no seat and the API mints it without one | `packages/contracts/src/room.ts:43-57`, `services/api/src/rooms/rooms.ts:50-67` | read |
| `PROTOCOL_VERSION` is one process-wide constant compared in `onAuth` | `room.ts:10`, `game-room.ts:92` | read |
| Room state has no seats/epoch field | `services/rooms/src/state.ts:85-101` | read |
| The web validates server messages with a strict `RoomStateSchema` inside `welcome` | `apps/web/src/net/room-client.ts:217-232`, `room.ts:103-118` | read; this is trap 2 of §3.10 |
| The bridge forwards only three `net.*` messages | `apps/web/src/net/bridge-forwarding.ts:65-78,106-127` | read |
| The SDK's network surface is host/peer with 20 Hz snapshots and 100 ms interpolation | `packages/sdk/src/net/index.ts:19-31` | read |
| Game hooks are `spawn/despawn/snapshot/applySnapshot/hud` | `packages/contracts/src/game.ts:201-211` | read |
| Emitted schemas are paired with fixtures by family+name, so two versions share one fixture | `packages/contracts/scripts/emit-schemas.mjs:8-37`, `scripts/check-fixtures.mjs:8-25` | read; this is trap 1 of §3.10 |
| `@colyseus/testing` gives `boot`/`createRoom`/`connectTo`/`waitForNextMessage`, and timings are injectable | `services/rooms/test/helpers.ts:24-44`, `services/rooms/package.json` (`@colyseus/testing: 0.18.6`) | read, and the pattern is in use by all 775 lines of existing tests |
| The two-client verify scenario joins with the shared `PROTOCOL_VERSION` | `packages/gm-verify/scenarios/two-client/harness.ts:60` | read |
| Room timing constants, limits and the reconnect window are already centralised | `room.ts:12-27`, `services/rooms/src/lifecycle.ts:1-31` | read |
| First consumer is 2–4 players, 1v1/FFA/2v2, best of three, 30 s rejoin before forfeit, no spectators | public summary of the consumer's planning issue (`its-everdred/Open-Games`, behaviour only) | read; no private content quoted |
| The private game context was not readable from this workspace | `assets-local` is a symlink whose target is absent here | `ls -l assets-local` shows the link; `ls assets-local/private/games` fails |

Nothing in this document was measured by running code: the agent workspace has no Node or pnpm, so no test, typecheck or
build was executed while researching. Every claim above is a source read, and the expected values in §6 are derived from
the formulas in §3 rather than observed.

## 9. Risks

| Risk | Impact | Mitigation | Resolved by |
| --- | --- | --- | --- |
| `game-room.ts` becomes unreadable as two protocols share one handler | Review cost, and the relay rule stops being visible | Cap the growth at ~150 lines; logic in `seats.ts`/`epoch.ts`/`routing.ts`; the §3.11 opacity test is the checklist item | N3 review |
| A v1 regression hides behind a v2 feature | The shipped V1 games and the acceptance record break | The 775 v1 test lines run unchanged; the v1 branches are touched in exactly six places (`onAuth`, `onJoin`, `onDrop`, `onReconnect`, `onLeave`, `handleMessage`'s default) | N3, S48 |
| `startAt` computed from the room's Colyseus clock instead of `Date.now()` | A client's offset estimate (`pong.s`, which is `Date.now()`) disagrees with the epoch mapping | One clock for every server timestamp; asserted in S13 | N3, S13 |
| A slow event loop shrinks the 1 000 ms lead | Some seats get a start in the past | That is the supported "late start" path, not a failure: the seat adopts the derived tick and asks for a recovery snapshot | N2/N3 |
| The web silently drops a v2 `welcome` (strict v1 state schema) | A client hangs in `connecting` with no error | `RoomStateV2Schema` plus S49 | N3, S49 |
| Two tabs on the same game/branch reuse a room across protocols | A confusing `PROTOCOL_MISMATCH` | Already a join rejection the UI shows; no shim, per D-N3-17 | N3 |
| Per-seat state at 10 Hz × 4 seats saturates a session's rate cap | Relay drops that look like packet loss | Rate caps are per *sending session*, not per recipient; asserted in S26 and by the existing rate tests | N3, S26 |
| Fan-out assertions race with `waitForNextMessage` | Flaky tests | Use per-client spies and `waitFor` on a counter, as `relay.test.ts` already does for its drop tests | N3 |
| A game relies on cross-sender event order | Non-deterministic gameplay | §7.2 already says order across senders is not guaranteed; games order by `round` and an in-payload sequence | N2/N5 documentation |
| A forfeited seat's client keeps writing after forfeit | Ghost inputs | The forfeited session's messages are dropped (`NO_EPOCH` if the epoch ended, otherwise a forfeit check before routing) | N3, S35/S38 |

## 10. Open questions with defaults

Each has a recommended default so the rewritten ticket never waits on an answer. Items answered inside this document are
in §11's decision log instead.

| Question | Recommended default | Why |
| --- | --- | --- |
| Is `inputDelayTicks = 3` right for a puzzle game? | Yes; keep it a manifest field so a twitch game can lower it | 50 ms of buffering on a turn-like action game is imperceptible; N1 §13 already recommends it |
| Should `net.state` be encoded once per recipient? | Yes, up to four encodes per send; 8 KiB × 3 × 10 Hz is well inside the room's caps | Visibility filtering happens before encoding, on the sender (N5) |
| Should `net.signal` be relayed before N4 exists? | Yes, opaque and routed now | N4 then needs no room change |
| Which forfeit policy for the four-player versus mode? | `continue` (freeze the seat) for free-for-all, `surrender` for 1v1 | A game decision carried in the manifest; the room only announces |
| `pauseOnDisconnect` for the co-op game | `false` | A shared world should not stall on one phone's tunnel; N1 §7.4 |
| Spectators for the versus game | `'off'` | Its own planning summary says no spectators; the option exists for later consumers |
| Does the room need round tracking for best-of-three? | No. `net.event.round` is opaque and `net.epoch.end` + a fresh `net.start` is one round per epoch | Rounds are simulation; the room has none |
| Should a forfeited user be able to rejoin as a spectator? | Same epoch: no (`SEAT_TAKEN`). Next epoch: yes, as a player (the seat is released at `net.epoch.end`) | Keeps the seat table honest and needs no extra state |
| Does a start need to carry the design revision? | No. `welcome.state.playRev` already carries it, and `net.start` is about the clock | One fact, one place |
| Should the room expose an admin/internal command to end an epoch? | Not in N3. The primary's `net.end.request` is enough | An internal route is a new surface with no consumer |
| Is 64-bit FNV-1a acceptable for `rulesetHash`? | Yes. It detects a divergent build; it is not a security boundary | §3.9 |
| Where does the room's per-epoch `seed` come from? | `crypto.randomInt(0, 2**32)` at start, once, shared by every copy | Determinism is per epoch, not per process |

## 11. Decision log

| ID | Decision | Why | N1 reference |
| --- | --- | --- | --- |
| D-N3-1 | Seats are authoritative; `members` is rebuilt from them as a v1-compatible projection | Keeps presence, editor and watcher paths unchanged in the same PR | §7.1 |
| D-N3-2 | The room assigns seats; `grant.seat` is an optional claim about the same user, never an allocation | The API cannot see the seat table, and a grant may be 600 s old | §4.7 (gap) |
| D-N3-3 | v2 reconnection is a room timer plus an ordinary authenticated join; `allowReconnection` stays v1-only | Prevents two live sessions for one seat | §4.7 |
| D-N3-4 | The room publishes a *derived* tick from `startAt`; pause/resume shift `startAt` | One arithmetic fact, no counter, no drift, no simulation | §4.4, §7.4 |
| D-N3-5 | The start lead is a fixed 1 000 ms; no client-supplied RTT | The room cannot measure RTT; a late start is the supported path | §7.3 (gap) |
| D-N3-6 | The room always mints `seed` and a per-seat `privateSeed` | The room must not read the manifest, and N5 then needs no room change | §7.3 (gap) |
| D-N3-7 | No resume token in N3 | With seats bound to users and a grant that already proves the user, it protects nothing new; a second credential is a second thing to leak | §4.7 (gap) |
| D-N3-8 | Teams are `none` or `alternate`; `custom` is deferred and rejected at create | No consumer, no defined input shape | §7.1 |
| D-N3-9 | Spectators hold no seat (`spectators: string[]`), not a flagged seat entry | A seat number for a non-player collides with seat routing | §7.1 (gap) |
| D-N3-10 | `rulesetHash` is computed by the client and compared opaquely by the room | No game data in the service | §7.5 (gap) |
| D-N3-11 | N3 adds `net.end.request` / `net.epoch.end` | Best-of-three cannot reuse a room under `EPOCH_ACTIVE` | §7.3 (gap) |
| D-N3-12 | The forfeit *policy* is applied by clients from the room's forfeit announcement | It is simulation; the room has none, and the announcement is total and ordered | §4.7, §7.4 |
| D-N3-13 | `pausedForHost` stays an editing-phase rule; it never fires during a v2 match | Two pause mechanisms for one match would fight | §7.6 |
| D-N3-14 | A consented leave forfeits immediately; only an unconsented drop opens a window | A deliberate quit should not hold three other players for 30 s | §7.4 |
| D-N3-15 | `EventInbox` (dedupe, gap detection) lives in `packages/contracts/src/net-events.ts` | Browser-safe, so N2/N5 reuse the exact code N3's tests assert; `@ogm/room-protocol` is Node-only | §7.2 |
| D-N3-16 | A routed event never returns to its sender | It has already applied the event locally | §7.2 |
| D-N3-17 | Protocol 2 is per room; v1 rooms, grants, schemas and tests are untouched; the two-client scenario is pinned to v1 | The shipped V1 games and the acceptance record depend on it | §9.1, §11.3 |

## 12. Non-goals

- The SDK's per-seat authority, foundations, checksums and recovery (N2). N3 relays `net.checksum`, `net.recovery*` and
  `net.inputs`; it never computes, compares or stores one.
- `view()` filtering and private draws (N5). N3 mints the seeds and relays what it is given.
- WebRTC, the transport seam and transport selection (N4). N3 relays `net.signal` and nothing else about it.
- The diagnostics overlay, the metric table and the link simulator (N6).
- Matchmaking, public rooms, room discovery, room chat, voice, tournaments, a round engine, persistence of gameplay state,
  and any server-authoritative mode (N1 §3.7).
- Rewriting the two-client verify scenario (N6) or the `gm-multiplayer-ready` skill (N2).
