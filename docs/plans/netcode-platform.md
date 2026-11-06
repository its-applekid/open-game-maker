# Netcode platform

**Status:** platform design (N1). The contracts and message schemas below are the input for N2–N6.

**Issue:** #495

**Repository evidence:** `main` at `ecc82754869d79b1c394fcc8690a3f622ffa6062`

**Plan-pack evidence:** `research`, `docs/plans/ogm-v1-build/evidence/T07-multiplayer.md` (the host-authoritative relay this
document extends), `docs/plans/ogm-v1-build/decisions.md` (D-ROOMS, D-HOOKS), `docs/architecture/architecture-scope.html`.

**Consumers:** #496 (N2, SDK per-seat authority), #497 (N3, rooms), #498 (N4, transport), #499 (N6, diagnostics),
#500 (N5, per-seat views and visibility). #501–#505 are the research spikes that run before N2–N6.

This document fixes the layer every game uses for networked play: one SDK API with pluggable authority modes, the
deterministic and recovery foundations all modes share, the visibility rules that decide what a seat may receive, the
transport seam, the diagnostics contract, and the room protocol revision that carries them. It is a design, not an
implementation: it changes no code, and nothing here authorises a spend, a deployment or a new dependency.

The first consumer is a 2–4 player versus puzzler. The later consumer is a shared-world co-op game. Both are described
here only by behaviour; no game's private content appears in this file.

## 1. Where the platform is today

### 1.1 The rooms service

`services/rooms` is a relay-only Colyseus process (`colyseus@0.18.10`, `@colyseus/core@0.18.24`,
`@colyseus/ws-transport@0.18.4`). `services/rooms/src/game-room.ts` holds membership, the `(gameId, branchId, buildId)`
pin, the phase, presence and `lastRev`. It validates every client message against `packages/contracts/src/room.ts` and
relays `input`, `snapshot` and `event` without interpreting their payloads. It binds `127.0.0.1`.

The authoritative facts a new mode has to coexist with:

- **Roles are `owner | player`.** `packages/contracts/src/room.ts` `RoleSchema`. The owner is the room creator; every
  owner departure sets `phase: 'pausedForHost'` and, when the owner has no remaining session, ends the room with
  `reason: 'host-left'`.
- **Seats are `playerIndex` on a membership.** `GameRoom.onJoin` assigns `0` to the owner and the lowest free index to
  everyone else, bounded by `maxPlayers` (`LIMITS.maxPlayersDefault: 4`, ceiling 8). There are no teams.
- **Phase is `editing | migrating | playing | pausedForHost | ended`.** `PhaseSchema`. There is no countdown and no
  pause state that any seat can trigger.
- **Rates are per session and per message type.** `RATE_LIMITS` in `game-room.ts`, one entry per `ClientMessage['t']`;
  the room counts violations in a 60 s window and drops the session at 1 000.
- **`input` is relayed to the editor only.** The editor session is the owner's session; a peer's frame is re-stamped with
  the member's `playerIndex` and sent on. `snapshot` and `event` are relayed from the editor to everyone else.
- **Reconnection already exists.** `onDrop` calls `allowReconnection` for `ownerReconnectSec` (120 s) or
  `playerReconnectSec` (60 s); `onReconnect` re-sends `resync { fromRev }`. A dropped player who does not return is
  removed from `members`, and the room ends if that member was the owner.
- **`ping`/`pong` already carries a server timestamp** (`{ c, s }`). `RoomStore.setRtt` consumes it for the one RTT
  number the room session carries today.

### 1.2 `gm.net`

`packages/sdk/src/net/index.ts` exposes `createNetController`. The whole network surface a game sees is
`GmNet`: `role`, `localPlayerIndex`, `players`, `onPlayerJoined/Left`, `onInput`, `sendEvent`/`onEvent`,
`snapshotHz: 20`, `interpolationDelayMs: 100`.

Its two channels are unconditional:

- `HostChannel` (`host.ts`) takes peers' inputs, decodes them with the manifest's action table and feeds `acceptInput`;
  every third fixed step (`tick % 3 === 0`) it packs `hooks.snapshot()` and sends `net.snapshot`.
- `PeerChannel` (`peer.ts`) encodes the local frame, buffers up to three snapshots and renders 100 ms behind by lerping
  `entities[id].p` and slerping `entities[id].r`.

`RoleStore` (`roles.ts`) decides `role` from `net.role`, spawns and despawns avatars through `hooks.spawn`/`hooks.despawn`,
and is the source of `players`.

`packages/sdk/src/core/runtime.ts` owns the loop: `FixedClock` (`FIXED_DT = 1/60`, `advance(ms)` accumulating whole
steps), `SeededRng` (32-bit state with `snapshot()`/`restore()`), `InputMerger` and the single `SEND` path. A peer
returns from the step early — it never simulates input, it only renders snapshots.

### 1.3 The bridge and the room protocol

The game iframe never holds a socket or a grant. `apps/web/src/net/bridge-forwarding.ts` owns the room client and
translates between room messages and bridge envelopes: `net.role`, `net.players`, `phase`, `net.input`, `net.snapshot`,
`net.event`. The envelopes are declared in `packages/contracts/src/bridge.ts` (`hostToGameSchema`,
`gameToHostSchema`). Every payload is schema-checked on both sides and size-capped before it crosses.

`packages/contracts/src/room.ts` declares `PROTOCOL_VERSION = 1`, `LIMITS`, the grant, the room state, and both message
unions. Its header states the rule this design follows: *"A protocol bump adds room.*.v2 files beside these; v1 never
changes in place."*

### 1.4 What this shape cannot do

| Requirement (from #495–#500) | Today | Why it blocks |
| --- | --- | --- |
| Local input with no round trip | Peers send input to the host and wait for a snapshot | The peer's own avatar moves one RTT after the key press |
| Deterministic agreement between clients | Nothing compares two clients' state | No checksum, no recovery, no way to see a divergence |
| Synchronised start | `phase: 'playing'` is applied on receipt | Clients start on different ticks, so every input is misaligned |
| Tick-stamped, redundant inputs | One frame per send, no tick ring, no dedupe | A single lost packet is a visible input gap |
| Reconnect into a running match | `resync { fromRev }` covers the design document, not gameplay | A reconnecting seat has no gameplay state |
| Four seats with teams and routing | `input` goes to one session, `event` is broadcast, no teams | Unicast, team and seat-targeted events are impossible |
| Per-seat views | One snapshot for everyone | Anything in the snapshot is visible to every seat |
| Host leaves → room ends | `onLeave` ends on the creator's last session | #497 requires the same forfeit policy for the creator |
| Transport choice | Colyseus WebSocket only | No seam to add WebRTC, no measurement to justify it |
| Diagnostics | Four counters, no RTT per seat, no overlay | #499 needs per-seat metrics and a bad-network verify |

## 2. Design rules

These are invariants for every ticket in this family. A ticket that breaks one needs an explicit decision in the
decision log, not a quiet exception.

1. **No game code on the server.** The rooms service relays, validates envelopes and routes by seat or team. It never
   simulates, never arbitrates game state, and never runs a game's code. Every authority mode in this document runs in a
   browser.
2. **One API, modes behind it.** A game mounts one `gm.net`. The authority mode is a declaration in the game manifest and
   a room option; the surface a game touches does not change when the mode does. Mode-specific behaviour lives in
   `packages/sdk/src/net/modes/*` behind the same controller.
3. **Additive protocol.** `PROTOCOL_VERSION` moves to `2`; every v2 message family is added beside the v1 family
   (`room.*.v2`), and no v1 message changes shape. A v1 room and a v1 game keep working unchanged.
4. **The primary is not the authority.** Exactly one client arbitrates *shared* state and any routing the service cannot
   do; the service decides who that is (it knows who is connected) and announces it. The primary sees no input another
   seat does not see and never becomes a game server.
5. **Hidden data is never sent.** Visibility is enforced before encoding, on the sending client. The service cannot
   filter what it cannot see; the SDK therefore must.
6. **Every timing decision is in ticks.** Milliseconds appear only in diagnostics, never in state, in a checksum or in a
   comparison that decides gameplay.
7. **Recovery beats correctness-by-argument.** Determinism is the fast path; a checksum mismatch is resolved by a
   recovery snapshot from the arbiter, not by an unbounded retry of the same computation.

## 3. Authority modes

### 3.1 The mode declaration

The game manifest gains one field and the room gains one option. They are two halves of the same declaration; a join
whose halves disagree is rejected like `BUILD_MISMATCH`.

```ts
// packages/contracts/src/game.ts — manifest.net.v1
type AuthorityMode = 'per-seat' | 'host' | 'rollback';

interface NetManifest {
  /** The mode this game was written for. Absent means 'host'. */
  authority?: AuthorityMode;
  /** Seats this game accepts; must be ≤ the room ceiling (8). */
  maxSeats: number;
  /** Ticks a remote seat's input may be delayed to absorb jitter. Default 3, clamped to 2..8. */
  inputDelayTicks?: number;
  /** How often the owner of a seat publishes its authoritative state. Default 10. */
  seatStateHz?: number;
  /** Which seats, if any, may observe without playing. Default 'off'. */
  spectators?: 'off' | 'on';
  /** What a seat's departure does to the match. Default 'continue'. */
  forfeit?: 'continue' | 'skip' | 'surrender';
}
```

`authority` is the switch. `'host'` is what the SDK implements today, and the default when `net` is absent, so a manifest
written before this design still loads. `'per-seat'` is this ticket's target. `'host'` and `'rollback'` are specified
extension points (§3.5, §3.6) with their hook requirements fixed here so that games and tests written now do not have to
be rewritten when they land. A game that declares a mode it does not get is not silently downgraded: the join is
rejected with `MODE_MISMATCH`.

### 3.2 Per-seat authority

Every client simulates the whole world at the fixed step. Each seat is authoritative for its own **owned** state, which
it publishes straight from its own simulation with no round trip. Remote seats are reconstructed from their
tick-stamped input streams. A published owned state supersedes a reconstruction whenever the two differ.

```
seat A (local)                          seat B (remote)
────────────────────────────────────    ───────────────────────────────────
input(t=A)  ──► apply at tick t          inputs from A, buffered
                                        └─► apply at tick t (after delay D)
step(t)     ──► owned state of A         step(t) ──► reconstruction of A
            └─► net.state { seat: A }   ◄── net.state { seat: A }
                                        reconcile: owner's word wins
```

The three properties that make this work:

- **No local round trip.** A seat's own input is applied in the step that reads it. Nothing waits for the network.
- **Determinism carries remote seats.** Every client runs the same step function over the same inputs, so B's guess at
  A's state agrees with A's own simulation except after loss or a late packet.
- **Correction is bounded.** Reconciliation changes only the fields the owner publishes, and only when the local copy
  differs; the visual correction is damped (see `correctionMs` in §3.4).

### 3.3 State ownership classes

A game divides its simulation state into three classes and declares the boundary once:

| Class | Who computes it | How it travels | Examples |
| --- | --- | --- | --- |
| **Owned** | The seat that owns it | `net.state` at `seatStateHz`, filtered for the recipient | An avatar's transform, a seat's own resources |
| **Shared** | Every client, from ordered seat events | Never sent in steady state; verified by checksum | A board, a placed piece, a round result |
| **Cosmetic** | Every client, locally | Never sent and never checksummed | Particles, screen shake, a HUD flourish |

The rule that keeps this simple: **if a value can be derived from the ordered input and event streams, it is shared and
does not travel; if it cannot, exactly one seat owns it.** A game that treats a shared value as owned will duplicate it
across four `net.state` streams; a game that treats an owned value as shared will diverge without a way to recover.

`MultiplayerHooks.capture({ seat })` returns the owned slice for one seat; `capture({})` returns the shared slice.
`MultiplayerHooks.digest()` returns the canonical integer projection of both (§4.6).

### 3.4 The primary seat

One seat is the **primary**: the arbiter of shared state and of any routing the service cannot do. The rooms service
elects it (lowest connected seat, which is the creator at start) and announces it with `net.primary`; it re-elects on a
forfeit and announces again. Clients act on arbitration only for the primary announced in the current epoch.

The primary is not a server. It relays nothing, it receives no privileged input, and its simulation is the same
simulation everyone else runs — it only wins an argument.

| Role | Meaning in v2 | Compatibility |
| --- | --- | --- |
| `net.role: 'host'` | This client holds the primary seat | Same value v1 gave the owner, so v1 code paths keep their meaning |
| `net.role: 'peer'` | This client holds any other seat | Same |
| `net.mode` | Which authority mode the match runs | New; gate new behaviour on this, never on `role` |

### 3.5 Extension point: host-authoritative with prediction and reconciliation

Declared `authority: 'host'`. The primary seat simulates the world and publishes it at 20 Hz, as today. Every other seat
predicts its own owned state locally and corrects from the authoritative stream:

1. The seat applies its input immediately to its own predicted copy, stamped with the tick it belongs to.
2. It keeps a ring of `(tick, inputTheyOwn, ownedStateBefore)` for `maxPredictionTicks = 12`.
3. On `net.state` from the primary it finds the snapshot's tick in the ring, restores the owned slice, and re-applies
   the inputs it owned from that tick to the present.
4. A residual error after replay is damped over `correctionMs = 120` (position offset decays linearly, rotation
   shortest-arc) instead of snapping.

Hook requirement: the same three hooks per-seat mode needs. Today's templates already produce the two snapshots through
`snapshot()`/`applySnapshot()` and gain `digest()` in N2, so host mode is a switch, not a rewrite. Nothing about the wire
changes: host mode uses `net.state` from the primary seat only and `net.inputs` from the rest.

### 3.6 Extension point: deterministic rollback

Declared `authority: 'rollback'`. Whole-world determinism, in the style of a fighting game:

1. Every seat sends its input for tick `t` at least `inputDelayTicks` ahead and repeats the last `redundancy` ticks.
2. The confirmation floor is `min over seats of confirmedTick`, carried in a 2 Hz `net.floor` message; every seat knows
   how far back it may still need to replay.
3. A late input for tick `t` inside the floor window restores the world at `t`, applies it and re-simulates to the
   present; the ring holds `rollbackFrames = 120` captures.
4. Beyond the floor window the seat hard-resyncs to the primary's recovery snapshot and counts a `hardResync`.

Hook requirement: `capture({})`/`restore()` must cover the whole simulation, `digest()` must be a pure function of it, and
the step function must not allocate per-entity objects that escape the ring. This mode is where "every timing decision is
in ticks" is load-bearing; a single `Date.now()` in the step breaks it.

### 3.7 Why there is no server-authoritative mode

The room runs on the host machine with no game code, no game assets and no sandbox. A server-authoritative mode would
move every game's rules into the service, which contradicts the sandbox rule and the whole relay design, and it would
put an untrusted creator's logic inside a platform process. The three modes above are the complete set; a fourth is a
different architecture, not a setting.

## 4. Shared foundations

The seven mechanisms below are mode-independent. N2 implements them once, in `packages/sdk/src/net/foundations/`, and
every mode composes them.

### 4.1 The deterministic fixed-step contract

The step is the only place simulation changes. `FixedClock` already runs it at `FIXED_DT = 1/60` and already injects
whole-tick durations. The contract a game must meet for checksums to be meaningful:

1. **Tick input.** The step reads a tick number and applies only the frames stamped with that tick. A frame for a past
   tick is either replayed (§3.6) or dropped and counted; a frame for a future tick stays buffered.
2. **No wall clock.** `Date.now()`, `performance.now()`, `Math.random()` and `crypto.randomUUID()` are forbidden inside
   the step. `packages/sdk/src/test/no-random.test.ts` already enforces this for `core`, `fx`, `nav`, `proc`, `test` and
   `three`; N2 adds `net` to its directory list, so the rule is checked rather than remembered.
3. **Integer or quantised state.** Positions, velocities and timers are integers, or floats quantised to `1/256` at the
   moment they enter state. Unquantised `float64` from a transcendental function is not portable between engines:
   `Math.sin`, `Math.cos`, `Math.pow` and `Math.exp` may differ in the last bit between Chrome and Safari.
4. **Canonical order.** Any iteration that affects state goes in a stable order — entity ids sorted, seats ascending.
   `Map` insertion order is not a contract.
5. **Seeded randomness only.** `runtime.rng` (§4.2), never a global generator.
6. **No dependence on render.** `render()` may read state; it may not write it.

Determinism is required for the *checksummed projection*, not for the whole world: cosmetics may drift freely, and a
game that needs a transcendental floats only the values it does not put in `digest()`.

### 4.2 Seeded random streams

`SeededRng` is already 32-bit, snapshotable and integer-exact (`packages/sdk/src/core/rng.ts`). v2 gives a match three
kinds of stream:

| Stream | Seed | Visible to | Use |
| --- | --- | --- | --- |
| `shared` | `start.seed` | every seat | Anything every client must agree on: spawn jitter, board shuffle |
| `seat(n)` | `hash(start.seed, n)` | every client | Nothing secret; a per-seat stream that everyone can still verify |
| `private(n)` | sent only to seat `n` in `net.start` | that seat | Hidden draws whose result is revealed later as an event |

`net.rng('shared')` and `net.rng(n)` return the same `Rng` interface the runtime exposes. Creating a stream is
idempotent per epoch. A value drawn from a shared stream reaches `digest()` through the value it produced, never through
the generator's state; a `private(n)` stream is not in `digest()` at all (§5.2).

The `private` stream is the only honest way to keep a future draw secret (§5.3). A shared stream is public by
construction: if seat A can compute it, seat A can compute seat B's next draw.

### 4.3 Tick-stamped redundant inputs

```ts
// wire: client → room → seats
type NetInputs = {
  t: 'net.inputs';
  epoch: string;
  seat: number;              // sender's seat; the room re-stamps from the grant, never from the payload
  firstTick: number;         // tick of frames[0]
  frames: InputFrame[];      // contiguous ticks, oldest first
};
```

Rules:

- A seat sends at 30 Hz a window covering **at least the last three ticks** (`redundancy = 3`). At 30 Hz, three frames
  per packet survives two consecutive lost packets without a gap.
- `InputFrame` keeps its v1 shape (`seq`, `tick`, `axes`, `buttons`) so `input-codec.ts` and the manifest action table
  are unchanged. `seq` becomes the per-seat monotonic counter that the receiver uses to detect a reordered window.
- A receiver keeps a per-seat ring of the last `inputHistoryTicks = 120` frames, keyed by tick. A duplicate tick is
  ignored (first write wins; retransmitted frames are identical by construction).
- A missing tick at the application deadline repeats the seat's last known frame on that tick and increments
  `inputGaps`. It does not stall the simulation.
- A gap longer than `resyncAfterGapTicks = 30` (500 ms) makes the receiver request a recovery snapshot for that seat
  (§4.6) rather than extrapolate further.

The room checks the envelope (`inputBatchBytes`, `inputPerSec`) and relays it to every seat except the sender. It does not
interpret `frames`.

### 4.4 Clock sync and synchronised start

The room is the only node every client can see, so it is the clock reference. It is not a game clock: it stamps and
forwards, nothing more.

- **Sampling.** The SDK reuses the existing `ping { c }` / `pong { c, s }`. Sampling starts at join — before the ready
  check, so the offset is known before a countdown begins — with eight samples over ~2 s and one every 5 s afterwards.
  The client keeps the sample with the **lowest RTT** as the offset estimate (the minimum-RTT filter, as in NTP: the
  fastest round trip has the least queueing asymmetry). `offset = s - (c + rtt/2)`.
- **Epoch time.** Within an epoch, tick `t` maps to server time `startAt + round(t * 1000 / 60)`. That mapping, not the
  local clock, decides when a step runs.
- **Synchronised start.** The primary requests a start; the room mints the epoch and broadcasts

  ```ts
  type NetStart = {
    t: 'net.start';
    epoch: string;
    mode: AuthorityMode;
    startAt: number;         // server epoch ms of tick 0, at least 1 000 ms ahead
    seed: number;
    primarySeat: number;
    seats: SeatInfo[];       // { seat, userId, name, team, connected, spectator }
    privateSeed?: number;    // included only in the copy addressed to that seat
  };
  ```

  Every client arms `FixedClock.reset(0)` and steps only once its offset-corrected clock reaches `startAt`. A countdown
  shown to players is derived from the same mapping, so the "3, 2, 1" and the first tick cannot drift apart.
- **Late start.** A client that joins mid-match receives the same `net.start` with `startAt` in the past plus a recovery
  snapshot at the current tick; it restores and resets its clock to that tick. It never fast-forwards by simulating the
  missed ticks. `lateStartTicks` is a diagnostic, not a state difference.
- **Drift.** The room broadcasts `net.tick { epoch, serverTime, tick }` at 1 Hz. A client whose tick differs by more
  than `maxDriftTicks = 6` (100 ms) re-syncs from the room's tick and counts `clockResyncs`; a step is never run twice
  for the same tick, so the correction is a skipped or held step, not a duplicated one.

### 4.5 Jitter buffers

Two buffers, one rule each:

- **Input buffer.** Tick `t` is simulated only when either every seat's frame for `t` has arrived or
  `deadline(t) = startAt + round(t * 1000/60) + inputDelayTicks * 1000/60` has passed. `inputDelayTicks` starts at the
  manifest's value (default 3) and adapts to the 95th percentile of inter-arrival jitter, clamped to 2..8. Adaptation is
  monotonic per epoch — the delay only grows inside a match, because shrinking it is a rewrite of the future.
- **Render buffer.** In `per-seat` mode remote seats are drawn `renderDelayTicks = 3` behind and interpolated between
  two reconstructed states; owned seats are drawn at the current tick. In `host` mode the existing 100 ms snapshot
  interpolation stays as it is, because changing it would retune every game's feel for no gain.

### 4.6 Checksums and recovery snapshots

- **Digest.** `hooks.digest()` returns a flat array of integers — the canonical projection of owned and shared state,
  in canonical order, quantised. The SDK folds it with FNV-1a 32-bit
  (basis `0x811c9dc5`, prime `0x01000193`, little-endian 32-bit words) into one `sum`.
- **Cadence.** Every `checksumEveryTicks = 30` (twice a second) each seat sends
  `net.checksum { epoch, scope: 'shared', tick, sum }` and, at every `seatStateHz` boundary, the sum of its owned slice is
  implicit in `net.state`. Shared checksums are compared by every client; owned checksums are compared by the owner's
  recipients, who already hold the authoritative value and only count a mismatch as a diagnostic.
- **Mismatch.** A client that sees a mismatch sends `net.recovery.request { epoch, scope, tick }`. `scope` is
  `'shared'`, `'seat'` or `'events'`. The room routes it to the arbiter (the primary for `'shared'`, the seat's owner for
  a seat scope, the event's sender for `'events'`) and the arbiter answers `net.recovery`, which carries a `snapshot` for
  a state scope and a list of `events` for the event scope. The requester restores, replays its buffered inputs from
  `tick` when the gap is ≤ `maxReplayTicks = 120`, otherwise continues at the snapshot tick and counts `hardResync`.
- **Rate and size.** Recovery snapshots are capped at `recoveryBytes = 65 536` and `recoveryPerSec = 4`; a request inside
  the cap window is coalesced (the oldest outstanding request per scope wins, so four seats recovering at once produce
  four snapshots, not forty).
- **What is compared.** Only integers. A float that only affects drawing never enters `digest()`, so a cosmetic
  divergence can never trigger a recovery.
- **Circuit breaker.** A seat that hard-resyncs `maxResyncs = 3` times inside 60 s is marked `desynced`: the SDK raises
  it as a diagnostic, asks the room to pause the match, and stops requesting recoveries. A loop of recoveries is a bug in
  the game's digest or its ordering, and hiding it behind an endless repair is worse than surfacing it.

### 4.7 Authenticated reconnect and seat binding

- **Seat binding.** The seat table lives in room state (`seats[seat].userId`). A join whose grant names an occupied seat
  is rejected (`SEAT_TAKEN`). Only the room assigns a seat, from the grant's claims; a client can never choose one.
- **Grant additions.** The v2 grant adds `seat` and `epoch` claims beside `sub`, `roomId`, `role`, `name`, `exp`, `jti`.
  A grant for the wrong epoch is rejected like a stale build.
- **Resume.** On a successful join the room issues `net.resume { epoch, seat, token }`. `token` is an HMAC over
  `{ roomId, epoch, seat, userId }` keyed by `grantSecret` (`OGM_WS_TOKEN_SECRET`, the key that already signs
  client-facing grants — the internal secret is shared with the API and must not gain a second, client-facing job), with
  a TTL of `playerReconnectSec`. Colyseus's `allowReconnection` already reserves the socket for the window; the token is
  what proves the **user** behind it, because a grant can live 600 s and a second device presenting a still-valid grant
  must not inherit a seat. A reconnecting client presents it; the room validates it, re-binds the session to the seat and
  sends the current tick. A token past its TTL, or for another user, is refused with `GRANT_INVALID`.
- **Rejoin state.** Gameplay state is not stored by the room. A reconnecting seat receives `net.recovery` from the
  arbiter(s) and continues from the current tick (§4.4 late start). The room holds only what it must: seats, teams,
  ready flags, the epoch and the tick.
- **Forfeit.** A v2 room gives every seat the same `playerReconnectSec = 30` window (down from v1's 60 for players
  and 120 for the owner, because the creator is no longer special). A seat past its window is forfeited, the room
  broadcasts `net.seat.forfeit`, re-elects a primary if the seat held it, and the manifest's `forfeit` policy decides
  what happens to that seat's state: `continue` freezes it, `skip` removes it from the round, `surrender` ends the match.

## 5. Per-seat views and visibility

### 5.1 Visibility classes

Every field a seat can see is in exactly one class, and the class decides whether it crosses the wire:

| Class | Who holds it | Enforcement |
| --- | --- | --- |
| **Shared** | Every seat, by determinism | Nothing to enforce; if it is shared it is public |
| **Owned-private** | One seat, in `capture({ seat })` | Filtered before encoding; never in another seat's `net.state` |
| **Derived-private** | One seat, drawn from `private(n)` | The seed never leaves that seat; the *result* travels as an event when the seat chooses to reveal it |
| **Never sent** | The seat itself (UI state, prompts, account data) | Not in the simulation at all |

`MultiplayerHooks.view(seat)` is the one declaration: it returns what that seat may receive, and the SDK encodes only
that. Its default — for a game that does not implement it — is `capture({ seat })` plus shared state, which is the
`per-seat` behaviour with no extra filtering.

### 5.2 Enforcement points

1. **Before encoding**, on the sending client: `encodeSeatState(seat, recipient)` runs `view(recipient)` and drops
   anything not in it. This is the only reliable point, because the service cannot see inside a payload.
2. **At the bridge**: `apps/web/src/net/bridge-forwarding.ts` continues to validate and size-cap every `net.*` envelope,
   so a game bug cannot put an unbounded or malformed private payload on the wire.
3. **In the checksum**: `digest()` excludes anything private, or the digest itself becomes the leak — two seats
   exchanging sums would confirm a guess about a hidden field. This is the subtle one; N5's tests must assert it.
4. **In the room**: routing only. A seat-targeted event goes to that seat; a team-targeted event goes to that team. The
   room never inspects payload contents to decide.

### 5.3 What cannot be hidden

Three limits are worth stating plainly, because a game design that ignores them will leak:

- **A shared seed reveals the future.** If every client holds `seed` and the same shuffle, every client can compute the
  next piece before the seat draws it. Hidden future draws need `private(n)` (§4.2), or a reveal-driven protocol where
  the draw happens on the seat and travels as an event.
- **Determinism leaks through timing.** A client that can recompute shared state can often infer a hidden choice from
  the *instant* an event arrives. This is a limit, not a bug to fix here; keep genuinely secret information out of the
  simulation.
- **The room is not a trust boundary for content.** It is a relay on the operator's machine; a malicious client can send
  anything to any seat it is routed to. Cheating between invited players is accepted (D-ROOMS); the platform's job is to
  not *hand* a seat information it should not have, not to police the peers.

## 6. Transport interface

### 6.1 Channels

A transport carries three channels with fixed delivery properties. Reliability is a property of the channel, not a
per-call argument, so a caller cannot accidentally put an input on a reliable ordered channel and head-of-line block the
whole match:

| Channel | Delivery | Rationale |
| --- | --- | --- |
| `input` | Unreliable, unordered, latest-per-tick wins | A late input is worthless; a retransmitted one is worse |
| `state` | Unreliable, drop-oldest | A newer snapshot already supersedes an old one |
| `event` | Reliable, ordered per sender | An event that is dropped is a rules violation; per-sender order is the game's semantics |

### 6.2 Interface

```ts
// apps/web/src/net/transport/types.ts
export type TransportKind = 'ws-relay' | 'webrtc';

export interface Transport {
  readonly kind: TransportKind;
  open(handlers: TransportHandlers): Promise<void>;
  send(channel: ChannelName, bytes: Uint8Array): void;
  stats(): TransportStats;
  close(reason: string): void;
}

export interface TransportHandlers {
  message(channel: ChannelName, bytes: Uint8Array): void;
  stats(stats: TransportStats): void;
  closed(reason: string): void;
}

export interface TransportStats {
  readonly kind: TransportKind;
  readonly rttMs: number;
  readonly jitterMs: number;
  readonly lossPct: number;
  readonly bytesOut: number;
  readonly bytesIn: number;
  readonly drops: number;
  readonly connectedMs: number;
}
```

### 6.3 The WebSocket relay baseline

`WsRelayTransport` wraps today's Colyseus room client and maps every channel onto room messages
(`net.inputs`, `net.state`, `net.event`). It is the default and the fallback. Nothing in §1.3 changes for it: the socket
stays in the host app, the game iframe still sees only the bridge.

### 6.4 WebRTC extension

`WsRelayTransport` measures the baseline; `WebRtcTransport` is attempted only when the baseline is bad (§6.5).

- **Signalling rides the room.** `net.signal { epoch, to, data }` carries an opaque SDP offer/answer or ICE candidate
  between two seats; the room routes it by seat and never parses it. No new service, no new public port.
- **Channels.** `input` → `RTCDataChannel` with `ordered: false, maxRetransmits: 0`. `event` → a second channel with
  `ordered: true`. `state` shares the `input` channel but is tagged so the receiver can drop-oldest.
- **Peer shape.** Seats connect to each other directly (a mesh); the relay stays up for `event` and as the fallback, so a
  failed connection degrades to §6.3 rather than disconnecting.
- **STUN/TURN.** Host-candidate-only works on one LAN. Across the internet a public STUN server is enough only when a
  direct path exists; a symmetric NAT needs a TURN relay. N4 measures first and recommends; this ticket provisions
  nothing and buys nothing. The candidate table N4 fills in:

  | Option | Cost | Credentials | Notes |
  | --- | --- | --- | --- |
  | Host candidates only | $0 | none | LAN play and same-network testing only |
  | Public STUN (e.g. a free public resolver) | $0 | none | No relay; still fails behind symmetric NAT |
  | Self-hosted coturn on the operator's node | $0 in money, one open UDP/TCP port | `turn` user + shared secret in `~/.config/ogm/env/` | Needs a publicly reachable address; the Funnel path is HTTP(S)-only, so this is an operator deployment decision |
  | Named provider (managed TURN) | per-GB, paid | provider key | Out of scope: spending is not authorised |

### 6.5 Selection and fallback

1. Start on `ws-relay`. Sample for `probeMs = 5 000`.
2. If `rttMs > 80` or `lossPct > 2` on the `input` channel, attempt `webrtc` between every pair while the relay keeps
   carrying traffic.
3. Promote a pair to WebRTC when its channel opens and its measured RTT is at least 30 % lower than the relay's. Demote
   on close, on a 5 s window above 2× the relay RTT, or on any `event` channel failure.
4. Never switch transports mid-epoch without a `net.transport` notice the other seats can see; a mid-match switch is a
   diagnostic event, not a silent change.

Selection lives in `apps/web/src/net/transport/select.ts` and is exercised by the verify harness with injected stats, not
by a real network (§12.3).

## 7. Rooms service changes

N3 implements this section. It stays inside the relay rule: the service gains routing, membership and time-keeping, and
no game logic.

### 7.1 Seats, teams, spectators

```ts
// room state additions (Colyseus schema, additive)
type SeatState = {
  seat: number;            // 0..maxPlayers-1
  userId: string;          // authenticated instance user; a seat can never be claimed by two users
  name: string;
  team: number;            // 0..3, assigned at join from the room's team policy
  connected: boolean;
  ready: boolean;
  forfeited: boolean;
  spectator: boolean;
};
```

- `maxPlayers` stays 4 by default with the 8 ceiling. Seats are assigned by the room: creator first, then lowest free.
- Teams are a room option (`teams: 'none' | 'alternate' | 'custom'`) with `alternate` assigning seat `n` to team
  `n % 2`. The v2 room state carries `seats[]`; the v1 `members` map stays for v1 rooms.
- `spectators: 'off'` is the default. With `'on'`, a spectator holds no seat, receives events targeted at `'all'` and
  nothing routed to a seat or a team, and cannot send inputs (`INPUT_FROM_SPECTATOR`).

### 7.2 Event routing

```ts
type NetEvent = {
  t: 'net.event';
  epoch: string;
  id: string;             // stable id per emitted event, minted by the sender
  seq: number;            // per-sender monotonic; the pair (id, seq) makes application idempotent
  from: number;           // seat, re-stamped by the room from the grant
  target: 'all' | 'team' | 'seat';
  to?: number;            // seat, when target is 'seat'
  team?: number;          // team, when target is 'team'
  round?: number;         // the round the event belongs to, when the game has rounds
  data: string;           // base64 payload, ≤ eventBytes
};
```

The room routes by `target` and drops a message whose `from`, `to` or `team` is inconsistent with the sender's seat. The
receiver applies an event at most once: `(from, id)` is the dedupe key, `seq` orders the sender's stream. A receiver that
sees `seq` jump requests the missed events through `net.recovery.request` with `scope: 'events'`; the sender replays from
its own ring (`eventHistory = 256` events). Ordering across senders is **not** guaranteed and must not be relied on — a
game that needs cross-seat order orders by `round` and by the event's own sequence field inside `data`.

### 7.3 Ready check and synchronised start

- Each seat publishes `net.ready { ready }`. The room broadcasts the seat table with readiness.
- The primary may send `net.start.request` when every occupied, connected seat is ready, or at any time when the room
  option `forceStart: 'primary'` is set.
- The room mints the epoch (`epoch = randomUUID()`), chooses `startAt = now + max(startLeadMs, 3 × worstRtt)` with
  `startLeadMs = 1 000`, elects the primary, and broadcasts `net.start` (§4.4) plus a per-seat copy carrying
  `privateSeed` when the mode uses it.
- A start inside an existing epoch is refused (`EPOCH_ACTIVE`); the room never runs two matches at once.

### 7.4 Disconnect, pause, rejoin, forfeit

| Event | Room does | Clients see |
| --- | --- | --- |
| A seat drops | Marks `connected: false`, starts `playerReconnectSec = 30`, broadcasts | `net.seat.offline`; the sim pauses for everyone when `pauseOnDisconnect: true` (the default) |
| A seat drops during the countdown | Cancels the start, returns the room to the ready check, keeps the epoch unset | `net.start.cancel`; no tick 0 exists yet, so nothing has to be rewound |
| Seat returns inside the window | Validates the resume token, re-binds the seat | `net.seat.online`, `net.recovery` for that seat, and the sim resumes at the current tick |
| Window expires | Marks `forfeited`, re-elects a primary if the seat held it, applies `forfeit` | `net.seat.forfeit` plus `net.primary` on re-election |
| The primary's seat is forfeited | Re-elects the lowest connected seat | `net.primary`. Shared-state arbitration moves; no new snapshot is needed |
| The creator leaves | Same as any seat (this replaces `end('host-left')` for v2 rooms) | `net.seat.offline` — the room no longer ends |
| Every seat forfeited | `ended { reason: 'abandoned' }` | The room disposes after `idleDisposeSec` |

`pauseOnDisconnect` defaults to `true` for the versus game; a co-op game sets it `false` and keeps simulating with the
missing seat frozen. Both are room options in v2; the v1 behaviour stays for v1 rooms, including `host-left`.

A match pause is not a client-side freeze: the room stops the epoch's clock and, on resume, broadcasts `net.resume` with
a `startAt` shifted by the paused duration. Every client therefore recomputes the same tick↔time mapping (§4.4) from one
value, and no seat has to guess how long the pause lasted. That is also why the tick, not a local timestamp, is the unit
of every deadline.

### 7.5 Pinning: build, branch and ruleset

The v1 pin is `(gameId, branchId, buildId)` and it stays. v2 adds `rulesetHash`: a hash over the game's simulation-relevant
manifest (`authority`, `maxSeats`, `inputDelayTicks`, `forfeit`, the action table and the design document's globals). Two
clients with the same `buildId` but different gameplay tuning cannot agree, so a join with a mismatched `rulesetHash` is
rejected with `RULESET_MISMATCH` — the same class of failure as `BUILD_MISMATCH`, but caught before a single tick runs.

### 7.6 What the room never gains

No simulation, no checksum comparison, no arbitration, no snapshot storage beyond routing, no per-game module loading, no
`eval`. A review of N3 should be able to see that in `game-room.ts` alone: the new handlers parse an envelope, check a
rate and a grant, and forward.

Editing is unchanged. `design.tx`, `presence`, `draft.load`, `draft.ready` and `kick` keep their v1 shapes and their
editor-only rule (the owner's session is still the editor while the phase is `editing`); v2 changes the gameplay and
membership paths, not the editor.

## 8. Diagnostics

### 8.1 Per-seat metrics

The SDK exposes `NetDiagnostics` per seat. Everything below is cheap to compute in the step or on receipt:

| Metric | Source | Meaning |
| --- | --- | --- |
| `buildId`, `rulesetHash` | Join | Version agreement between seats |
| `epoch`, `tick`, `mode` | Room | Which match and which tick the client is on |
| `rttMs`, `jitterMs`, `lossPct` | Transport stats | The path quality |
| `clockOffsetMs` | Min-RTT filter | Drift from the room's clock |
| `lateStartTicks` | Start | How far behind the epoch the client joined |
| `inputDelayTicks`, `inputGaps` | Input buffer | Buffer health |
| `localResponseMs` | Input timestamp → first step that applied it | What a player feels on their own seat |
| `remoteUpdateMs` | Received input timestamp → the step that applied it | What a player feels from others |
| `eventDelayMs` | Event `seq` send time → delivery | Event channel health |
| `desyncs` | Checksum mismatch count | Agreement failures |
| `recoveries`, `hardResyncs` | Recovery paths | How the client caught up |
| `droppedBytes`, `oversized` | Codec | Payload pressure |

`localResponseMs` and `remoteUpdateMs` are the two numbers #495 cares about. The targets the verify reports against:

| Metric | Target | Where it comes from |
| --- | --- | --- |
| `localResponseMs` | ≤ 16.7 ms (one step) | Owned state, no round trip |
| `remoteUpdateMs` | ≤ 100 ms p95 | `inputDelayTicks` (3) plus `renderDelayTicks` (3) |
| `eventDelayMs` | ≤ 150 ms p95 | Reliable channel plus one relay hop |
| `desyncs` | 0 after a 10 s settling window | Checksums at 2 Hz |

### 8.2 Where the overlay lives

The overlay is a **draft- and test-build surface only**, drawn by the host app over the game iframe, off by default and
never present in a published build. It adds no chrome to the creator screens: no new nav, no panel in the editor, no copy
change on the title town, games selection, creation or editor screens. Enabling it is a query parameter on the host app
URL in a draft build (`?net=1`) and a harness option for the verify scenario; both are non-product paths.

Logs are one JSON line per aggregate window (10 s) with the same field names, so a captured log and a captured overlay
can be read together.

### 8.3 Bad-network simulation

The verify harness gains a link simulator that wraps a transport and applies `latencyMs`, `jitterMs`, `lossPct`,
`reorderPct` and scheduled disconnects, driven by a seed so a failing run reproduces. It sits at the transport seam (§6.2),
which is why the seam exists: no browser throttling, no OS-level `tc`, no real network needed to prove the recovery paths.
The simulator is test-only code and is never imported by `apps/web` product entry points.

## 9. Contracts and message schemas

### 9.1 Protocol versioning

`PROTOCOL_VERSION` becomes `2`. Per the file header rule, v2 is added beside v1:

- `packages/contracts/src/room.ts` keeps every v1 schema untouched and gains a v2 section, or a sibling
  `packages/contracts/src/room.v2.ts` if v1 grows past its current size. One contract family per file still holds: room
  messages stay in the room file(s), net messages get their own `packages/contracts/src/net.ts`, appended to
  `src/index.ts`.
- The version is **per room**, not global. `GameRoomState.protocol` already exists as a schema field; a v1 room declares
  `1` and accepts `protocol: 1`, a v2 room declares `2` and accepts `protocol: 2`. A join whose `protocol` differs from
  the room's own is refused with `PROTOCOL_MISMATCH` — the existing rejection path, now with the comparison on both sides.
- The exported `PROTOCOL_VERSION` stays the *current* constant (`2`); code that needs the v1 value reads
  `PROTOCOL_VERSION_V1` so no v1 room is silently relabelled.
- The emitted JSON schemas gain `room.client-messages.v2` and `room.server-messages.v2` beside the v1 entries.

### 9.2 Client → room (v2 additions)

| `t` | Payload | Rate cap | Size cap | Notes |
| --- | --- | --- | --- | --- |
| `net.inputs` | `{ epoch, seat, firstTick, frames[] }` | 45/s | `inputBatchBytes` 512 | `seat` re-stamped from the grant |
| `net.state` | `{ epoch, seat, seq, tick, data }` | 10/s per seat | `seatStateBytes` 8 192 | Owned state for recipients, filtered by `view` |
| `net.event` | `{ epoch, id, seq, from, target, to?, team?, round?, data }` | 30/s | `eventBytes` 16 384 | Routed, never parsed |
| `net.checksum` | `{ epoch, scope, tick, sum }` | 4/s | 128 B | `scope: 'shared' \| 'seat'` |
| `net.recovery.request` | `{ epoch, scope, tick, seat? }` | 4/s | 128 B | `scope: 'shared' \| 'seat' \| 'events'`; routed to the arbiter |
| `net.recovery` | `{ epoch, scope, tick, seat?, snapshot?, events? }` | 4/s | `recoveryBytes` 65 536 | From the arbiter |
| `net.ready` | `{ ready }` | 5/s | 32 B | |
| `net.start.request` | `{ force?: boolean }` | 2/s | 32 B | Primary only |
| `net.signal` | `{ epoch, to, data }` | 20/s | 4 096 B | Opaque SDP/ICE, routed |
| `net.seat.request` | `{ seat }` | 2/s | 32 B | Honoured only for a free seat |

### 9.3 Room → client (v2 additions)

| `t` | Payload | Notes |
| --- | --- | --- |
| `welcome` (v2) | `{ you: { userId, seat, sessionId }, epoch?, state }` | Adds `seat`; `playerIndex` kept for v1 shape |
| `net.start` | §4.4 | Per-seat copy may carry `privateSeed` |
| `net.start.cancel` | `{ reason }` | A start abandoned before tick 0 (a seat dropped during the countdown) |
| `net.tick` | `{ epoch, serverTime, tick }` | 1 Hz heartbeat |
| `net.primary` | `{ epoch, seat }` | On election and re-election |
| `net.seats` | `{ epoch, seats: SeatState[] }` | On any membership change |
| `net.seat.online` / `net.seat.offline` / `net.seat.forfeit` | `{ epoch, seat }` | Membership transitions |
| `net.pause` / `net.resume` | `{ epoch, tick, startAt }` | Match pause; `resume` carries the shifted `startAt` (§7.4) |
| `net.inputs` / `net.state` / `net.event` | Relayed, sender's fields intact | Never reordered by the room |
| `net.recovery.request` / `net.recovery` | Relayed | Routed by scope or seat |
| `net.signal` | Relayed | Routed to `to` |
| `net.resume` | `{ epoch, seat, token }` | Issued on join and on reconnect |
| `net.transport` | `{ epoch, seat, kind }` | Diagnostic notice of a transport switch |

`ended` gains `reason: 'abandoned'` and keeps every v1 reason.

### 9.4 Limits

```ts
// packages/contracts/src/room.ts — v2 LIMITS additions
export const LIMITS_V2 = {
  ...LIMITS,
  inputBatchBytes: 512,
  inputPerSec: 45,
  seatStateBytes: 8192,
  seatStatePerSec: 10,
  recoveryBytes: 65536,
  recoveryPerSec: 4,
  checksumPerSec: 4,
  signalBytes: 4096,
  maxPlayersCeiling: 8,
  playerReconnectSec: 30,
} as const;
```

### 9.5 The `gm.net` API

One surface, three modes. Nothing below is mode-specific except `mode` and the helpers a mode needs.

```ts
// packages/sdk/src/net/index.ts
export interface GmNet {
  readonly mode: AuthorityMode;
  readonly role: 'host' | 'peer';       // 'host' iff this client holds the primary seat
  readonly localSeat: number;
  readonly seats: readonly NetSeat[];
  readonly epoch: string;
  readonly tick: number;
  readonly started: boolean;

  onSeats(cb: (seats: readonly NetSeat[]) => void): () => void;
  onStart(cb: (start: NetStart) => void): () => void;
  onInput(cb: (seat: number, frame: ActionFrame) => void): () => void;
  sendEvent(event: unknown, opts?: { target?: 'all' | 'team' | 'seat'; to?: number; round?: number }): void;
  onEvent(cb: (event: NetEventEnvelope) => void): () => void;

  /** Room-synchronised time: { serverMs, tick, offsetMs, rttMs, jitterMs }. */
  now(): NetTime;
  /** The authoritative frame for a seat at a tick, if it is known. */
  frameFor(seat: number, tick: number): ActionFrame | undefined;
  /** The seeded stream the caller asked for ('shared' or a seat number). */
  rng(stream: 'shared' | number): Rng;
  /** The canonical digest of the local simulation. */
  digest(): readonly number[];
}
```

`NetSeat` is v1's `NetPlayer` plus `seat`, `team`, `spectator`, `connected` and `ready`; `NetPlayer` stays as an alias so
v1 game code keeps type-checking. `NetEventEnvelope` is a delivered event: the routed header of §7.2 plus its decoded
`data`.

### 9.6 The game hooks

`MultiplayerHooks` (v2) is additive. The v1 four stay, so every existing template keeps compiling and running in `host`
mode. `Snapshot` is the same `{ tick: number; state: unknown }` the v1 `snapshot()` returns, so `capture` is a filter
over a value the game already produces.

```ts
export interface MultiplayerHooksV2 extends MultiplayerHooks {
  /** Owned slice for one seat, or the shared slice when `seat` is absent. */
  capture(scope: { seat?: number }): Snapshot;
  restore(snapshot: Snapshot): void;
  /** Canonical integer projection of what must agree between clients. */
  digest(): readonly number[];
  /** What `seat` may receive; called on the sending side only. */
  view?(seat: number): unknown;
}
```

A game that implements only `capture`/`restore`/`digest` gets per-seat authority with every seat's whole state visible.
`view` is what makes a seat's state private. A game that implements none of them stays on `host` mode and keeps today's
behaviour exactly.

### 9.7 Bridge envelopes

The game iframe never sees the room protocol; every v2 message crosses the bridge as one `net.*` envelope in
`packages/contracts/src/bridge.ts`, with the same `t` name and the room payload as its `payload`. The v1 pair
(`net.input`, `net.snapshot`) stays for host mode.

| Direction | `t` | Notes |
| --- | --- | --- |
| host → game | `net.mode`, `net.seats`, `net.primary`, `net.start`, `net.start.cancel`, `net.tick`, `net.seat`, `net.pause`, `net.resume`, `net.transport` | Room and membership facts the game cannot derive |
| host → game | `net.inputs`, `net.state`, `net.event`, `net.recovery`, `net.checksum` | Relayed or arbitrated traffic |
| game → host | `net.inputs`, `net.state`, `net.event`, `net.checksum`, `net.recovery.request`, `net.ready`, `net.start.request`, `net.signal` | Everything the game asks the room to carry |

`bridge-forwarding.ts` keeps doing what it does today — schema-check and size-cap each envelope before it crosses, and
refuse a payload over the channel's limit with one warning — so §9.4's limits are enforced on both sides of the iframe
boundary, not only at the room.

### 9.8 File layout

| Layer | File | Owner ticket |
| --- | --- | --- |
| Room + net contracts, v2 | `packages/contracts/src/net.ts`, v2 block in `room.ts`, appended to `index.ts` | N1 (shape), N2/N3 (final) |
| SDK foundations | `packages/sdk/src/net/foundations/{clock,inputs,checksum,recovery}.ts` | N2 |
| SDK modes | `packages/sdk/src/net/modes/{per-seat,host,rollback}.ts` | N2 (per-seat), extension points after |
| SDK visibility | `packages/sdk/src/net/visibility.ts` | N5 |
| Room | `services/rooms/src/{seats,epoch,routing}.ts`, `game-room.ts` | N3 |
| Bridge | `apps/web/src/net/bridge-forwarding.ts` | N3 (with the contract) |
| Transport | `apps/web/src/net/transport/` | N4 |
| Diagnostics | `apps/web/src/net/diagnostics/`, `packages/sdk/src/net/diagnostics.ts` | N6 |
| Verify | `packages/gm-verify/scenarios/multi-client/` (replaces `two-client/` when N6 lands) | N6 |

## 10. Ticket-level design

Each section is the contract its ticket implements. Exact test scenarios and expected values belong to the research
spikes (#501–#505); the acceptance below is what the Executor checks.

### 10.1 N2 — SDK: per-seat authority in `gm.net` (#496)

**Goal.** Every seat simulates its own state with no round trip, reconstructs other seats from tick-stamped inputs plus
recovery snapshots, and agrees through checksums.

**Units.** Foundations (§4.1–§4.6) behind the controller; `modes/per-seat.ts`; the `capture`/`restore`/`digest` hooks;
`net.inputs`, `net.state`, `net.checksum`, `net.recovery*` encode/decode; `net.start` handling with a synchronised
clock.

**Tests.** A two-seat loopback harness in one process with an injected link (latency, jitter, loss): (a) both seats agree
on `digest()` at every 30th tick with a clean link; (b) with 5 % loss for 10 s, no `inputGaps` beyond one tick and both
seats agree again within 500 ms of the loss ending; (c) a seat's own input is applied in the same tick it is read
(`localResponseMs` ≤ one step); (d) a recovery snapshot restores an artificially corrupted seat and the digests match
afterwards; (e) a golden checksum fixture over 600 ticks.

**Acceptance.** `pnpm --filter @gm/sdk test` green; the two-seat harness runs in under 5 s with no network; the
`gm-multiplayer-ready` rules in `skills/gm-multiplayer-ready/SKILL.md` are rewritten for per-seat authority, and the
template `templates/game-multiplayer` implements `digest()`.

### 10.2 N3 — Rooms: four seats, teams, routing, start, rejoin (#497)

**Goal.** The room serves §§7 and the v2 transport of §9.2/§9.3 while staying relay-only.

**Units.** Seat/team state; `net.start` minting (epoch, `startAt`, primary election); routing for events, recovery and
signals; ready check; the disconnect → pause → rejoin → forfeit table; the resume token; `rulesetHash`; v1 compatibility.

**Tests.** Room-level, with `@colyseus/testing` and shortened `RoomTimings` (the option `GameRoom` already takes):
a four-seat room assigns seats and teams; a seat-targeted event reaches one seat and a team-targeted one reaches two; a
duplicated `net.event` is applied once; a seat dropped for less than `playerReconnectSec` rejoins with its seat intact and
a seat dropped past it is forfeited with the primary re-elected; the creator's departure no longer ends a v2 room; a v1
client still joins a v1 room and still gets `host-left`; a `rulesetHash` mismatch is rejected.

**Acceptance.** `pnpm --filter @ogm/rooms test` green; no new code path in `game-room.ts` inspects a payload's contents
(a review checklist item, asserted by a test that sends a payload with a game-shaped object and observes it relayed
unchanged); `services/rooms/README.md` updated.

### 10.3 N4 — Transport: measure, then WebRTC with a relay fallback (#498)

**Goal.** A seam with a measured baseline and an optional direct path.

**Units.** `Transport` + `WsRelayTransport`; `WebRtcTransport` behind a capability check; `net.signal` routing (N3
provides it); the selection policy; the stats pipeline that feeds diagnostics.

**Tests.** With injected stats: the selector stays on the relay below threshold, promotes above it, and demotes on a
5 s regression; the WS transport maps channels to the right messages; the WebRTC transport is not constructed when
`RTCPeerConnection` is absent; a failed ICE falls back without losing an `event`.

**Acceptance.** `pnpm --filter @ogm/web test` green; the measurements (RTT, input-to-remote-display, event delivery, on
the relay, two and four devices) are recorded in the PR with the method and the numbers; the STUN/TURN recommendation
table is filled with costs and the credentials an operator would create — nothing bought or provisioned.

### 10.4 N5 — Per-seat views and visibility (#500)

**Goal.** Each client renders its own layout, camera and HUD, and the SDK never sends a seat what it may not have.

**Units.** `view(seat)`; `encodeSeatState`; the `private(n)` stream; `digest()` exclusion of private fields; the HUD and
camera path that follows `localSeat` per client.

**Tests.** A canary: a private field set on seat 1 never appears in any payload seat 2 receives over a 30 s run
(asserted on encoded bytes, not on rendered output); a `private(n)` draw is not reproducible from the shared seed; two
seats' digests agree while their private fields differ; a hidden field changing does not change `digest()`.

**Acceptance.** `pnpm --filter @gm/sdk test` green; the canary test fails if `view` is removed (the guard requirement);
the limits of §5.3 are documented in `skills/gm-multiplayer-ready/SKILL.md`.

### 10.5 N6 — Diagnostics and a bad-network verify (#499)

**Goal.** Per-seat metrics visible in a draft/test overlay and in logs, and a four-client verify that exercises latency,
jitter, loss and disconnects.

**Units.** The metric table of §8.1; the overlay in the host app behind `?net=1` and the harness option; the link
simulator; the four-client scenario (replacing the two-client one, keeping its seven assertions).

**Tests.** The simulator is deterministic given a seed (same seed → same frame-by-frame loss pattern); each metric in
§8.1 is populated in a scripted run; the four-client scenario passes on a clean link and passes with
`latency 80 ms, jitter 20 ms, loss 2 %, two disconnects` with visible `recoveries` and no `desyncs` left unresolved;
the report names what it could not check (WAN, a real phone).

**Acceptance.** `pnpm --filter @ogm/gm-verify test` green; the report shape stays compatible with the acceptance record's
check 16 fields; the overlay appears in no published build (a test asserts the flag is inert outside draft/test).

### 10.6 Order

```
N1 (this) ──► N2 ──► N3 ──► N5
                └──► N4
                └──► N6 (also needs N3)
```

N2 and N3 can be built in parallel once the §9 contracts are merged, because the contract file is the shared surface and
the room's routing tests use recorded v2 envelopes rather than a live SDK. N4 and N6 depend on N2's transport seam and
diagnostic fields. N5 depends on N2 only. Landing order for review: N2, N3, N4, N5, N6 — each PR carries its own
contract additions where §9 marks them "N2/N3 (final)".

## 11. Compatibility and migration

### 11.1 Games

A game declaring nothing keeps `authority: 'host'` and every existing code path. Nothing in `packages/sdk/src/net/`
changes for it. A game that declares `per-seat` must supply `capture`/`restore`/`digest` or its join is refused with
`MODE_MISMATCH` — a loud failure, because a silent downgrade would ship a game whose feel depends on which client is
seated first.

### 11.2 Rooms and the verify harness

- v1 rooms keep `members`, `phase: pausedForHost`, `host-left` and the two-client verify untouched.
- v2 rooms replace those behaviours with §7. `packages/gm-verify/scenarios/two-client` keeps running against a v2 room
  until N6 replaces it, which means the v1 scenarios must be pinned to a v1 room option during the transition. N3 owns
  that pin.
- `apps/web/src/net/room-store.ts` gains `seats`, `epoch`, `primarySeat` beside the existing fields; `role` keeps its
  meaning (§3.4).

### 11.3 Protocol

| Client | Room | Result |
| --- | --- | --- |
| v1 | v1 | Today's behaviour, unchanged |
| v2 | v1 | `PROTOCOL_MISMATCH`; the client shows its join rejection |
| v1 | v2 | `PROTOCOL_MISMATCH` |
| v2 | v2 | §3–§9 |

There is no shim and no dual-stack negotiation: the version is one integer and the join already rejects a mismatch.

### 11.4 Documents and skills that change with N2–N6

Not this PR — each ticket updates these with its own change, and this list is the checklist:

- `skills/gm-multiplayer-ready/SKILL.md`: rules 5 and 8 and "What the SDK gives you" describe host authority; they must
  describe per-seat authority and the hooks of §9.6 (N2), and the visibility limits (N5).
- `services/rooms/README.md`: seats, teams, routing, epochs (N3).
- `packages/sdk/README.md` if the net section is described there: the mode declaration (N2).
- `docs/spec/game-maker-2000-spec.md`: the multiplayer section's "host-authoritative" statement, once per-seat is the
  default for new games (N5).
- The `gm-verify` skill's two-client section, when N6 renames the scenario.

## 12. Test strategy

### 12.1 Fast deterministic harness

The unit of testing for N2 is a **loopback match**: two (or four) controller instances in one Node process, connected by
an in-memory link with configurable latency, jitter, loss and reordering, driven by an explicit clock. No browser, no
socket, no timers. A full 600-tick match is milliseconds, so a scenario that would be flaky over a real network is exact
and repeatable. Loss patterns come from a seeded generator, so a failing run is reproducible from its seed.

### 12.2 Golden fixtures

A scenario script produces a sequence of `(tick, digest)` pairs. The fixtures are committed next to the tests:
`packages/sdk/src/net/test/fixtures/golden/<scenario>.json`. A digest change is then a deliberate, reviewable diff
instead of a silent tuning change. A golden must include at least one scenario with a mid-match recovery, so the fixture
covers the recovery path and not only the happy one.

### 12.3 Browser and verify

Browser runs stay where they are today: `packages/sdk`, `apps/web`, `packages/gm-verify` and
`templates/game-multiplayer` declare `test:browser` and CI runs them on Chromium. The multi-client verify (N6) is the
only place a real socket is used, and it runs against a local rooms service on `127.0.0.1`, never a public host.

### 12.4 What each ticket must prove

Every new test in N2–N6 must fail without its production change. The two that need care: the visibility canary (fails if
`view` is removed) and the checksum exclusion test (fails if a private field enters `digest()`), because both pass
trivially when the feature is absent. N5's tests assert on encoded bytes, not on rendered output, for that reason.

## 13. Risks and open questions

| Risk or question | Impact | Default taken here | Resolved by |
| --- | --- | --- | --- |
| Cross-engine float divergence breaks checksums | Recoveries that never converge | `digest()` is integers only; quantise at the state boundary | N2, measured on Chrome and Safari |
| Input traffic grows with seats | 4 seats × ~30 input packets/s × ~350 B ≈ 42 KB/s on the relay | 30 Hz send with 3-tick redundancy; per-seat rate caps | N3, measured in the four-client verify |
| Primary re-election during a checksum exchange | Two arbiters in one tick | Arbitration is fenced by `epoch` + announced primary; a request for a stale primary is dropped | N3 |
| `net.state` at 10 Hz may be too slow for fast games | Visible rubber-banding on remote seats | Interpolation on the receiver; the rate is a manifest field | N2, tuned by the versus game |
| A TURN relay across the internet needs a public port | WebRTC is LAN-only without an operator decision | Relay-only default; no provisioning | N4 recommendation, operator decision |
| Four seats on one machine stress the room | Session caps and rate limits trip | 60/s per type per session already covers it; the verify proves it | N6 |
| Spectators could see a seat's private state | Leak to a non-player | Spectators receive only `target: 'all'` events and never `net.state` | N3, asserted in a test |
| `pauseOnDisconnect` default in a co-op game | A shared world stalls on one phone's tunnel | `true` for versus, a room option for co-op | N3 |

Open questions with a recommended answer, to be confirmed by the research spikes rather than blocking this design:

1. **Should `net.state` carry a per-recipient filtered copy from one send?** Recommended: one encode per recipient, up
   to four per send, because filtering must happen before encoding — and 8 KiB × 3 recipients × 10 Hz is well inside the
   room's caps.
2. **Is `inputDelayTicks = 3` the right default for a puzzle game?** Recommended: yes for a versus puzzler (50 ms of
   buffering, imperceptible for a turn-like action game), and a manifest field so a twitch game can lower it.
3. **Should the room relay `net.signal` before N4 exists?** Recommended: yes in N3, as an opaque routed message, so N4
   needs no room change at all.

## 14. Decision log

| ID | Decision | Why |
| --- | --- | --- |
| D-NET-1 | Authority is a manifest declaration plus a room option; mismatch is rejected | A silent downgrade makes a game's feel depend on the client |
| D-NET-2 | Per-seat authority is the target; host and rollback are specified extension points | The versus game needs instant local input; the co-op game may need something else later |
| D-NET-3 | No server-authoritative mode, ever | No game code on the server; the relay is the architecture |
| D-NET-4 | One seat is the primary and arbitrates shared state; the room elects it | Someone must win an argument; the service already knows who is connected and still runs no game code |
| D-NET-5 | Determinism covers a quantised integer projection, not the whole world | Cosmetics must never trigger a recovery |
| D-NET-6 | Checksums at 2 Hz; recovery snapshots capped at 4/s and 64 KiB | Bounded cost, and the mismatch is caught inside half a second |
| D-NET-7 | Inputs are stamped, delayed by 3 ticks and repeated 3 times | One rule that absorbs jitter, loss and reordering without a rollback engine |
| D-NET-8 | The room is the clock reference; ticks are derived from `startAt` | One shared node, one mapping, and a countdown that cannot drift from tick 0 |
| D-NET-9 | Visibility is enforced before encoding on the sender; the checksum excludes private fields | The service cannot filter what it cannot see, and a checksum is an oracle |
| D-NET-10 | Hidden future draws need a per-seat private seed, not a shared one | A shared seed is public by construction |
| D-NET-11 | Transport is a channel-typed seam in the host app, WebRTC optional, relay always available | Measure first; never trade a working path for an unproven one |
| D-NET-12 | Protocol 2 is additive beside version 1; v1 rooms and games keep their behaviour | The shipped V1 games and the acceptance record depend on it |
| D-NET-13 | The creator is no longer special: the creator's departure follows the forfeit policy (v2) | #497 requires it; the primary election already covers shared-state arbitration |
| D-NET-14 | Diagnostics live in draft/test builds and the harness only | A debug overlay is not product chrome, and the design's screens stay as they are |
