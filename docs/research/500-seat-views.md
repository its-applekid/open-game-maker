# Per-seat views and visibility — research spike for #500 (N5)

- **Source requirement:** #505, research spike for #500 "Per-seat views and visibility: what each seat may receive", which
  implements N5 of the netcode platform design (#495).
- **Consumed design:** `docs/plans/netcode-platform.md` — §2 rule 5 (hidden data is never sent), §3.3 (ownership
  classes), §4.2 (seeded streams), §4.6 (checksums and recovery), §5.1–§5.3 (visibility classes, enforcement points,
  what cannot be hidden), §7.2 (event routing), §9.5–§9.6 (the `gm.net` API and the game hooks), §9.7 (bridge
  envelopes), §10.4 (N5's contract), §12.4 (what each ticket must prove), §13 (risks).
- **Consumed sibling spikes:** `docs/research/2026-11-05-sdk-per-seat-authority-496.md` (N2, decision ids `D-N2-*`) and
  `docs/research/497-rooms.md` (N3, decision ids `D-N3-*`), both open in review at the time of writing. Where this
  document contradicts one of them, it says so and names the decision it replaces.
- **Repository evidence:** `main` at `5d05a56f` (merge of #519). Every `[C]` claim names the file and line read at that
  commit.
- **Deliverable:** this document. No code ships in #505; #500 is rewritten from it.
- **Evidence labels:** **[C]** read in the code at the commit above; **[D]** decision taken here, with its reason;
  **[Q]** open question carried with a recommended default; **[X]** not verified in this workspace (no Node toolchain —
  see §8).

## 0. Where this document stands

`docs/plans/netcode-platform.md` (§5, §9.5–§9.6) fixes the vocabulary: three visibility classes plus "never sent", one
declaration hook (`view(seat)`), enforcement before encoding on the sending client, and a checksum that must not include
private fields. It is not re-litigated here. This document adds what an implementer cannot infer from it:

1. What `view(recipient)` actually returns, and what the default is when a game does not implement it. §5.1 of the
   design says "it returns what that seat may receive", which is compatible with two very different implementations;
   picking the wrong one produces either a duplicated world or a leak (§3.1).
2. The fan-out: one `net.state` publish becomes one encode per recipient, so a per-recipient payload needs a
   per-recipient address. N2's spike took `net.state.to` as a default (§10 question 1 there); this document makes it
   load-bearing, **finds that N3 has not implemented it**, and says what the room does with it (§3.2, `D-N5-15`).
3. **Every state-bearing payload, not just `net.state`.** The recovery snapshot (§4.6 of the design) carries state to a
   non-owner and the design never says it is filtered. That is the largest hole N1 leaves, and §3.4 closes it.
4. Where the private seed comes from, exactly, because **N3 currently derives it from the shared seed — which makes it
   public and the stream worthless**. §3.5 states the correction with a formula, and §9 records it as a change to
   `D-N3-6`.
5. What "`digest()` excludes anything private" can be enforced to mean, given that `digest()` is game-supplied opaque
   integers. §3.6 splits it into two mechanically enforced rules and one loud failure rather than a promise.
6. Exact interfaces, implementation units with files, test scenarios with expected values, and the seven limits a game
   design has to respect (§3.9).
7. Seven gaps found in N1/N2/N3 while writing this, each resolved with a decision (§11) rather than an open question,
   because a rewritten ticket must not stop to ask.

## 1. Outcome

`gm.net` gains a visibility layer that a per-seat game can rely on. A game declares `view(recipient)` on its instance;
the SDK calls it once per recipient per publish and encodes exactly what it returns, addressed to that recipient, and
nothing else leaves the client. Every state-bearing payload that reaches a seat which does not own the state is
produced that way — the steady `net.state` publish, a `seat`-scope recovery snapshot, and the host-mode `net.snapshot`
(which is refused rather than filtered, because one snapshot for everyone cannot be filtered). A `private(n)` stream,
seeded from a per-seat value the room delivers only to that seat, gives a seat hidden draws whose result travels as an
event when the seat chooses to reveal it. `digest()` stays a game contract, and the SDK makes its one failure mode
loud instead of quiet.

The rendering half is already built and needs no wire change: each client already draws `hud(localPlayerIndex)` and
attaches its camera rig to the local avatar (`bindLocalPlayer`). N5 changes the source of truth from `playerIndex` to
`seat`, adds the spectator path, and proves the privacy half on encoded bytes.

**Acceptance (what the Executor can check).** `pnpm --filter @gm/sdk test` green; the visibility canary test fails when
`view` is removed from the fixture game (the guard requirement of design §12.4); the two canary payloads are asserted on
the encoded bytes a recipient actually receives, not on rendered output; `skills/gm-multiplayer-ready/SKILL.md` documents
the limits of §3.9; `templates/game-multiplayer` passes its existing tests with the visibility path in place.

## 2. What exists today

### 2.1 There is no visibility code at all, and the default mode sends everything

| Fact | Locus | Consequence for N5 |
| --- | --- | --- |
| The whole game-facing network surface is `role`, `localPlayerIndex`, `players`, `onInput`, `sendEvent`/`onEvent`, plus two constants | `packages/sdk/src/net/index.ts:16-27` | No seat, no `mode`, no `rng`: N2 adds `mode`/`localSeat`/`seats` and the shared/seat streams; N5 adds the private stream and the visibility layer |
| A host-mode snapshot is the game's *whole* visible state, packed once and broadcast | `packages/sdk/src/net/host.ts:41-45` | One shot for everyone: a private field is public in host mode, by construction |
| The bridge relays `net.snapshot` from the host to every peer and `net.event` from peers to the host | `apps/web/src/net/bridge-forwarding.ts:90-127` | Filtering must be on the sender; the host app can only size-cap |
| `MultiplayerHooks.hud(playerIndex)` already promises "Per-player HUD; private fields never included" | `packages/contracts/src/game.ts:209-210` | The privacy that exists today is *local drawing only* — the HUD is never on the wire. It stops being sufficient the moment a publish carries the simulation |
| `bind.ts` re-attaches the camera rig and refreshes the HUD from `net.localPlayerIndex` on every net state change and every frame | `packages/sdk/src/net/bind.ts:14-23` | The per-seat camera/HUD path is done; N5 changes its input and adds the spectator case |
| `NetPlayer` is `{ playerIndex, name, connected }`; `RoleStore.spawn` uses `p<index>` ids | `packages/sdk/src/net/roles.ts:5-9`, `:108-117` | No `team`, no `spectator`, no `ready`; those arrive with N3's `net.seats` |
| `SeededRng` is 32-bit, snapshotable, and `setSeed` remaps `0` to `1` | `packages/sdk/src/core/rng.ts:38-42` | The `private`/`seat` seeds are derived numbers; a derived `0` would silently collide with `1` (§3.9) |
| There is no `hash32`, no `fold`, no `digest` hook and no `view` hook anywhere in the repository | grep over `packages/`, `apps/`, `services/`, `templates/` for `hash32`, `fnv`/`FNV`, `digest(`, `view?(` | Every helper this ticket names is N2's to create, except the visibility layer itself |

### 2.2 What the spike can and cannot see

The first consumer is a 1–4 player versus puzzle game whose public planning issue describes, behaviourally, "chains and
line clears send attacks to opponents with an advance warning" and "a disconnect pauses the match with a 30-second rejoin
before forfeit" (`its-everdred/Open-Games#45`, public text only). That is enough to name the visibility classes of design
§5.1 against a real consumer without quoting any of it. Its private context lives under `assets-local/private/games/…`,
which is a
symlink whose target is absent in this workspace (`ls -l assets-local` shows the link; `ls assets-local/` fails), so no
private design was read and none is described here.

## 3. Design

Fifteen decisions carry the design; the log is §11. Each is written as the decision, the reason, and the alternative
that was rejected — that last part is what an implementer needs when the code gets awkward.

### 3.1 `view(recipient)` returns the outgoing payload, and its default is the sender's own slice (D-N5-1)

`view(recipientSeat)` is called on the **sending** client and returns the value that this recipient may receive from this
sender on this publish. The SDK encodes exactly that value as the `data` of the `net.state` addressed to that recipient.

N1 §5.1 says the default — for a game that does not implement `view` — is "`capture({ seat })` plus shared state".
Read literally, `capture({ seat })` with the *recipient's* seat would send each recipient its own slice labelled as
another seat's, which is meaningless. The only reading that works is that `seat` there is the **sending** seat: a seat
publishes its own owned slice, and the default is that unchanged. So:

```ts
// what is encoded for recipient R, when S is the sending seat
const payload = hooks.view ? hooks.view(R) : hooks.capture({ seat: S });
```

"Plus shared state" is satisfied by determinism and by `net.checksum`, not by the payload: §3.3 of the design says a
shared value is never sent in steady state. Nothing is added to a publish to compensate.

Rejected: `view(recipient)` returning a **field whitelist** (a list of keys), with the SDK stripping the payload. It
reads as the smaller API, but the SDK does not know a game's state shape — keys are nested, arrays and `Map`s are
opaque, and a nested private field would need a path grammar this design does not have. Returning the payload lets the
game use the language it already wrote and costs the SDK zero knowledge of its data.

Rejected: `view(payload, recipient)` (a filter function). It forces the game to write a redactor and gives the SDK two
sources of truth for what the payload is; N1 §9.6 already fixed the single-argument shape.

### 3.2 One publish becomes one unicast per recipient (D-N5-2)

At `seatStateHz` (10 Hz by default) a per-seat client publishes its owned slice. With `view` in play that slice is no
longer identical for every recipient, so the publish becomes, per recipient:

1. `const payload = view(recipientSeat)` — once per recipient, in ascending seat order;
2. `packed = packJson(payload, LIMITS_V2.seatStateBytes, 'state')`, stamped with the sender's single next `seq`;
3. `send('net.state', { epoch, seat: localSeat, seq, tick, to: recipientSeat, data: base64(packed) })`.

One consequence an implementer gets wrong first: **`view(R)` must include whatever of the sender's *own* owned slice `R`
may receive.** A game that returns only what `R` owns has stopped publishing its own state, and every other seat's copy of
it freezes at its deterministic reconstruction. The default is exactly the sender's own slice, so the natural first
implementation — "narrow the default object" — is correct and "start from nothing" is not.

`to` is optional and its absence means "everyone on the default payload", which is what a game without `view` keeps
emitting. The room unicasts when `to` is present and broadcasts otherwise (N3's routing table); the room never inspects
`data`.

Cost, stated honestly: four seats at 10 Hz with a full 8 KiB slice is 240 KiB/s of encodes on the busiest client, which
is inside `seatStatePerSec: 10` per *sending session* because the rate cap counts messages, not recipients (N2's
§6 S26 makes the same point). A game that does not need per-recipient payloads pays nothing: without `view` the mode
sends one broadcast exactly as N2 specified.

Rejected: one encode plus a recipient list in the envelope. The room would have to fan out, which is routing it can do,
but the recipients must receive *different bytes*, so the encode has to happen per recipient on the sender anyway.

**This requires one amendment to N3, and without it the fan-out leaks.** N3's `net.state` payload is
`{ epoch, seat, seq, tick, data }` and its routing table sends it to "every other seated session in the current epoch"
(`docs/research/497-rooms.md`, §4.4 and §4.6). Four filtered copies broadcast to four seats means recipient A receives
seat B's copy too — the payload that was narrowed *for B*. The leak is not hypothetical and it is not a size problem: it
is the exact data `view` removed, delivered to the wrong seat. N3 must add the optional `to` of N2's §10 question 1 to
the payload schema and route a `to`-addressed `net.state` to that one seat. It is one optional integer in one schema and
one branch in `routing.ts`, and N5 cannot be correct without it. Recorded as `D-N5-15` and as a dependency in §12.

### 3.3 Privacy is only claimed in `per-seat` mode (D-N5-3)

Host mode cannot be filtered. `HostChannel.afterStep` packs `hooks.snapshot()` once for everyone
(`packages/sdk/src/net/host.ts:41-45`) [C], so a private field in the simulation is in every peer's copy. A game that
declares `view` and runs in host mode would believe it has privacy it does not have.

So: a manifest whose `net.authority` resolves to anything but `'per-seat'` while the instance implements `view` is
refused at construction, through the same error path N2 defines for a missing hook:

```ts
// packages/sdk/src/net/mode.ts (N2) — the check N5 adds
if (mode !== 'per-seat' && typeof hooks.view === 'function') {
  throw new ModeMismatchError('VISIBILITY_REQUIRES_PER_SEAT', mode);
}
```

`ModeMismatchError` keeps `code: 'MODE_MISMATCH'` and gains the `VISIBILITY_REQUIRES_PER_SEAT` reason; no new error class
and no new join code. `boot` already surfaces a controller-construction throw as its `error` envelope, so the creator sees
one message instead of a silent downgrade.

Rejected: filtering `net.snapshot` in host mode. It would mean one snapshot per peer at 20 Hz with the host simulating
every seat — a rewrite of the mode to buy the weaker guarantee.

Rejected: a manifest field (`net.visibility: 'public' | 'per-seat'`) to declare the intent separately. Presence of
`view` is the declaration, it cannot drift from the code, and no room or verify path needs to know the answer
(`[D-N5-13]`).

### 3.4 Every state-bearing payload destined for a non-owner crosses `view` (D-N5-4)

`net.state` is not the only payload that carries state. The design's recovery path (§4.6) does too, and it is the hole:
a `seat`-scope recovery snapshot is *by definition* another seat's owned slice, so an unfiltered recovery would hand a
recipient exactly what §5.2.1 of the design forbids it to have — one checksum mismatch away.

| Payload | Sent by | Recipient | Filtered? |
| --- | --- | --- | --- |
| `net.state` (the owned-slice publish) | the seat that owns the slice | every other seated recipient | yes, `view(recipient)` |
| `net.recovery { scope: 'seat', seat: n }` | seat `n` (the arbiter for that scope) | the requesting seat | yes, `view(requester)` |
| `net.recovery { scope: 'shared' }` | the primary | the requesting seat | **no** |
| `net.checksum { scope: 'shared' }` | every seat | every other seat | not state: folded integers (§3.6) |
| `net.event` | any seat | whoever the target names | **no** — the payload is the game's deliberate reveal |
| `net.snapshot` (host mode) | the host | every peer | refused, not filtered (§3.3) |

The `shared` scope is deliberately unfiltered, and the reason matters: a shared value is public by definition (§5.1 of
the design), so a filter there could only produce *different* shared truths per recipient, which is strictly worse than
the leak it would prevent — it would make reconciliation impossible while the checksum still compared the two. A game
that puts a private field in `capture({})` has misclassified it, and §3.6's third bullet is where that surfaces loudly.

The `event` channel is the reveal. A seat that learns something hidden decides, itself, to send `net.event` with the
target it chooses; the SDK transports it and never redacts it. That is what makes "hidden until revealed" expressible
without a second hook.

### 3.5 The private seed must not be derivable from the shared seed (D-N5-6, corrects D-N3-6)

The design (§4.2) gives three streams and says the `private(n)` seed is "sent only to seat `n` in `net.start`". N3's
spike implements that as `privateSeedFor(seed, seat) = hash(seed, seat)` from the shared `seed` every seat receives
(`docs/research/497-rooms.md`, U7 and §3.4). **That makes the per-seat copy decorative: every client can compute every
seat's private seed from the value it was broadcast.** The stream would look private and be public.

The correction is one value in N3 and one constraint in N2:

- **The room mints `privateSeed` as an independent draw**, `crypto.randomInt(1, 2**32)` per seat, at `net.start`, never
  derived from `seed`. `crypto.randomInt` over `[1, 2**32)` both keeps it unguessable and avoids `0`, which
  `SeededRng.setSeed` remaps to `1` (`core/rng.ts:38-42`) [C].
- **The per-seat copy always carries that seat's `privateSeed`; the broadcast copy never does.** N3 already sends one
  copy per seat (D-N3-6), so this is a change of value, not of shape.
- **A rejoin inside the window re-sends the *same* `privateSeed` for that seat.** N3's rejoin path unicasts a
  `net.start` with the epoch's `startAt` in the past; it must carry the value the room minted at start, so the room stores
  one `privateSeed` per seat for the life of the epoch. A fresh draw on rejoin would silently break a hidden draw
  mid-match, and a *different* value per delivery would break determinism of anything the seat already revealed.
- **N2's `createStreams(seed)` does not expose `privateSeed(n)`.** Its `private(n)` stream is constructed from the value
  it received, for the local seat only; asking for another seat's private stream throws. `[D-N5-6]` supersedes the
  `privateSeed(n)` item of N2's U5 and the `hash32(start.seed, seat)` sentence in its §3.8 as they apply to *private*
  streams. The public `seat(n)` stream keeps a derivation, because everyone is meant to be able to compute it:

```ts
// packages/sdk/src/net/foundations/streams.ts (N2) — the only derivation that stays
export function hash32(seed: number, seat: number): number; // FNV-1a 32 over LE32(seed) || LE32(seat)
// exact vectors, so N2's SDK and N3's room cannot drift:
// hash32(12345, 0..3) = [3687543404, 737653117, 2082730126, 3427807135]
// hash32(1, 0..3)     = [1048580676, 2393657685, 3738734694, 788844407]
// hash32(0xDEADBEEF, 0..3) = [3761803643, 2416726634, 1071649625, 4021539912]
```

`hash32` is FNV-1a 32-bit with basis `0x811c9dc5` and prime `0x01000193` over the eight bytes `seed` little-endian then
`seat` little-endian, matching the `fold` N2 defines in `foundations/checksum.ts` (§6 T6 of the 496 spike). The vectors
above were computed with an independent implementation that reproduces all eight of that spike's `fold` vectors, so the
two documents agree on the primitive.

Rejected: keeping `hash(seed, seat)` and calling the stream "not secret, only unlinkable". It is not unlinkable and it is
not secret. A game would build a hidden draw on it and leak.

Rejected: a shared-secret HMAC over `(seed, seat)` keyed by `OGM_WS_TOKEN_SECRET`. It would work, and it would put a
client-facing game secret into the room's signing key — the one thing design §4.7 explicitly refuses to extend. One
random integer costs nothing and needs no key.

### 3.6 What "`digest()` excludes private fields" can be enforced to mean (D-N5-7, D-N5-8)

`digest()` is game-supplied opaque integers (`MultiplayerHooksV2.digest`), so the SDK cannot inspect or strip it. Design
§5.2.3 nonetheless requires that a private field never enter it — otherwise two seats exchanging sums give a guesser an
oracle. The honest split:

1. **Mechanically enforced: there is no private checksum scope.** `net.checksum`'s `scope` is `'shared' | 'seat'` and
   neither is a channel for private state (§9.2 of the design, unchanged). A game has no API to publish a sum of a
   hidden value, so the simplest leak — "publish a checksum over my hidden hand" — cannot be written.
2. **Mechanically enforced: an owned sum is computed from the filtered slice, per recipient.** Design §4.6 says the sum
   of a seat's owned slice is implicit in `net.state`. The SDK does not know a game's words, so it cannot fold the sum
   itself; what N5 does is make the wrong order impossible to ship quietly. The rule is that a sum travelling in an owned
   publish is folded over **exactly the fields of the payload the recipient receives** — so a `view` that narrows a slice
   must recompute the sum for the narrowed slice, never carry the sender's full-slice sum. T10 proves it: the fixture's
   payload carries a `sum`, and the test folds the words of the bytes the recipient actually got and asserts they match.
   Fold-then-filter would have made the sum an oracle for exactly the redacted field; this ordering is the whole rule.
3. **Loud, not quiet: a private field in `digest()` cannot agree, so it can only desync.** If a game folds a private
   value, a remote seat's copy of that value differs from the owner's, so the two shared sums differ at every comparison.
   The seat counts `desyncs`, requests a recovery it cannot satisfy, and trips the breaker
   (`maxResyncs = 3` in 60 s, N2 U8). The failure the design feared — "two seats exchanging sums would confirm a guess" —
   is reachable only if the sums *converge*, which requires the guesser's copy to already be right. A mismatch cannot be
   read as confirmation, because a mismatch is the state every wrong guess also produces; and the first mismatch stops the
   match instead of continuing to answer questions. Making this an assertion (a seat that receives a shared sum that
   never agrees for 3 consecutive comparisons pauses the match) is N2's breaker plus one diagnostic counter, not new N5
   code.
4. **Testable per game:** the template gains a test that changes a private field and asserts `digest()` is unchanged
   (§6 T8), and `skills/gm-multiplayer-ready/SKILL.md` gains the rule (U8).

N5 therefore adds no hook and no message for the checksum. What it adds is the ordering rule of (2) and the documentation
of (3), which is the most that can be enforced without knowing a game's state.

### 3.7 `restore` applies only the keys it is given (D-N5-9)

N2's reconciliation calls `restore(slice)` with a payload a remote seat produced (`D-N2-6`: "apply exactly the slice it is
given"). That contract was written before a slice could be *redacted*. Two rules follow, and they are the ones an
implementer will otherwise get wrong:

- A redacted field is **absent**, never `null`, never `0`, never `undefined`-as-a-value. `view` returns a smaller object;
  it does not return a masked one. Only absence is distinguishable from a legitimate zero.
- `restore` merges the keys present and leaves every absent key at the recipient's own value — which for a redacted
  owned field is the reconstruction from the input stream, and for a redacted shared field is whatever determinism
  produced. A merge that rebuilt the whole object from the payload would zero the fields the recipient may not see, and
  the client would then fail its own shared checksum for a reason nothing in the logs points at.

The template's `applySnapshotState` already merges per entity (`templates/game-multiplayer/src/state.ts:183-195`), but it
*deletes* entities it did not see [C]. That is correct for a full snapshot and wrong for a redacted one: a redacted
slice must not remove the avatar it omits. §6 T6 pins the difference.

### 3.8 Camera, HUD and the spectator path (D-N5-10)

The rendering half is one hook and one binding that already exist. N5 does not add wire messages for it:

- `bindLocalPlayer` keeps doing `rig.attach(target, seat)` and `updateHud(hud(seat))` on every net state change and every
  frame (`packages/sdk/src/net/bind.ts:14-23`) [C]. Its input becomes `net.localSeat`.
- `GmNet.localSeat` is `number | null`; `null` is a spectator. `bindLocalPlayer` in the spectator case attaches nothing,
  never calls `hud`, and returns a disposer that is still safe to call.
- `hud(seat)` reads only that seat's own state — which the local client holds at full fidelity, because a private field
  is *never* wired to anyone, including its owner. That is the inversion worth stating: privacy costs nothing on the
  owning seat, because the owning seat computes its own private state locally from its own `private(n)` stream.

A spectator receives no `net.state` at all (N3 routes `net.state` to seated sessions only, `§4.6` of the 497 spike), so
there is nothing to filter and `view` is never called with a spectator. §6 T4 asserts both ends of that.

### 3.9 The seven limits a game design must respect (D-N5-11)

Design §5.3 names three; writing them out for an implementer gives seven, and all seven go into the skill.

1. **A shared seed reveals the future.** `rng('shared')` is computable by every seat. A hidden draw must use
   `rng('private')`.
2. **`rng('private')` is one stream per seat, not a vault.** It is seeded from one 32-bit value the room minted. A seat
   that draws from it and then reveals the result has revealed the state of the stream; later draws from the same stream
   become guessable. Draw once per item, reveal the value, not the generator.
3. **Determinism leaks through timing.** A client that recomputes shared state can infer a hidden choice from *when* an
   event arrives. Keep genuinely secret information out of the simulation.
4. **A private field that feeds a public value is public.** The public value carries it. The visible symptom is a desync
   loop (§3.6.3), not a leak.
5. **Recovery cannot repair a redacted field.** A seat that recovers a `seat`-scope slice it may not fully see keeps its
   own reconstruction of the redacted part. If that part matters to the recipient, it was never private.
6. **Payload size is not a channel, but event timing and volume are.** A filtered payload has a stable shape (absent
   keys, not masked values), so its length does not vary with the hidden content. The *number* and *timing* of a seat's
   reveals still correlate with what it is doing.
7. **The room is not a trust boundary for content.** A malicious client can send anything to any seat it is routed to.
   Cheating between invited players is accepted (`D-ROOMS`); the platform's job is not to hand a seat information it
   should not have, not to police the peers.

### 3.10 What stays exactly as it is

`sendEvent`/`onEvent` keep their v1 behaviour and gain only N3's routing options (`target`, `to`, `round`) on top; N5
does not shape them further. `snapshotHz: 20` and `interpolationDelayMs: 100` stay literal for host mode. The bridge keeps
validating and size-capping every envelope (`apps/web/src/net/bridge-forwarding.ts:88-93`) [C] — with one addition it
needs for v2 anyway (`net.state`'s `seatStateBytes`), and no visibility logic: the host app still cannot see inside a
payload, and §5.2.2 of the design only asks it to keep the cap. No product screen changes: the camera and HUD are the
game's, drawn inside the iframe.

## 4. Interfaces

Additive only; nothing in the v1 surface changes.

### 4.1 `packages/contracts/src/game.ts`

`MultiplayerHooksV2` is N2's (design §9.6). N5 does not change it; it fixes the meaning of two existing members and
documents the third, which is a comment change plus the type of `view`'s return:

```ts
export interface MultiplayerHooksV2 extends MultiplayerHooks {
  capture(scope: { seat?: number }): Snapshot;
  restore(snapshot: Snapshot): void;      // merges only the keys present in the slice (§3.7)
  digest(): readonly number[];            // excludes every field that is private to a seat (§3.6)
  /** What `seat` may receive from this client on this publish. Absent: `capture({ seat: localSeat })`. */
  view?(seat: number): unknown;
}
```

No new schema key, no new manifest field, no emitted-schema change: `MultiplayerHooks` is a TypeScript interface, not a
zod schema, and `game.v1`'s manifest is untouched.

### 4.2 `packages/sdk/src/net/visibility.ts` (new, N5's one new module)

```ts
import type { MultiplayerHooksV2 } from '@ogm/contracts';
import type { NetStateMessage } from '@ogm/contracts';

/** The contract's own envelope, addressed: no message shape is redefined in the SDK. */
export type NetStateOut = Omit<NetStateMessage, 'to'> & { to: number };

export interface VisibilityOptions {
  hooks: MultiplayerHooksV2;
  localSeat: number;
  /** Ascending, seated, connected-or-reconstructible seats; spectators are never recipients of state. */
  recipients(): readonly number[];
  warn?(message: string): void;
}

/** The payload recipient `seat` may receive from this client: `view(seat)`, or the local owned slice. */
export function payloadFor(options: VisibilityOptions, seat: number): unknown;

/**
 * One publish, one encode per recipient (§3.2). Returns the envelopes to send, and a count of per-recipient failures
 * so one bad recipient cannot silence the others.
 */
export function encodeSeatState(
  options: VisibilityOptions,
  envelope: { epoch: string; tick: number },
): { messages: NetStateOut[]; failures: number };
```

Both types come from `packages/contracts/src/net.ts` (N2's file); nothing in the SDK redefines a wire shape, which is the
same rule `codec.ts` already keeps for the v1 limits (it copies numbers, not schemas) [C].

Rules `encodeSeatState` enforces, each with its own test:

1. `payloadFor` is called **once per recipient**, in ascending seat order, before any encoding — so a game's `view` that
   reads mutable state sees one consistent tick.
2. A recipient whose `view` **throws** or whose payload fails `packJson` (over `seatStateBytes`, or not
   JSON-serialisable) is skipped, the failure is counted, and a warning is raised **once per kind** — the same `warnOnce`
   shape `index.ts` uses today. One bad recipient never silences the others, and a throwing `view` never escapes into the
   step.
3. `seq` is one monotonic counter per sending seat, shared across recipients, so a recipient can order this sender's
   publishes after a fan-out reorder.
4. An empty recipient list produces no messages at all (a single-seat match publishes nothing), matching today's
   `playerCount() === 1` shortcut in `host.ts:41` [C].

### 4.3 `packages/sdk/src/net/index.ts` — `GmNet` additions (N2's shape, N5's two corrections)

```ts
export interface GmNet {
  // N2: mode, role, localSeat, seats, epoch, tick, started, onSeats, onStart, now, frameFor, digest
  /** Was `number` in N2's draft; `null` is a spectator (§3.8). */
  readonly localSeat: number | null;
  /** N2's `NetSeat` (design §9.5): v1's `NetPlayer` plus `seat`, `team`, `spectator`, `connected`, `ready`. */
  readonly seats: readonly NetSeat[];
  /**
   * N2 shipped `'shared' | number`. N5 adds `'private'`, which is the *local* seat's private stream only; asking for
   * another seat's private stream throws a RangeError (§3.5).
   */
  rng(stream: 'shared' | 'private' | number): Rng;
}
```

`role` is unchanged: `'host'` still means "this client holds the primary seat" (design §3.4), so a v1 game's role checks
keep their meaning. Nothing in N5 reads `role` to decide visibility — `localSeat` and `seats` are the facts.

### 4.4 `packages/sdk/src/net/modes/per-seat.ts` (N2's file, two call sites)

- The publish step (§3.2 of the 496 spike) replaces its single `send('net.state', …)` with
  `encodeSeatState(...)` and one `send` per returned envelope.
- The recovery responder replaces its unfiltered `capture({ seat: n })` with `payloadFor(options, requester)` for a
  `seat`-scope answer and leaves `capture({})` unfiltered for a `shared`-scope one (§3.4).
- The constructor gains the §3.3 refusal.

No other file in the mode changes, and the room is not touched by N5 at all.

### 4.5 `packages/sdk/src/net/bind.ts`

`LocalPlayerBindingOptions` is unchanged; `bindLocalPlayer` gains the spectator branch (§3.8). The existing
`bind.test.ts` keeps passing because a seated client's behaviour is identical.

## 5. Implementation units

Each unit is one commit's worth of work and names the test that proves it. "Fails without it" names the test that turns
red if the production change is reverted.

| # | Files | Work | Proved by | Fails without it |
| --- | --- | --- | --- | --- |
| **U1** | `packages/sdk/src/net/visibility.ts` (new), `packages/sdk/src/net/visibility.test.ts` (new) | `payloadFor`, `encodeSeatState`, the four rules of §4.2 | `visibility.test.ts` with a stub `MultiplayerHooksV2`: a `view` that returns a smaller object produces a smaller encoded payload for that recipient only; a throwing `view` for one recipient still yields the others' messages and `failures: 1`; two calls in one publish see the same tick | the per-recipient payload test: with `payloadFor` returning one payload for everyone, the canary field appears in the other recipient's bytes |
| **U2** | `packages/sdk/src/net/modes/per-seat.ts` | Publish fan-out (§4.4), recovery filtering, the §3.3 refusal | `modes/per-seat.test.ts` additions: T1, T2, T4 of §6 | T1: a game without `view` must still emit exactly one `net.state` per publish (one byte-identical message, not four) |
| **U3** | `packages/sdk/src/net/index.ts`, `packages/sdk/src/net/foundations/streams.ts` | `rng('private')` from the received `privateSeed`, the RangeError for another seat, `localSeat: number \| null`, `seats` | `foundations/streams.test.ts`: T7 of §6 | T7's "asking for seat 1's private stream throws" and the two-seat divergence assertion |
| **U4** | `packages/sdk/src/net/bind.ts`, `packages/sdk/src/net/bind.test.ts` | The spectator branch; `localSeat` as the input | `bind.test.ts`: T5 of §6 | the spectator test: with the branch removed, `hud` is called with `null` and the test throws |
| **U5** | `packages/sdk/src/net/test/loopback.ts` (N2's harness), `packages/sdk/src/net/test/fixture-game.ts` | Two additive options: `sniff?: (recipient: number, kind: string, bytes: Uint8Array) => void` called on every encoded payload, and `privateField` on the fixture game (an owned counter that `view` redacts for other seats) | `net/test/loopback.test.ts`: the sniffer sees one `net.state` per (sender, recipient) pair and the fixture's private counter in **none** of another seat's bytes | the canary test (U6) cannot exist without the sniffer |
| **U6** | `packages/sdk/src/net/test/visibility.test.ts` (new) | The canary (§6 T1) and the reveal (§6 T3) | itself | `view` removed from the fixture game → the canary string appears in seat 1's bytes and the test fails |
| **U7** | `templates/game-multiplayer/src/game.ts`, `templates/game-multiplayer/src/state.ts`, `templates/game-multiplayer/tests/sim.test.ts` | `view` implemented over the template's simulation (own avatar's `p`/`v` fully, everyone else's `p` only, a per-seat `secret` field redacted for everyone else), and a template test that a private change does not move `digest()` | `tests/sim.test.ts`: §6 T8 | the digest test: with the private field folded into `digest()`, it fails |
| **U8** | `skills/gm-multiplayer-ready/SKILL.md` | Rule 7 and a new "What a seat may receive" section: `view`, the reveal event, the seven limits of §3.9, the "recovery cannot repair a redacted field" caveat | doc review (U8) | — |

Ordering: U1 alone is pure and testable; U2 depends on U1; U3 is independent of U1/U2 and can land first; U5 has to exist
before U6 (write it first if the implementer prefers test-first); U7 and U8 last. Nothing here needs a room change, a
contract schema, an emitted-schema regeneration or a migration — the whole ticket is one new SDK module plus call sites.

## 6. Test scenarios with expected values

All of these run on N2's loopback harness (`packages/sdk/src/net/test/loopback.ts`): two or four controller instances in
one process, a virtual clock, an in-memory link, no sockets, no timers. Every scenario fails without its production
change.

### 6.1 Visibility

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| T1 | 2 seats, fixture game with owned `secret: 'canary-7f3a'` for seat 1, `view` redacting `secret` from non-owners | run 600 ticks, sniffing every encoded payload addressed to seat 0 | across `600 / 6 = 100` publishes, seat 0's bytes contain `canary-7f3a` **zero** times; the byte length of seat 0's payload equals the payload without the field (a shape assertion, not just a substring one); seat 1's own local state still holds the string (privacy costs the owner nothing) |
| T1b | T1 with `view` deleted from the fixture game | same run | the canary string appears in seat 0's bytes within 6 ticks; the test asserts `> 0` so its failure text names the regression. This is the design's guard requirement (§12.4): removing `view` must turn a test red |
| T2 | 2 seats, `seatStateHz: 10`, no `view` | 60 ticks | exactly 10 `net.state` messages from each seat to the other (one per publish, not one per recipient), all with `to` absent — the no-`view` path is provably the N2 path, byte for byte |
| T2b | T2 with `view` present | 60 ticks | 10 publishes × 1 recipient = 10 `net.state` messages from each seat, each with `to` set to the recipient's seat; `seq` is 1..10 and strictly increasing per sender |
| T3 | T1's fixture, seat 1 emits `net.event { target: 'all' }` carrying its own `secret` | 1 event | seat 0 receives the event with the value intact — the reveal is the game's decision and the SDK never redacts `net.event`; the next `net.state` still carries no `secret` |
| T4 | 4 seats + one spectator, 120 ticks | run | the spectator receives no `net.state` from anyone (0 messages) and `view` was called with no spectator seat (the stub counts its arguments: exactly the seated recipients, ascending); `net.event { target: 'all' }` does reach the spectator |
| T5 | seated client, then the same client made a spectator | `bindLocalPlayer` | seated: `rig.attach` called once with `(target, seat)` and `hud(seat)` called each frame; spectator: `rig.attach` called 0 times, `hud` called 0 times, and the returned disposer does not throw |
| T6 | T1's fixture; seat 1's redacted field omitted from the slice seat 0 restores | one publish | seat 0's copy of seat 1's `secret` is unchanged (still its own reconstruction), and no other key of seat 1's slice was zeroed; `capture({ seat: 0 })` still contains seat 1 in its entity list — a redacted slice never removes an entity |
| T7 | `net.start.privateSeed` for this seat = `0x1234abcd`; the other seat's = `0x0f0f0f0f` | `rng('private')` on both | the two first draws differ; `rng('private')` on seat 0 returns a stream whose first three values are recorded in the fixture and identical across two runs of the same seed; `rng('private')` asked twice without drawing returns an identical state (idempotent per epoch); `rng('shared')` is identical on both seats and differs from `rng('private')` on the first value |
| T7b | a harness that fabricates `net.start` with no `privateSeed` for this seat (a v1 room) | `rng('private')` | throws `RangeError('no private seed for this epoch')` rather than silently falling back to the shared seed — a silent fallback would be a leak with a green test suite |
| T8 | template simulation with a per-seat `secret` (U7) | change `secret` for seat 1 by one, keep everything else | `digest()` is byte-identical before and after (the whole point of §3.6); changing seat 1's `p` by one unit changes it |
| T9 | per-recipient failure isolation | a `view` that throws for one recipient, and a `view` that returns a 9 KiB payload for another | the remaining recipient still gets its `net.state`; `failures === 1` per episode; exactly one warning per kind for the whole match (warn-once); `oversized` on the sender counts 1; the step does not throw |
| T10 | T1's fixture with an owned `sum` field | fold the words of the bytes seat 0 received and compare with the `sum` inside them | equal — a `view` that narrows the slice and carries the sender's full-slice sum fails here, which is the fold-then-filter oracle of §3.6.2 |

### 6.2 Values worth pinning in constants rather than in tests

`seatStateBytes = 8 192` (unchanged from the design; N5 only consumes it), `hash32`'s three vector rows of §3.5,
`privateSeed`'s range `[1, 2**32)`, and the `'private'` range error's message text — because the error is the only thing
a game sees when it asks for a stream it must not have.

### 6.3 What N5 does not test, and where it is tested

The room's routing of `net.state` to seated sessions only is N3's routing test (§4.6 and §6.3 S26 of the 497 spike). The
end-to-end version of T1 over a real socket is N6's four-client verify; N5's evidence is the encoded-bytes assertion,
which is the only one that can distinguish "the recipient did not happen to look" from "the recipient never had it".

## 7. Assets

None. N5 adds no model, texture, audio, font, animation, fixture asset or asset-pack entry, nothing is written to
`assets-local/`, and the first consumer's private asset library is untouched and out of scope. The only files it adds
are TypeScript and one skill document; the fixture game's "canary" is a string literal in a test, not an asset.

## 8. Evidence

| Claim | Locus | How it was checked |
| --- | --- | --- |
| The game-facing net surface has no seat, mode or rng | `packages/sdk/src/net/index.ts:16-27` | read |
| Host mode packs one snapshot for everyone, every third tick | `packages/sdk/src/net/host.ts:41-45`, `:41` | read |
| The bridge size-caps and relays but cannot inspect | `apps/web/src/net/bridge-forwarding.ts:88-127` | read |
| HUD is per-seat and local; its privacy promise is a comment, not a mechanism | `packages/contracts/src/game.ts:201-211`, `:209-210` | read |
| Camera/HUD binding already follows the local player and refreshes on every publish and frame | `packages/sdk/src/net/bind.ts:14-23` | read |
| `NetPlayer` has no `team`/`spectator`/`ready` | `packages/sdk/src/net/roles.ts:5-9` | read |
| `SeededRng.setSeed` remaps `0` to `1` | `packages/sdk/src/core/rng.ts:38-42` | read |
| The template's `applySnapshotState` merges per entity and deletes unseen ones | `templates/game-multiplayer/src/state.ts:183-195` | read; this is the §3.7 trap |
| The template's `hud` reads only that seat's entry | `templates/game-multiplayer/src/hud.ts:6-9` | read |
| A canary is already the repository's pattern for "these bytes must not reach that client", and it is counted on frames, not on rendered output | `packages/gm-verify/scenarios/two-client.ts:65-75` | read |
| No `view`, `hash32`, digest or visibility code exists anywhere yet | repository-wide grep for `hash32`, `fnv`, `view?(` | read |
| The `fold` vectors of the 496 spike are correct | computed independently in this workspace for all eight rows; all eight reproduce | recomputed |
| `hash32(seed, seat)` vectors in §3.5 | computed in this workspace with the same primitive | recomputed |
| N3 derives `privateSeed` from the shared seed | `docs/research/497-rooms.md` U7 and §3.4 (branch `aiur/502`) | read |
| `privateSeed` privacy, a canary over a real socket, and browser byte behaviour | **not measured here** | see below |

**[X] Why nothing was measured in code:** this research workspace has no Node toolchain — `node` resolves to the build
gate wrapper, which reports `command_unavailable` with exit 127 — so no test, typecheck or build was run while
researching. Every claim above is a source read or pure arithmetic. The two arithmetic claims (`fold` and `hash32`) were
recomputed here with an independent implementation, which is why they can be quoted as exact vectors.

## 9. Risks

| Risk | Impact | Mitigation | Resolved by |
| --- | --- | --- | --- |
| N3 ships `privateSeed = hash(sharedSeed, seat)`, so the "private" stream is public | A game builds a hidden draw on a stream every client can compute; the leak is invisible in every test that does not brute-force it | §3.5's correction, with exact `hash32` vectors so the two implementations agree on the public stream and the private one is an independent draw; T7/T7b assert divergence and the refusal | N3 (#497) and N2 (#496) rewrites |
| The fan-out multiplies encodes and rate-limit accounting | Dropped `net.state`, visible stutter on remote seats at four seats | `to`-addressed unicast; the rate cap is per sending session; T2 asserts the no-`view` path is still one message; the real number is measured by N6 | N5, N6 |
| A per-recipient `net.state` is broadcast instead of unicast | Recipient A receives the copy narrowed for B: the exact data `view` removed, delivered to the wrong seat | §3.2's N3 amendment (`to` in the payload and one branch in `routing.ts`), `D-N5-15`; T2b asserts `to` on every addressed publish | N3 (#497) |
| A `view` that narrows a slice carries the sender's full-slice sum | The sum becomes an oracle for exactly the redacted field while the payload looks filtered | §3.6.2's recompute rule and T10, which folds the received bytes and compares | N5 |
| A rejoin mints or re-derives a seat's `privateSeed` | A hidden draw breaks mid-match, or two different values exist for one seat in one epoch | §3.5's rejoin bullet: the room stores one `privateSeed` per seat for the epoch and re-sends that value | N3 (#497) |
| A game's `view` returns a payload that is too large for one recipient | That recipient stops receiving state while the others are fine, which looks like packet loss | Per-recipient isolation and `failures` (§4.2 rule 2), the `oversized` counter, and T9 | N5 |
| `restore` rebuilds the object it is given and zeroes redacted fields | A client fails its own checksum for a reason nothing points at | §3.7's two rules and T6; the template's merge is the worked example | N5 |
| The canary test passes trivially because the field never existed | The guard requirement of design §12.4 is unmet | T1b asserts the *removed-`view`* direction fails, and T1 asserts the byte length too, so "the field was not there" is not a pass | N5 |
| A private field in `digest()` | A permanent desync, or an oracle if it ever converged | §3.6: no private checksum scope, fold-after-filter, the breaker turns it into a pause, T8 on the template, the rule in the skill | N5 |
| A game puts a private field in `capture({})` (the shared slice) | It is broadcast in every shared recovery and compared in every checksum | §3.4's explicit "shared is not filtered, and here is why"; the checksum's failure-3 loop makes it loud; the skill rule (§3.9 limit 4) | N5, review |
| A game draws repeatedly from `rng('private')` and then reveals a value | Later draws from the same stream become guessable | §3.9 limit 2, documented in the skill; not enforceable in code | N5 (skill) |
| `view` is called once per recipient at 10 Hz and reads mutable state | Two recipients get payloads from two different ticks | §4.2 rule 1: all payloads are captured before any encoding, ascending seat order | N5 |
| A spectator's client calls `hud(null)` | A crash or a `Player NaN` HUD on the watcher screen | §3.8's spectator branch and T5 | N5 |

## 10. Open questions with defaults

Each has a recommended default so the rewritten ticket never waits on an answer. Items answered inside this document are
in §11's decision log instead.

| Question | Recommended default | Why |
| --- | --- | --- |
| Should `view` be told *which* payload it is filtering (owned publish vs recovery), e.g. a second argument? | No. One argument, and the recovery case is answered by `payloadFor(options, requester)` — the game recomputes what that requester may have | One signature, one meaning; a second argument encodes the SDK's internals into the game's API |
| Should a game be able to filter `net.checksum`? | No | There is nothing to filter: the API offers no private scope, and a per-recipient sum is already the fold of what that recipient received |
| Does the `seat`-scope sum need its own message? | No. It rides in `net.state` as design §4.6 says, folded after filtering | One message fewer, and the ordering rule is what makes it safe |
| Should `rng('private')` be per-epoch idempotent like `rng('shared')`? | Yes — same rule, same epoch boundary | A game that asks twice per frame must not advance the stream twice |
| Should a v1 room's `net.start` (no `privateSeed`) make `rng('private')` fall back to the shared seed? | No — throw | A silent fallback is a leak with a green suite (T7b) |
| Which sports a private draw needs first in the versus puzzle game | Per-seat next-piece order | It is the only hidden future the public summary supports, and it needs `private(n)` rather than a shared shuffle |
| Should the multi-client verify (N6) grow a per-seat canary? | Yes, as a fourth-client assertion, once N6 replaces the two-client scenario | N5's canary is on encoded bytes in one process; N6's is the only end-to-end proof |
| Is a spectator ever a `view` recipient? | No | A spectator has no seat and receives no `net.state`; if a game wants to reveal to watchers, that is a `target: 'all'` event |
| Does `localSeat: number \| null` break N2's draft? | It corrects it | N2 wrote `number`; a spectator has no seat, and `null` is the only honest value that cannot be confused with seat 0 |

## 11. Decision log

| ID | Decision | Why | Design reference |
| --- | --- | --- | --- |
| D-N5-1 | `view(recipient)` returns the outgoing payload; the default is `capture({ seat: localSeat })` | §5.1's two readings are not equivalent, and the other one duplicates the world | §5.1, §5.2.1 |
| D-N5-2 | One publish becomes one `to`-addressed unicast per recipient; without `view`, one broadcast | Filtering must precede encoding and the encodes differ; the no-`view` path stays byte-identical to N2 | §5.2.1, §13 Q1 |
| D-N5-3 | `view` in any mode but `per-seat` is refused at construction | Host mode cannot filter one snapshot for everyone; a false claim of privacy is worse than no feature | §9.6, §11.1 |
| D-N5-4 | Every state payload to a non-owner crosses `view`, except a `shared`-scope recovery and `net.event` | The recovery path was the unfiltered hole; a filtered shared slice would produce two shared truths | §5.2, §4.6 |
| D-N5-5 | An owned sum is folded from the slice the recipient receives, recomputed after narrowing | A sum over a redacted field is an oracle for exactly that field; T10 asserts the received bytes and the sum agree | §5.2.3, §4.6 |
| D-N5-6 | `privateSeed` is an independent per-seat draw, never derived from `seed`; `privateSeed(n)` for another seat throws | A derived private seed is public: every client holds `seed`. Corrects D-N3-6 and N2's U5 | §4.2 |
| D-N5-7 | No private checksum scope; the API cannot publish a sum of a hidden value | The simplest leak is one the API should not offer a shape for | §5.2.3 |
| D-N5-8 | A private field in `digest()` is a loud desync, not a silent oracle, and the skill says so | The SDK cannot inspect an opaque integer array; the honest enforcement is the breaker plus the documentation | §5.2.3 |
| D-N5-9 | A redacted field is absent, and `restore` merges only the keys present | Only absence is distinguishable from a legitimate zero; a rebuild would zero fields the recipient may not see | §3.3, N2 D-N2-6 |
| D-N5-10 | Camera and HUD follow `localSeat`; a spectator attaches nothing and calls no `hud` | The per-seat path exists; the only new case is having no seat | §5.1, §8.1 |
| D-N5-11 | The seven limits of §3.9 are documented in the skill, not enforced in code | All seven are properties of a game's design; a checker cannot see them, and a silent "enforced" claim would be worse | §5.3 |
| D-N5-12 | The canary asserts on encoded bytes per recipient and must fail when `view` is removed | Design §12.4 names this as the one test that needs care; a substring-only assertion passes when the field was never sent | §12.4 |
| D-N5-13 | No new manifest field declares visibility | Presence of `view` cannot drift from the code, and no consumer needs the answer | §3.1 |
| D-N5-14 | `net.event` is the only reveal, and the SDK never redacts it | A reveal is a deliberate act by the seat that holds the information; a second hook would be a second policy | §5.1 |
| D-N5-15 | N3's `net.state` gains an optional `to` and the room unicasts an addressed one | A per-recipient payload broadcast to everyone delivers B's narrowed copy to A — the exact leak `view` prevents. N2 §10 Q1 took the same default; N3 has not yet implemented it | §7.2, §9.2 |

## 12. What the rewritten #500 must say

Acceptance, restated so the ticket can be cut without re-reading this document:

1. `packages/sdk` ships `net/visibility.ts` (`payloadFor`, `encodeSeatState`) and wires it into the per-seat publish and
   the `seat`-scope recovery answer; `pnpm --filter @gm/sdk test` green, including T1–T10 of §6 and the three variants
   T1b, T2b and T7b.
2. The canary test (T1) asserts on the encoded bytes a recipient receives and T1b proves it fails with `view` removed.
3. `rng('private')` is seeded from the seat's own `net.start.privateSeed`, is idempotent per epoch, throws when there is
   no private seed, and throws when asked for another seat's stream. Two room-side changes are named as dependencies on
   #497 and not implemented here: mint `privateSeed` independently (never `hash(seed, seat)`), and re-send the same value
   on a rejoin.
4. The room carries an optional `to` on `net.state` and unicasts an addressed one (`D-N5-15`); without it N5's
   per-recipient payloads leak to the other seats.
5. A game that implements `view` in any mode but `per-seat` fails `createNetController` with
   `ModeMismatchError`/`VISIBILITY_REQUIRES_PER_SEAT`, and `boot` surfaces it as its `error` envelope.
6. `bindLocalPlayer` handles a spectator (`localSeat === null`) by attaching no camera and calling no `hud`, and its
   seated behaviour is unchanged (the existing `bind.test.ts` passes untouched).
7. `templates/game-multiplayer` implements `view` and passes a test that a private change does not move `digest()`.
8. `skills/gm-multiplayer-ready/SKILL.md` documents `view`, the reveal event, and the seven limits of §3.9, including
   that recovery cannot repair a redacted field.
9. The PR names what N5 does **not** do: no room change, no host-mode filtering, no private checksum scope, and no
   end-to-end canary (N6's). A reviewer must not read a green SDK suite as proof that a real room hides anything.

## 13. Non-goals

- The per-seat mode itself, `capture`/`restore`/`digest`, the checksum/recovery machinery and the loopback harness (N2).
  N5 composes them and adds a sniffer option.
- The room's seat table, `net.start` minting, routing and the `privateSeed` delivery mechanism (N3). N5 consumes the
  per-seat copy and names the one correction it needs.
- Host-mode prediction, rollback, transport, the diagnostics overlay and the four-client verify (design §3.5, §3.6, N4,
  N6).
- Any product screen, panel, label or copy change. The camera and HUD are the game's, inside the iframe; the studio
  screens keep their prototype design.
- A permissions or moderation model for who may spectate a room. `spectators: 'on' | 'off'` is N3's room option and
  there is no third state.
