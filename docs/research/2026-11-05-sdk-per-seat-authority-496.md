# SDK per-seat authority in `gm.net` — research spike for #496 (N2)

- **Source requirement:** #501, research spike for #496 "SDK: per-seat authority mode in `gm.net`", which implements N2 of the
  netcode platform design (#495).
- **Consumed design:** `docs/plans/netcode-platform.md` — §3.2 (per-seat authority), §3.3 (state ownership classes), §3.4
  (primary seat), §4.1–§4.7 (shared foundations), §8.1 (metrics), §9 (contracts), §10.1 (N2's contract), §12 (test
  strategy), §13 (risks).
- **Repository evidence:** `main` at `a6d7dcf4` (merge of #516). Every `[C]` claim below names the file and line it was
  read from at that commit.
- **Deliverable:** this document. No code ships in #501; #496 is rewritten from it.
- **Evidence labels:** **[C]** read in the code at the commit above; **[D]** decision taken here, with its reason;
  **[Q]** open question carried with a recommended default; **[X]** not verified in this workspace (no Node toolchain —
  see §8).

## 1. Outcome

`gm.net` gains a second authority mode. A game declares `net.authority: 'per-seat'` in its manifest and supplies three
hooks (`capture`, `restore`, `digest`). In that mode every client runs the whole simulation at the existing fixed 1/60 s
step, applies its own seat's input in the same tick it is sampled (no round trip), reconstructs the other seats from
tick-stamped redundant input windows, publishes its own seat's owned state to the others at `seatStateHz`, and proves
agreement with a 2 Hz shared checksum that any mismatch resolves through a recovery snapshot from the arbiter.

The same PR delivers the six mode-independent foundations of design §4.1–§4.6 that the rest of the family composes: the deterministic step
contract (checked, not remembered), seeded streams, tick-stamped redundant inputs, clock sync and synchronised start,
jitter buffers, checksums and recovery snapshots, and per-seat diagnostics counters.

**N2 is SDK-only.** It changes no room code, no host-app routing, no transport, no visibility filtering and no product
screen. Its proof is a two-seat loopback harness in one Node process with an injected link (§6), which needs no socket,
no browser and no timers.

**Out of scope, explicitly:**

| Item | Owner |
| --- | --- |
| `view(seat)` filtering, `private(n)` streams on the wire, the visibility canary | #500 (N5) |
| Room seat table, routing, `net.start` minting, resume tokens, `rulesetHash` | #497 (N3) |
| `bridge-forwarding.ts` routing of the v2 envelopes | #497 (N3) |
| Transport seam, WebRTC, link selection | #498 (N4) |
| Overlay, four-client verify, bad-network harness | #499 (N6) |
| Rollback and host-with-prediction modes | after N2, as §3.5/§3.6 extension points |

## 2. What exists today, and why per-seat cannot ride on it

Four facts decide the whole shape of N2. Each is a hard gate in today's code.

1. **A peer does not simulate at all.** `packages/sdk/src/core/runtime.ts:95` returns from the step listener when
   `netController.role === 'peer'`; the peer only forwards its input and renders snapshots. [C] Per-seat mode requires
   every seat to run the step, so this branch must become mode-dependent — it is the single most load-bearing change in
   N2, and the one with the most regression risk for shipping V1 games.
2. **The peer's input path is a one-shot send with no tick ring.** `net/peer.ts:49-60` encodes the local frame with a
   monotonic `seq` and sends one frame per step; there is no redundancy, no history and no dedupe. [C] §4.3 needs a
   3-tick window at 30 Hz, a 120-tick ring per seat and a gap counter.
3. **The host's authority is expressed as a role check, not a mode.** `net/host.ts:28` and `:41` gate on
   `role() === 'host'` and send a snapshot every third tick (`tick % 3 !== 0`). [C] A per-seat client can be `'host'` or
   `'peer'` — the design keeps those values (§3.4) — so every new behaviour must gate on `mode`, never on `role`.
4. **There is no checksum, no digest and no recovery anything.** `MultiplayerHooks` is exactly `spawn`, `despawn`,
   `snapshot`, `applySnapshot`, `hud` (`packages/contracts/src/game.ts:201-211`). [C] Nothing compares two clients'
   state, and `net/snapshotBytes` is 64 KiB (`net/codec.ts`) with no recovery path at all.

Two smaller facts matter for the implementation units: the clock already has the primitives a start gate needs
(`FixedClock.reset(tick)`, `pause()`, `resume()` — `core/clock.ts:57-83`) and the RNG is already 32-bit and
snapshotable (`core/rng.ts`). [C] Neither needs new machinery.

## 3. Design

### 3.1 Mode selection and the one seam every behaviour gates on

`manifest.net` is a new optional manifest field. Absent means `'host'`, which keeps today's code path byte-for-byte
(the V1 templates and both shipped games must not change behaviour). A new resolver decides once, at controller
construction:

```ts
// packages/sdk/src/net/mode.ts
export function resolveAuthorityMode(manifest: GameManifest): AuthorityMode {
  return manifest.net?.authority ?? 'host';
}
```

- `'host'` → the existing `HostChannel` + `PeerChannel` wiring in `net/index.ts` runs unchanged.
- `'per-seat'` → `PerSeatMode` owns the step, the input rings, the state publishing, the checksum and the recovery.
- `'rollback'` → valid in the manifest vocabulary, refused at construction with `ModeMismatchError` until its ticket
  exists. Refusing beats silently running host mode; §11.1 of the design makes the same argument for join rejection.

`GmNet.mode` is the public gate. `role` keeps its v1 meaning (`'host'` for the primary seat, `'peer'` for any other
seat), so V1 code paths keep compiling and a v1 game keeps the meaning it had. **[D-N2-1]** New behaviour gates on
`mode`; `role` is never used as a proxy for authority again.

`MODE_MISMATCH` is raised when a manifest declares `per-seat` and the instance's `net` hooks do not implement
`capture`, `restore` and `digest`. The controller throws `ModeMismatchError` (code `MODE_MISMATCH`) from
`createNetController`, which surfaces through `boot`'s existing `error` envelope (`core/boot.ts:166-168`), and N3 mirrors
it as a join rejection. **[D-N2-2]** A silent downgrade to host mode is forbidden: it would ship a game whose feel
depends on which client seated first.

### 3.2 The step, in order

One fixed step in per-seat mode, in this exact order:

1. **Drain.** Frames handed to the runtime from the host (`acceptHostFrame`) and local input frames sampled by
   `InputMerger` are in `frames` for tick `t` (unchanged from today, `runtime.ts:86-92`).
2. **Collect remote.** `PerSeatMode.beforeStep(t, frames)` appends one decoded `ActionFrame` per remote seat for tick
   `t` — the frame stamped `t` if the ring has it, otherwise the seat's last known frame (a *repeat*, which increments
   `inputGaps`).
3. **Send.** On even ticks (30 Hz) the mode sends `net.inputs` carrying the local seat's frames for `t`, `t-1`, `t-2`.
4. **Step.** The game's step runs once over all frames via `host.dispatchInput(frames)` and the `onStep` listeners. The
   local seat's frame is in `frames` in this same step — that is what makes `localResponseMs` one step at most.
5. **Publish.** Every `60 / seatStateHz` ticks (6 ticks at the default 10 Hz) the mode sends `net.state` carrying
   `capture({ seat: localSeat })`.
6. **Checksum.** Every 30 ticks the mode sends `net.checksum` with `fold(digest())` for scope `'shared'`, and compares
   every shared sum it receives for the same tick.

`NetController.stepLocally` is a getter: `true` for host mode's host and for every per-seat client; `false` only for a
host-mode peer. The runtime's early return becomes `if (!controller.stepLocally) return;`. **[D-N2-3]** This one boolean
is the entire difference between "peer renders" and "peer simulates"; every other step difference is inside the mode.

### 3.3 Input: windows, rings, delays, gaps

- **Send:** 30 Hz, covering the last three ticks (`redundancy = 3`). Three frames per packet survives two consecutive
  lost packets without a gap; §4.3 of the design fixes the numbers and they are not retuned here.
- **Ring:** per seat, `inputHistoryTicks = 120` (2 s) keyed by tick, first write wins. A retransmitted frame is
  identical by construction, so a duplicate is ignored rather than merged.
- **Deadline:** tick `t` is simulated when every connected seat's frame for `t` has arrived, or when
  `serverMs(t) + inputDelayTicks × STEP_MS` has passed. `inputDelayTicks` starts at the manifest value (default 3 =
  50.0 ms) and may only grow inside an epoch, clamped to 2..8.
- **Gap:** a missing tick at its deadline repeats the seat's last frame and increments `inputGaps` (per seat). A gap
  longer than `resyncAfterGapTicks = 30` (500 ms) requests a recovery snapshot for that seat instead of extrapolating.
- **Late frame:** a frame that arrives after its tick was already simulated is stored in the ring, counted as
  `lateInputs`, and **not** re-simulated. The owner's next `net.state` supersedes the reconstruction anyway (§3.2 of
  the design: "a published owned state supersedes a reconstruction whenever the two differ"). **[D-N2-4]** No replay in
  per-seat mode. Replay is the rollback engine's job; duplicating a cheap version of it here would create a second,
  untested simulation path for the one mode that does not need it.

### 3.4 Clock, start gate and drift

- **Sampling:** reuse the existing `ping { c }` / `pong { c, s }`. Eight samples over ~2 s from join, then one every 5 s.
  Keep the sample with the **lowest RTT**; `offsetMs = s - (c + rtt / 2)`. **[D-N2-5]** Minimum-RTT filter, because
  the fastest round trip carries the least queueing asymmetry — the same reason NTP does it.
- **Mapping:** within an epoch, tick `t` runs at `startAt + t × 1000 / 60`. The local clock never decides when a tick
  is; it only decides when to *ask*.
- **Start gate:** on `net.start` the mode calls `resetClock(0)`, `pauseClock()`, arms `startAt`, and releases with
  `resumeClock()` on the first evaluation where `nowMs + offsetMs >= startAt`. The countdown a game draws is derived
  from the same mapping, so the "3, 2, 1" and tick 0 cannot drift apart.
- **The gate needs its own evaluation point, and this is a trap.** While the clock is paused, `FixedClock.advance`
  returns 0 steps, and `RuntimeImpl.advance` only calls `render()` when `steps > 0` (`core/runtime.ts:189-193`) — so a
  gate that is only checked in `render()` or `beforeStep` never releases in a headless run. The controller therefore
  exposes `gate(nowMs)`, and `RuntimeImpl.advance` calls it **before** `clock.advance(ms)`
  (it is also called at the top of `render()`). **[D-N2-12]**
- **Late start:** `net.start` with `startAt` in the past plus a recovery snapshot at the current tick restores and
  `resetClock(currentTick)`. It never fast-forwards by simulating missed ticks; `lateStartTicks` records the distance.
- **Drift:** `net.tick` arrives at 1 Hz. When `|clock.tick - roomTick| > maxDriftTicks = 6` (100 ms) the mode calls
  `resetClock(roomTick)` and increments `clockResyncs`. A tick is never simulated twice, so the correction is a skipped
  or held step.

Two new controller callbacks make the gate testable without a browser: `pauseClock()`, `resumeClock()`,
`resetClock(tick)`. `boot` wires them to `runtime.clock.pause/resume/reset`, and the loopback harness wires them to its
virtual clock.

### 3.5 Owned vs shared, publish and reconcile

Per §3.3 of the design, a game declares the boundary once through `capture`:

| Class | Hook call | Travels |
| --- | --- | --- |
| Owned by seat `n` | `capture({ seat: n })` | `net.state` from seat `n` to every other seat, at `seatStateHz` |
| Shared | `capture({})` | Never in steady state; verified by `digest()` + `net.checksum` |
| Cosmetic | nowhere | Never sent, never checksummed |

Reconciliation on receipt of `net.state` from seat `n`, in canonical seat order:

1. If the payload's `tick` is older than the last one accepted from that seat, drop it and count `outOfOrderSnapshots`.
2. Otherwise `restore(slice)`. For slices whose `state` has the interpolatable `entities[id].p/r` shape that
   `peer.ts` already understands, blend from the reconstructed value to the owner's value over `correctionMs = 120` by
   calling `restore` once per render frame with `interpolateState(previous, next, amount)`; anything else snaps.

**[D-N2-6]** `restore` must apply exactly the slice it is given, and a per-seat slice replaces only that seat's owned
fields. That is the contract that lets the SDK restore three remote seats and the local one independently, and it is
what the template's `applySnapshotState` already does by merging `entities` (`templates/game-multiplayer/src/state.ts`).
[C]

### 3.6 Checksums, recovery and the breaker

- **Digest → sum.** `hooks.digest()` returns a flat array of integers in canonical order (seats ascending, entity ids
  sorted by code unit, quantised). The SDK folds it with FNV-1a 32-bit: basis `0x811c9dc5`, prime `0x01000193`, each
  word's bytes taken little-endian. §6 T6 gives exact vectors; they are the unit test.
- **Cadence.** `net.checksum { epoch, scope, tick, sum }` every `checksumEveryTicks = 30` (500 ms) for `'shared'`.
  Owned sums ride inside `net.state` and are compared by recipients as a diagnostic only.
- **Mismatch.** A client that disagrees sends `net.recovery.request { epoch, scope, tick }`. The room routes it to the
  arbiter: the primary for `'shared'` (§3.4 of the design), the seat's owner for a `'seat'` scope, the sender for
  `'events'`. The arbiter answers `net.recovery` with a snapshot (state scopes) or an event list.
- **Apply.** Restore, then replay the local buffer from `tick` when the gap is ≤ `maxReplayTicks = 120`; otherwise
  continue at the snapshot tick and count `hardResync`.
- **Caps.** `recoveryBytes = 65 536`, `recoveryPerSec = 4`, coalesced per scope (the oldest outstanding request wins).
- **Breaker.** `maxResyncs = 3` hard resyncs inside 60 s marks the seat `desynced`: it records a diagnostic, asks the
  room to pause, and stops requesting recoveries. **[D-N2-7]** The breaker is in N2, not N6, because a recovery loop is
  a game-bug amplifier: without it a wrong `digest()` turns into an unbounded traffic loop the moment two seats disagree.

### 3.7 Determinism, made checkable

`packages/sdk/src/test/no-random.test.ts:19` scans `core`, `fx`, `nav`, `proc`, `test`, `three` for `Math.random` and
`Date.now`. [C] N2 adds `'net'` to that list. The harness and the mode must therefore take time and randomness from
injected sources only — which the loopback design needs anyway.

Two helpers enforce the remaining rules rather than documenting them:

```ts
// packages/sdk/src/net/foundations/checksum.ts
export function toUnits(value: number, scale = 256): number;   // Math.round(value * scale) | 0, -0 normalised
export function fold(words: readonly number[]): number;        // FNV-1a 32, little-endian words
export function sameWords(left: readonly number[], right: readonly number[]): boolean;
```

**[D-N2-8]** `scale = 256` (1/256 of a unit) is the SDK default because it is exact in binary floating point, is finer
than any visible position at typical camera scales, and keeps a 3-decimal display honest. A game that needs finer
precision passes its own scale; what it may not do is put an unquantised transcendental result in `digest()`.

### 3.8 Seeded streams

`net.rng('shared')` and `net.rng(seat)` return the same `Rng` interface the runtime exposes (`core/rng.ts`), seeded from
`start.seed` and `hash32(start.seed, seat)` respectively, created idempotently per epoch. `'private'` per-seat seeds
arrive in the per-seat copy of `net.start` (§4.2 of the design) and are stored, but nothing in N2 reads them: the
filtering and reveal rules are N5's. **[D-N2-9]** N2 ships the stream factory without the visibility semantics so that a
game written before N5 does not get a stream whose secrecy it cannot yet rely on.

## 4. Interfaces

Exact declarations, so #496 can be implemented without inventing shapes. All of these are additive; nothing in the v1
surface changes.

### 4.1 `packages/contracts/src/net.ts` (new file, one contract family)

```ts
export const NET_LIMITS = {
  inputBatchBytes: 512,
  inputPerSec: 45,
  seatStateBytes: 8_192,
  seatStatePerSec: 10,
  recoveryBytes: 65_536,
  recoveryPerSec: 4,
  checksumBytes: 128,
  checksumPerSec: 4,
  signalBytes: 4_096,
} as const;

export const AUTHORITY_MODES = ['per-seat', 'host', 'rollback'] as const;
export type AuthorityMode = (typeof AUTHORITY_MODES)[number];

export const netManifestSchema = z.strictObject({
  authority: z.enum(AUTHORITY_MODES).optional(),      // absent means 'host'
  maxSeats: z.number().int().min(1).max(8),
  inputDelayTicks: z.number().int().min(2).max(8).optional(),   // default 3
  seatStateHz: z.number().int().min(1).max(30).optional(),      // default 10
  spectators: z.enum(['off', 'on']).optional(),                 // default 'off'
  forfeit: z.enum(['continue', 'skip', 'surrender']).optional(),// default 'continue'
});

export type NetSeat = {
  seat: number; userId: string; name: string; team: number;
  connected: boolean; ready: boolean; forfeited: boolean; spectator: boolean;
};

export type NetTime = { serverMs: number; tick: number; offsetMs: number; rttMs: number; jitterMs: number };

export type NetInputs = { t: 'net.inputs'; epoch: string; seat: number; firstTick: number; frames: InputFrame[] };
export type NetStateMessage = {
  t: 'net.state'; epoch: string; seat: number; seq: number; tick: number; to?: number; data: string;
};
export type NetChecksumMessage = { t: 'net.checksum'; epoch: string; scope: 'shared' | 'seat'; tick: number; sum: number };
export type NetRecoveryRequest = { t: 'net.recovery.request'; epoch: string; scope: 'shared' | 'seat' | 'events'; tick: number; seat?: number };
export type NetRecoveryMessage = {
  t: 'net.recovery'; epoch: string; scope: 'shared' | 'seat' | 'events'; tick: number; seat?: number;
  snapshot?: string; events?: string[];
};

export const netSchemas = {
  'net.messages.v2': z.array(z.union([/* client→room and room→client, as §9.2/§9.3 of the design */])),
  'net.seat.v2': /* NetSeat */,
  'net.start.v2': /* NetStart */,
} satisfies Record<string, z.ZodType>;
```

The commented entries are shape, not final code: each record value is the zod schema for that stem, and every stem
emits `schemas/<stem>.json` (§4.1's chores below).

`InputFrame` is `room.ts`'s strict `{ seq, tick, axes, buttons }` (`packages/contracts/src/room.ts:121-130`), reused
rather than redefined. [C]

Three contract chores come with a new family in this repo, and each one fails `pnpm --filter @ogm/contracts check` if
skipped:

1. append `export * from './net.js';` to **both** `packages/contracts/src/index.ts` and
   `packages/contracts/src/browser.ts` (the web app imports `@ogm/contracts/browser`);
2. run `pnpm --filter @ogm/contracts emit` and commit the regenerated `schemas/net.*.json`
   (`scripts/emit-schemas.mjs --check`);
3. add fixtures — `scripts/check-fixtures.mjs` requires `fixtures/net/messages.json` (or a directory
   `fixtures/net/messages/`) for `net.messages.v2.json`, and the same rule for every other emitted stem.

### 4.2 `packages/contracts/src/game.ts` (two additive edits)

```ts
// inside gameManifestSchema
net: netManifestSchema.optional(),

// beside MultiplayerHooks
export type Snapshot = { tick: number; state: unknown };

export interface MultiplayerHooksV2 extends MultiplayerHooks {
  capture?(scope: { seat?: number }): Snapshot;
  restore?(snapshot: Snapshot): void;
  digest?(): readonly number[];
  view?(seat: number): unknown;   // called on the sending side only; N5 implements the filtering
}
```

`GameInstance.net` keeps its `MultiplayerHooks` type so every existing game and template still compiles; `view` and the
three v2 hooks are optional there because presence is what `MODE_MISMATCH` checks at runtime. `maxPlayers` stays as it
is today (declared in `gm.manifest.json`, passed through by the loose manifest object); `net.maxSeats` is the
simulation's own declaration and must not be silently derived from it.

### 4.3 `packages/contracts/src/bridge.ts`

Add the v2 names to the two discriminated unions, reusing the payload schemas from `net.ts`:

- `hostToGameSchema`: `net.mode`, `net.seats`, `net.primary`, `net.start`, `net.start.cancel`, `net.tick`, `net.pause`,
  `net.resume`, `net.state`, `net.inputs`, `net.checksum`, `net.recovery`, `net.seat`, `net.transport`.
- `gameToHostSchema`: `net.inputs`, `net.state`, `net.checksum`, `net.recovery.request`, `net.ready`,
  `net.start.request`, `net.signal`.

`bridge.ts:42-53` currently copies `inputFrameSchema` rather than importing room code so engine packages stay free of it,
and `test/bridge.test.ts:187-193` asserts the copies have not drifted. [C] `net.ts` is a contract file in the same
package, so `bridge.ts` imports its schemas directly — the copy rule exists for the room protocol, and duplicating a v2
family here would create exactly the drift that test is designed to catch.

**Seam, stated plainly:** N2 adds the schemas so both sides type-check, and stops there. `bridge-forwarding.ts`'s
`handleGameMessage` switch (`apps/web/src/net/bridge-forwarding.ts:99-173`) keeps its v1 cases and silently drops the v2
ones until N3 wires routing. N2's evidence is the loopback harness, not an end-to-end run. [C]

### 4.4 `packages/sdk/src/net/index.ts` — `GmNet` additions

```ts
export interface GmNet {
  // unchanged: role, localPlayerIndex, players, onPlayerJoined, onPlayerLeft, onInput, sendEvent, onEvent,
  //            snapshotHz, interpolationDelayMs
  readonly mode: AuthorityMode;
  readonly localSeat: number;
  readonly epoch: string;
  readonly tick: number;
  readonly started: boolean;
  onSeats(cb: (seats: readonly NetSeat[]) => void): () => void;
  onStart(cb: (start: NetStart) => void): () => void;
  now(): NetTime;
  frameFor(seat: number, tick: number): ActionFrame | undefined;
  rng(stream: 'shared' | number): Rng;
  digest(): readonly number[];
}
```

### 4.5 `NetController` and `NetControllerOptions` additions

```ts
export interface NetControllerOptions {
  // existing: manifest, hooks, localPlayerIndex, send, acceptInput, syncPlayers,
  //           setLocalPlayerIndex, recordEvent, now, warn
  /** Virtual-clock control for the start gate and drift resync. */
  pauseClock(): void;
  resumeClock(): void;
  resetClock(tick: number): void;
}

export interface NetController {
  // existing: net, role, diagnostics, handleMessage, handleLocalFrames, afterStep, render, dispose
  readonly mode: AuthorityMode;
  readonly stepLocally: boolean;
  beforeStep(tick: number, frames: ActionFrame[]): void;
}
```

`send` widens to the v2 `t` names. `boot.ts` passes the three clock callbacks; `boot.ts:290-295`'s dispatch list gains
the new inbound `t` values, otherwise the bridge delivers them to nothing.

### 4.6 Diagnostics (extends the object `renderInfo().net` already carries)

```ts
export interface NetDiagnostics {
  // v1, unchanged
  dropped: number; eventGaps: number; outOfOrderSnapshots: number; stalls: number; oversized: number;
  // N2
  mode: AuthorityMode; epoch: string; tick: number;
  lateStartTicks: number;
  inputDelayTicks: number; inputGaps: number; lateInputs: number;
  localResponseMs: number; remoteUpdateMs: number;
  clockOffsetMs: number; clockResyncs: number;
  desyncs: number; recoveries: number; hardResyncs: number; desynced: boolean;
}
```

`core/runtime.ts:263-265` (`zeroNetDiagnostics`) and `test/hooks.test.ts:176-183` (an exact `toEqual` over the
diagnostics object) both have to be updated with it. [C] That second one is not optional: it is an exact-shape
assertion and it will go red the moment a field is added.

## 5. Implementation units

Each unit is one commit-sized change with its own tests. Files are repo-relative. "Fails without it" names the test that
proves the unit is load-bearing.

| # | Files | Change | Tests | Fails without it |
| --- | --- | --- | --- | --- |
| **U1** | `packages/contracts/src/net.ts` (new), `src/index.ts`, `src/browser.ts`, `schemas/net.*.json`, `fixtures/net/messages.json` | The v2 net contract family of §4.1, plus the emitted schemas and fixture | `packages/contracts/test/net.test.ts` (new): round-trips every message, rejects an oversized batch, rejects an unknown `authority` | `contracts check` goes red on a missing schema/fixture |
| **U2** | `packages/contracts/src/game.ts`, `packages/contracts/test/game.test.ts` | `manifest.net`, `Snapshot`, `MultiplayerHooksV2` (§4.2) | the existing golden manifest still validates; a manifest with `net: { authority: 'per-seat', maxSeats: 4 }` validates; `maxSeats: 9` is rejected in Zod and in the emitted schema | the per-seat manifest assertion |
| **U3** | `packages/contracts/src/bridge.ts`, `packages/contracts/test/bridge.test.ts` | v2 envelope names (§4.3) | each new name parses in its direction; a v2 envelope with a wrong `t` fails; the drift test at `:187-193` still passes | the new-name parse test |
| **U4** | `packages/sdk/src/net/foundations/checksum.ts` (new), `packages/sdk/src/net/codec.test.ts` | `toUnits`, `fold`, `sameWords`, canonical-order helper; assert the SDK's local `NET_LIMITS` equals the contract's `NET_LIMITS` for the keys they share | `foundations/checksum.test.ts`: the FNV vectors of §6 T6, `toUnits` boundaries, `-0` normalisation; `codec.test.ts`: the drifted-copy assertion | every vector fails to compile/import, and a drifted limit turns `codec.test.ts` red |
| **U5** | `packages/sdk/src/net/foundations/streams.ts` (new) | `createStreams(seed)` → `shared()`, `seat(n)`, `privateSeed(n)`; idempotent per epoch | `foundations/streams.test.ts`: §6 T10 | the idempotence test |
| **U6** | `packages/sdk/src/net/foundations/tick-inputs.ts` (new) | `InputRings`: per-seat ring (120 ticks), 30 Hz window builder with redundancy 3, deadline query, dedupe, `inputGaps`/`lateInputs` | `foundations/tick-inputs.test.ts`: window contents, 3-drop tolerance, dedupe, gap accounting, late-frame accounting | the 3-drop tolerance test |
| **U7** | `packages/sdk/src/net/foundations/clock-sync.ts` (new) | `ClockSync`: sample intake, min-RTT filter, `offsetMs`, `serverMs`, `tickAt`, drift decision; `StartGate`: arm/release/reset | `foundations/clock-sync.test.ts`: §6 T7 | the min-RTT filter test and the drift test |
| **U8** | `packages/sdk/src/net/foundations/recovery.ts` (new) | request/response bookkeeping, coalescing per scope, `recoveryPerSec` window, replay-vs-hard-resync decision, breaker (`maxResyncs`/60 s) | `foundations/recovery.test.ts`: coalescing, rate cap, breaker trips at the fourth resync inside 60 s and reports `desynced` | coalescing and breaker tests |
| **U9** | `packages/sdk/src/net/modes/per-seat.ts` (new), `packages/sdk/src/net/mode.ts` (new), `packages/sdk/src/net/index.ts` | `PerSeatMode`, the resolver, `mode`/`stepLocally`/`beforeStep`/`now`/`digest` surface, `MODE_MISMATCH`, `ModeMismatchError` | `modes/per-seat.test.ts` on the loopback harness: §6 T1, T3, T4, T8 | T1/T3/T4 and the mismatch throw |
| **U10** | `packages/sdk/src/core/runtime.ts`, `packages/sdk/src/core/boot.ts`, `packages/sdk/src/test/hooks.test.ts` | `stepLocally` gate, `beforeStep` call, `gate(nowMs)` before `clock.advance`, clock callbacks, dispatch list, `zeroNetDiagnostics` and the exact-shape assertion | `core/runtime.mode.test.ts` (new) + the updated `hooks.test.ts` | the "peer simulates in per-seat mode" assertion in T11 and the headless start-gate assertion in T7 |
| **U11** | `packages/sdk/src/net/test/loopback.ts` (new), `packages/sdk/src/net/test/fixture-game.ts` (new), `packages/sdk/src/net/test/fixtures/golden/*.json` | The two-seat loopback harness and its deterministic fixture game (§6) | `net/test/loopback.test.ts` self-tests: same seed → same loss pattern, virtual time only | every harness-based scenario |
| **U12** | `packages/sdk/src/test/no-random.test.ts` | add `'net'` to the scanned directories | the existing determinism test now covers the mode | a deliberate `Date.now()` in the mode turns it red |
| **U13** | `skills/gm-multiplayer-ready/SKILL.md` | rules 5 and 8, "The host is authoritative" and "What the SDK gives you" rewritten for per-seat authority (§6 T13) | documentation; checked by review | — |
| **U14** | `templates/game-multiplayer/src/game.ts`, `templates/game-multiplayer/src/state.ts`, `templates/game-multiplayer/gm.manifest.json`, `templates/game-multiplayer/tests/sim.test.ts` | implement `capture`/`restore`/`digest`; declare `net.authority: 'per-seat'` with `maxSeats: 4` | §6 T12 | the digest-agreement test |

Ordering: U1–U3 land first (contracts), then U4–U8 (foundations, pure and independently testable), then U9 with U10
(the mode and its runtime seam, which must land together or the SDK is half-wired), then U11 (the harness that proves
them — write it *before* U9 if the implementer prefers test-first; U9's tests cannot exist without it), then U12–U14.

## 6. Test scenarios with expected values

The harness: **U11**, `packages/sdk/src/net/test/loopback.ts`.

```ts
export interface LoopbackLink {
  latencyMs?: number;   // one-way, default 20
  jitterMs?: number;    // default 0
  lossPct?: number;     // default 0
  reorderPct?: number;  // default 0
  seed?: number;        // drives loss/jitter/reorder, default 1
}

export interface LoopbackOptions {
  manifest: GameManifest;                 // must declare net.authority: 'per-seat'
  seats: number;                          // 2..4
  game(seat: number): MultiplayerHooks & MultiplayerHooksV2;  // one fixture instance per seat
  link?: LoopbackLink;
  startAtMs?: number;                     // virtual server time of tick 0, default 1_000
}

export interface LoopbackMatch {
  start(): void;             // delivers net.start to every seat
  advance(ticks: number): void;  // deliver due messages, then one fixed step per seat
  seat(n: number): { net: GmNet; controller: NetController };
  tick(): number;
  stats(n: number): NetDiagnostics;
  dispose(): void;
}

export function createLoopbackMatch(options: LoopbackOptions): LoopbackMatch;
```

Mechanics that make it deterministic: one virtual clock (`advance(ticks)` moves it by whole steps), message delivery
ordered by `(dueAtMs, senderSeat, sequence)`, and every random draw from a `SeededRng(link.seed)` created per link pair.
No timers, no sockets, no `Date.now`. The fixture game is a two-integer counter plus a position: `capture({ seat })`
returns that seat's `{ p: [x, y], score }`, `capture({})` returns the shared `{ round, boardSum }`, `restore` merges,
`digest` returns `[tick, x, y, score, round, boardSum]` in that order.

**T1 — clean-link agreement.** 2 seats, `latencyMs: 20`, seed 1, ticks 1..600 (10 s). Expected: `digest()` equal on both
seats at every tick divisible by 30 (20 comparisons, 0 mismatches); `inputGaps === 0`, `lateInputs === 0`,
`recoveries === 0`, `desyncs === 0`, `hardResyncs === 0` on both seats; final shared sums equal the committed golden
entry for tick 600.

**T2 — 5 % loss for 10 s, then clean.** 2 seats, `latencyMs: 20`, `lossPct: 5`, seed recorded in the fixture; loss
active over ticks 60..660; run to tick 900. Invariants that must hold for the committed seed: `inputGaps <= 1` per seat
across the loss window (a tick is only gapped when all three covering packets are lost: p = 0.05³ = 1.25 × 10⁻⁴ per
tick, ≈ 0.075 expected gaps over 600 ticks); both seats' digests equal again at tick 690 and at every 30th tick after —
i.e. within 30 ticks (500 ms) of the loss ending; no `hardResync` is needed for gaps below the 30-tick threshold. The
exact counters for the chosen seed go in the fixture and are asserted exactly.

**T3 — local response, no round trip.** Seat 0 presses at tick `t`. Expected: the fixture game's step for tick `t` sees
seat 0's frame in the same step (asserted by recording `(tick, frames)` inside the fixture game), so
`localResponseMs === 0` and `<= STEP_MS`. Repeat with `latencyMs: 80`: unchanged — the number must not move with RTT,
which is the whole property (design §8.1 target ≤ 16.7 ms).

**T4 — recovery restores a corrupted seat.** At tick 300, corrupt seat 1's reconstructed shared state by one unit
(`boardSum += 1`). Expected: the next shared checksum comparison (tick 330 at the latest) disagrees, seat 1 sends one
`net.recovery.request { scope: 'shared', tick: 300 }`, the primary answers, and both digests are equal again by tick 335
(at most 5 ticks after the request: 20 ms latency is 1.2 ticks, and the response is applied on arrival); `recoveries === 1`,
`hardResyncs === 0`,
`desyncs === 0`; a second identical scenario with `correctionMs` in play shows the same final digests.

**T5 — golden checksum fixture over 600 ticks.** A scenario that includes T4's mid-match recovery, recording
`(tick, sharedSum, seat0Sum, seat1Sum)` for every tick of 1..600 into
`packages/sdk/src/net/test/fixtures/golden/two-seat-recovery.json` (600 rows, ~20 KB). The test asserts exact equality
against the file. A second file, `two-seat-clean.json`, records the same at every 30th tick. A digest change is then a
deliberate, reviewable diff — never a silent tuning change.

**T6 — fold and quantise vectors.** Exact, independent of the harness:

| words | `fold(words)` |
| --- | --- |
| `[]` | `2166136261` (`0x811c9dc5`) |
| `[1]` | `4218009092` (`0xfb69b604`) |
| `[0]` | `1268118805` (`0x4b95f515`) |
| `[0, 0, 0, 0]` | `1768495365` (`0x69691905`) |
| `[-1]` | `3809873841` (`0xe3160fb1`) |
| `[1, 2, 3]` | `2034659765` (`0x794671b5`) |
| `[3200, -1600]` | `867088404` (`0x33aeb814`) |
| `[5]` | `3132668352` (`0xbab8b9c0`) |

`toUnits` boundaries: `toUnits(0) === 0`, `toUnits(0.5) === 128`, `toUnits(-0.5) === -128`, `toUnits(1 / 3) === 85`,
`toUnits(-1 / 3) === -85`, `Object.is(toUnits(-0.0001), 0) === true` (no `-0` in a digest). A value beyond
±8.4 × 10⁶ units is outside the 32-bit range `fold` reads, so the SDK documents 1/256 as the scale for values in
a game's world units, not for a raw timestamp.

**T7 — clock sync and drift.** Scripted pong samples `{ c: 1000, s: 2030 }` at 40/80 ms RTT: expected
`offsetMs === 2030 - (1000 + 20) === 1010` from the 40 ms sample, not from the 80 ms one. Drift: with `startAt = 10 000`
and `nowMs + offsetMs = 10 200`, `tickAt === 12`; a room `net.tick` reporting `tick: 20` while the local clock is at 12
(difference 8 > 6) calls `resetClock(20)` exactly once and increments `clockResyncs` once; a difference of 6 does not.
Start gate: `arm(startAt)` calls `resetClock(0)` then `pauseClock()`; the first frame with
`nowMs + offsetMs >= startAt` calls `resumeClock()` exactly once and sets `started = true`.

**T8 — mode mismatch.** A manifest with `authority: 'per-seat'` whose hooks lack `digest` throws `ModeMismatchError`
with `code === 'MODE_MISMATCH'` from `createNetController`; a manifest with `authority: 'rollback'` throws the same
error; a manifest with no `net` builds a controller with `mode === 'host'`.

**T9 — the determinism guard.** With `'net'` added to `no-random.test.ts:19`, a temporary `Date.now()` inside
`modes/per-seat.ts` turns the existing test red. (Land the file only after removing it.)

**T10 — streams.** `start.seed = 12345`: `rng('shared')` yields the same first three values on both seats; `rng(1)`
differs from `rng('shared')` on the first value; asking twice for `rng('shared')` returns a stream with identical state
without advancing it twice (idempotence per epoch); `rng(-1)` and `rng(1.5)` throw.

**T11 — host mode is untouched.** A manifest without `net`: `net.mode === 'host'`; `stepLocally` is `false` for a peer
and `true` for the host; a peer's step listener does not run the game step (the `runtime.ts:95` behaviour); the host
still sends a snapshot only on ticks divisible by 3. The three existing suites (`net/host.test.ts`, `net/peer.test.ts`,
`net/index.test.ts`) must pass unchanged.

**T12 — the template proves it.** `templates/game-multiplayer` implements `capture`/`restore`/`digest` over
`SerializedSimulation` (entities sorted by id, `p` and `v` in units of 1/256, `onGround` as 0/1, plus `tick`), and
`tests/sim.test.ts` asserts: two simulations fed the same 600 frames produce equal digests; moving one avatar by one
unit (1/256) changes the digest; a `capture({})` shared digest over the platform list is independent of any seat's
position.

**T13 — the skill and the docs.** `skills/gm-multiplayer-ready/SKILL.md` rule 5 ("The host is authoritative; peers
render snapshots…") and rule 8, plus the "The host is authoritative" and "What the SDK gives you" sections, describe
per-seat authority: every seat simulates, owned state is published, shared state is checksummed, the primary arbitrates
disagreement, and the three hooks are required. `packages/sdk/README.md` gains a short "Authority modes" section (it has
none today — [C]).

**Runtime budget.** The design's acceptance is "the two-seat harness runs in under 5 s with no network". 900 ticks × 2
seats is 1 800 step calls over a six-integer fixture state; it should be milliseconds, but this workspace cannot measure
it (§8), so the number is a criterion for #496's CI run, not a claim here.

## 7. Assets

None. N2 touches no art, audio, model or asset pack, and nothing under `assets-local/`. The only fixtures it adds are
JSON: `packages/contracts/fixtures/net/messages.json` and
`packages/sdk/src/net/test/fixtures/golden/two-seat-*.json`.

## 8. Evidence

What was read, and what was not measured.

| Claim | Evidence |
| --- | --- |
| A peer does not simulate today | `packages/sdk/src/core/runtime.ts:95` — `if (this.netController?.role === 'peer') { handleLocalFrames; return; }` [C] |
| Host sends every third tick; role-gated | `packages/sdk/src/net/host.ts:28`, `:41` [C] |
| Peer buffers 3 snapshots and renders 100 ms behind | `packages/sdk/src/net/peer.ts:77`, `:94` [C] |
| `snapshotHz: 20`, `interpolationDelayMs: 100` are literal constants | `packages/sdk/src/net/index.ts:25-26`, `:143-144` [C] |
| `MultiplayerHooks` is exactly five methods | `packages/contracts/src/game.ts:201-211` [C] |
| Wire limits: input 256 B, snapshot 64 KiB, event 16 KiB | `packages/sdk/src/net/codec.ts`; `packages/contracts/src/room.ts:12-27` [C] |
| Input encoding caps: 8 axes, 32 buttons, 127-step quantisation | `packages/sdk/src/net/input-codec.ts:24-40`, `:70-73` [C] |
| `FixedClock` already has `reset`/`pause`/`resume` | `packages/sdk/src/core/clock.ts:58-83` [C] |
| RNG is 32-bit and snapshotable | `packages/sdk/src/core/rng.ts` [C] |
| Determinism is enforced by a directory list, not by memory | `packages/sdk/src/test/no-random.test.ts:19` [C] |
| Diagnostics shape is asserted exactly in a test | `packages/sdk/src/test/hooks.test.ts:176-183` [C] |
| The bridge copies `inputFrameSchema` and a test guards drift | `packages/contracts/src/bridge.ts:42-53`; `test/bridge.test.ts:187-193` [C] |
| Emitted schemas and fixtures are gated | `packages/contracts/scripts/emit-schemas.mjs --check`, `scripts/check-fixtures.mjs` [C] |
| FNV-1a vectors in §6 T6 | computed independently for this document, twice (see below) [D] |
| Harness runtime, real digests, Chrome/Safari float behaviour | **not measured here** [X] |

**[X] Why nothing was measured:** this research workspace has no Node toolchain — `node` resolves to a build-gate
wrapper that reports `command_unavailable` (exit 127) and no Node binary exists on the host. Nothing in this document
depends on a measurement it does not have: the fold vectors are pure arithmetic, and every wall-clock number is stated
as an acceptance criterion for the implementation PR rather than as an observation.

## 9. Risks

| Risk | Impact | Mitigation in this design |
| --- | --- | --- |
| The `runtime.ts:95` change regresses host-mode peers | A shipped V1 game's peers would start simulating and diverge | `stepLocally` is one getter with a default of today's behaviour; T11 asserts the old path byte-for-byte |
| `digest()` written by a game that iterates a `Map` insertion order | Two clients fold the same numbers in different orders and disagree forever | `fold`/`sameWords` take an array, and the documented convention is seats ascending then entity ids sorted; T12 asserts it on the template; §3.6's breaker stops a loop escalating |
| A game's `capture({seat})` slice is not merge-restorable | Reconciling three remote seats overwrites the local one | `restore` is specified as "apply exactly this slice"; the template's merge implementation is the worked example (T12) |
| `correctionMs` damping assumes `entities[id].p/r` | Games with other shapes get a snap instead of a blend — acceptable, but surprising | §3.5 says so explicitly; snap is the documented fallback, not a bug |
| 4 seats × 10 Hz × ≤ 8 KiB state exceeds room caps | Dropped state packets, visible remote-seat stutter | `seatStateHz` is a manifest field; the design's §13 budget is ~320 KiB/s worst case at the caps, and #499 measures the real number |
| A recovery loop between two seats with a wrong digest | Unbounded traffic | The breaker (D-N2-7) is in N2 and is unit-tested (U8) |
| Adding fields to `NetDiagnostics` breaks an exact-shape test | Red CI on an unrelated assertion | U10 names the file and line |
| The v2 contracts family is added without schemas/fixtures | `contracts check` red for everyone | §4.1 lists all three chores, including the fixture path rule |
| A research doc's expectations are mistaken for measurements | The implementer "verifies" against a claim nobody ran | Every number is either pure arithmetic or an acceptance criterion; §8 says which |

## 10. Open questions, with the default taken

1. **[Q] Should `net.state` carry an explicit recipient (`to`) so the sender can encode one filtered copy per
   recipient?** The design says filtering must happen before encoding and §13.1 recommends one encode per recipient, but
   the §9.2 payload has no recipient field, so a room cannot tell copies apart. **Default taken here:** `net.state`
   carries an optional `to`, and N3 unicasts when it is present. It is one optional integer now versus a protocol
   amendment later.
2. **[Q] Is `inputDelayTicks = 3` right for a versus puzzler?** **Default:** yes — 50 ms is imperceptible for a
   turn-like action game and the field exists for a twitch game to lower it.
3. **[Q] Should the loopback harness live in `src/` (shipped types) or under a test-only path?** **Default:** in
   `packages/sdk/src/net/test/`, because the SDK's test include is `src/**/*.test.ts` and the design places golden
   fixtures there; the harness must stay free of `Date.now`/`Math.random` (U12 enforces it) and must not be exported
   from `net/index.ts` into a published bundle.
4. **[Q] Does N2 need `net.start` minting at all, given N3 owns the room?** **Default:** no minting, only consumption.
   N2 handles `net.start`/`net.start.cancel`/`net.tick`/`net.primary`/`net.resume` as inbound facts, and the harness
   fabricates them. This keeps N2 testable with no room.
5. **[Q] Should the per-seat mode publish `net.state` when nothing changed?** **Default:** publish on cadence
   regardless, so a lost publish self-heals within 6 ticks and a recipient's ring never depends on change detection.
6. **[Q] Who owns the countdown UI?** **Default:** the game, from `net.now()`; the SDK exposes the mapping and draws
   nothing. No product chrome is added (design §8.2).

## 11. Decisions taken in this spike

| ID | Decision | Why |
| --- | --- | --- |
| D-N2-1 | New behaviour gates on `mode`, never on `role` | `role` keeps its v1 meaning for compatibility; using it as an authority proxy is how a v2 client would silently take a v1 path |
| D-N2-2 | A declared mode with missing hooks throws `MODE_MISMATCH` | A silent downgrade ships a game whose feel depends on seat order |
| D-N2-3 | `NetController.stepLocally` is the only step-path difference | One boolean to review and to test, instead of role checks scattered through the loop |
| D-N2-4 | No replay in per-seat mode; late frames are counted and superseded by the owner's state | The owner's published state is authoritative anyway; a second simulation path is untested code for no gain |
| D-N2-5 | Min-RTT filter for the clock offset | Least queueing asymmetry, the standard NTP argument |
| D-N2-6 | `restore` applies exactly the slice it is given | Three remote seats must reconcile independently of the local one |
| D-N2-7 | The desync circuit breaker lands in N2 | A wrong digest otherwise becomes unbounded recovery traffic |
| D-N2-8 | Digest quantisation default is 1/256 via `toUnits` | Exact in binary floating point, finer than visible, and checksums compare integers only |
| D-N2-9 | The `private(n)` stream is created but unwired until N5 | Shipping a stream whose secrecy is not yet enforced invites a game to rely on it |
| D-N2-10 | `net.ts` reuses `room.ts`'s `InputFrameSchema` rather than redefining it | The frame the SDK emits is the frame the room validates; a copy is a drift source |
| D-N2-11 | The bridge gains the v2 names in N2, and routing stays N3's | Both sides need to type-check before either can be tested; behaviour stays with its owner |
| D-N2-12 | The start gate is evaluated by `NetController.gate(nowMs)`, called from `RuntimeImpl.advance` before the clock advances | A paused clock produces zero steps and therefore no `render()`, so a gate checked only during a step would never open in a headless run |

## 12. What the rewritten #496 must say

Acceptance, restated so the ticket can be cut without re-reading this document:

1. `packages/contracts` ships `net.ts`, the `manifest.net` field, `MultiplayerHooksV2` and the v2 bridge names, with
   emitted schemas and fixtures; `pnpm --filter @ogm/contracts check` and `test` green.
2. `packages/sdk` ships the foundation modules (`checksum`, `streams`, `tick-inputs`, `clock-sync`, `recovery`),
   `PerSeatMode`, the resolver, the `GmNet`/`NetController` additions and the
   diagnostics; `pnpm --filter @gm/sdk test` green, including T1–T12.
3. `pnpm --filter @gm/template-game-multiplayer test` green with `digest()` implemented and T12 passing.
4. `skills/gm-multiplayer-ready/SKILL.md` describes per-seat authority (T13), and `packages/sdk/README.md` gains the
   mode section.
5. Host mode is provably unchanged: T11 plus the three untouched v1 net suites.
6. The harness runs 900 ticks in under 5 s with no network, no timers and no browser, and no test in the new
   directories reads `Date.now` or `Math.random`.
7. The PR records which parts of §3 are *not* wired yet (bridge routing, room routing, visibility filtering) and names
   their tickets, so a reviewer does not read a green SDK suite as end-to-end multiplayer.
