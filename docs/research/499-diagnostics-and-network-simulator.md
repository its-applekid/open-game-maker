# Diagnostics overlay and a bad-network verify — research spike for #499 (N6)

- **Source requirement:** #504, the research spike for #499 "Diagnostics overlay and a bad-network simulator in the
  multi-client verify", which implements N6 of the netcode platform design (#495).
- **Consumed design:** `docs/plans/netcode-platform.md` — §2 (design rules 5–7), §4.3–§4.7 (the foundations the metrics
  report on), §6.1–§6.2 (the channel-typed transport seam the simulator wraps), §8 (diagnostics), §9.4 (limits), §9.7
  (bridge envelopes), §10.5 (N6's contract), §11.2 (the two-client scenario during the transition), §12 (test strategy),
  §13–§14 (risks and D-NET-14).
- **Neighbours' contracts:** #501 → #496 (N2: where `NetDiagnostics` is produced and read), #502 → #497 (N3: v2 rooms,
  seats, `net.seat.*`, pause/resume, forfeit, resume token), #503 → #498 (N4: `Transport`, `TransportStats`,
  selection), #505 → #500 (N5: what a metric may not reveal).
- **Repository evidence:** `main` at `5d05a56ff47bb4732e6957534eadba1775ccd7ad`. Every `[C]` claim names the file and
  line it was read from at that commit.
- **Deliverable:** this document. No code ships in #504; #499 is rewritten from it.
- **Evidence labels:** **[C]** read in the code at the commit above; **[D]** decision taken here, with its reason;
  **[Q]** open question carried with a recommended default; **[X]** not verified in this workspace (no Node toolchain —
  see §8).

## 1. Outcome

#499 ships three things, and nothing else:

1. **A per-seat metric set** that every client can produce about its own seat — the §8.1 table — with the five numbers
   the platform actually argues about (`localResponseMs`, `remoteUpdateMs`, `eventDelayMs`, `desyncs`, `recoveries`)
   complete rather than aspirational.
2. **A draft-only overlay and a 10 s log line** in the host app, reachable with `?net=1` on a draft or test build, drawn
   over the game iframe and absent from every published build.
3. **A four-client verify** in `packages/gm-verify` that runs four browser seats against a local v2 room, through a
   seeded link simulator that applies latency, jitter, loss, reordering and scheduled disconnects, and writes a report
   whose `seats[]` carries every metric for every seat.

The overlay is not product chrome. It is a debug surface behind a query flag, and D-NET-14 keeps it that way: no new nav,
no panel in the editor, no copy change on the title town, games selection, creation or editor screens.

| Not N6 — owner | Where it lands |
| --- | --- |
| `NetDiagnostics` fields (ticks, gaps, `localResponseMs`, `remoteUpdateMs`, `desyncs`, `recoveries`, `clockOffsetMs`) | #496 (N2) |
| v2 seats, `net.seat.online/offline/forfeit`, pause/resume, resume token, `rulesetHash` | #497 (N3) |
| `Transport`, `TransportStats`, WebRTC, transport selection | #498 (N4) |
| `view(seat)`, private streams, the visibility canary | #500 (N5) |
| Product screens, HUD, editor panels, title town | untouched |
| The v1 two-client scenario and its `host-left` assertion | kept, not replaced — §3.11 |

## 2. What exists today

Seven facts decide the shape of N6. Each is a gate in the code as it stands.

1. **Diagnostics are five counters with no per-seat surface at all.** `NetDiagnostics` is exactly `dropped`,
   `eventGaps`, `outOfOrderSnapshots`, `stalls`, `oversized` (`packages/sdk/src/net/index.ts:29-35`). [C] There is no
   RTT, no jitter, no loss estimate, no local-response sample, no desync count and no event-delivery delay.
2. **The counters already reach the host app through one existing request.** `RuntimeImpl.renderInfo()` returns
   `{ ...renderInfoProvider(), net: { ...netController.diagnostics } }` (`packages/sdk/src/core/runtime.ts:204-209`) and
   the bridge already declares `test.renderInfo` host→game (`packages/contracts/src/bridge.ts:170`). [C] N6 therefore
   needs no new envelope to read the game's metrics: the overlay polls what the test harness already reads.
3. **Published builds already refuse `test.*`.** `packages/sdk/src/core/boot.ts:184-188` answers a `test.*` request in a
   published build with `test.result { ok: false }` and never dispatches it. [C] The overlay's data path is already dead
   in a published build; gating the component is belt and braces, and the test must assert the component does not even
   ask, because a refused request is not a console error but a wasted round trip on a shipped game.
4. **Nothing measures the path.** The room client pings every 5 s and stores one number (`RoomClient` timer at
   `apps/web/src/net/room-client.ts:320-321`, `rttMs`/`setRtt` in `apps/web/src/net/room-store.ts:39,45,77-78`). [C]
   There is no jitter, no loss estimate, no byte counter and no per-seat view.
5. **A query-flag dev surface is an established pattern.** `?test` installs the room test handle
   (`apps/web/src/net/test-handle.ts:24`) and the game route reads flags from `useSearchParams`
   (`apps/web/src/routes/game/GameScreen.tsx:116`). [C] `?net=1` follows the same convention and adds no route.
6. **The verify harness is a stand-in app, not `apps/web`.** `packages/gm-verify/scenarios/two-client/harness.ts`
   mounts `@gm/host` itself, forwards `net.*` envelopes by hand, and is driven from Playwright through `window.__harness`
   (the file's header comment and `mountGame`/`hold`). [C] The simulator and the metric collection therefore live in
   `packages/gm-verify`, and the whole run is host-only: `scenarios/two-client.test.ts:13` gates it behind
   `OGM_SCENARIOS=1`, so CI can only run the pure parts.
7. **The report is a versioned, emitted schema with three constraints to respect.** `verifyReportSchema`
   (`packages/gm-verify/src/report.ts:56-95`) makes `probes` a `Record<string, number | string | boolean>` — no nested
   objects; `unchecked` must include `iPhone Safari` and `sound`; `clients` is one integer. [C] The schema is emitted to
   `packages/gm-verify/schemas/verify-report.v1.json` and `pretest` runs `emit-schema.mjs --check`, so a schema change and
   the generated file must land together. [C] (`package.json` scripts `pretest`.)

Two consequences follow. First, N6 adds a small number of fields to the SDK's diagnostics object, not a second
diagnostics channel. Second, everything else N6 must show — seats, `epoch`, `rulesetHash`, RTT, jitter, loss — comes from
the room state and the transport, and has to be joined in one place: the host app, and the harness in its place.

## 3. Design

### 3.1 What "per-seat" means without a telemetry channel

The room is a relay and stays one (design rule 1, D-NET-3). N6 adds no message in which a client uploads its metrics to
the room or to another seat: that would be a new trust surface for a debugging feature, and it would put a per-seat data
stream on the wire in a published build.

So a metric is **local**: each client measures its own seat. The overlay shows the local seat's numbers and, for the
other seats, only the facts the room already broadcasts (seat, team, connected, ready). The *verify* scenario is what
turns local metrics into a per-seat table, because it owns every page: after each step it asks each page for its own
snapshot and writes one `SeatMetrics` per seat into the report. [D]

That is the honest reading of #499's "per-seat metrics … in an overlay and logs": per-seat in the report, local in the
overlay. A second seat's RTT is not something one browser can know without the platform inventing a channel for it.

### 3.2 The metric contract

Every row below has one source and one owner. The target column is §8.1's table unchanged; the owner column is what the
implementer must not build twice.
| Metric                      | Source                                       | Unit          | Target (§8.1)                                                              | Owner   |
| --------------------------- | -------------------------------------------- | ------------- | -------------------------------------------------------------------------- | ------- |
| `buildId`, `rulesetHash`    | room state (`pin.buildId`, v2 `rulesetHash`) | string        | equal on every seat                                                        | N3 / N6 |
| `epoch`                     | SDK diagnostics + room state                 | string        | one value per match                                                        | N2 / N6 |
| `tick`                      | SDK diagnostics                              | int           | within `maxDriftTicks` = 6 of `net.tick`                                   | N2 / N6 |
| `mode`                      | SDK diagnostics                              | enum          | the game's declared authority mode                                         | N2      |
| `rttMs`                     | transport stats (`ping`/`pong` today)        | ms            | recorded; N4's selection threshold is 80 ms                                | N4 / N6 |
| `jitterMs`                  | transport stats                              | ms            | recorded                                                                   | N4 / N6 |
| `lossPct`                   | transport stats                              | %             | recorded; N4's selection threshold is 2 %                                  | N4 / N6 |
| `clockOffsetMs`             | SDK (`ClockSync`, min-RTT filter)            | ms            | stable within ±10 ms after the first 2 s                                   | N2      |
| `lateStartTicks`            | SDK start gate                               | ticks         | 0 for a seat that joins before `startAt`                                   | N2      |
| `inputDelayTicks`           | SDK input buffer                             | ticks         | 2..8, starting at 3                                                        | N2      |
| `inputGaps`                 | SDK input ring                               | count         | ≤ 1 per 10 s at 2 % loss with redundancy 3                                 | N2      |
| `localResponseMs`           | SDK step                                     | ms            | ≤ 16.7 (one step)                                                          | N2      |
| `remoteUpdateMs`            | SDK step                                     | ms            | ≤ 100 p95                                                                  | N2      |
| `eventDelayMs`              | SDK event channel — **new in N6**            | ms            | ≤ 150 p95                                                                  | N6      |
| `desyncs`                   | SDK checksum                                 | count         | 0 after a 10 s settling window                                             | N2      |
| `recoveries`, `hardResyncs` | SDK recovery                                 | count         | ≥ 1 after a reconnect; `hardResyncs` 0 when the game's `digest()` is right | N2      |
| `droppedBytes`, `oversized` | SDK codec — `droppedBytes` **new in N6**     | bytes / count | `oversized` 0                                                              | N6      |

Three of §8.1's rows have no producer even after N2: `eventDelayMs`, `droppedBytes`, and the path-quality trio
(`rttMs`/`jitterMs`/`lossPct`). [C] The first two are SDK fields N6 adds (§4.2); the trio is the transport's, which N4
owns and N6 only reads.

### 3.3 Where each number comes from

| Source | Read by | Fields |
| --- | --- | --- |
| SDK diagnostics | the overlay through `test.renderInfo`; the scenario through the harness | `mode`, `epoch`, `tick`, `lateStartTicks`, `inputDelayTicks`, `inputGaps`, `localResponseMs`, `remoteUpdateMs`, `eventDelayMs`, `clockOffsetMs`, `desyncs`, `recoveries`, `hardResyncs`, `oversized`, `droppedBytes` |
| Room state | the room store (`apps/web/src/net/room-store.ts`) and the harness's state JSON | `buildId`, `rulesetHash`, `seat`, `seats[]` (connected, ready, team), `phase` |
| Transport stats | the app's transport module (N4) and, in the harness, the link decorator | `rttMs`, `jitterMs`, `lossPct`, `bytesOut`, `bytesIn`, `drops`, `connectedMs` |

The overlay joins them in one function, `collectNetMetrics`, so the component renders and formats but never fetches. [D]
The four overlay lines are a pure function of that snapshot (§4.6), which is what makes them testable without a browser
and without a game.

### 3.4 Sampling cadence

- **Overlay:** one `test.renderInfo` round trip every 500 ms while `?net=1` is on. A bridge round trip is a
  `postMessage` pair, and 2/s is far below anything that would show up in a frame budget. [D]
- **Log:** one line per 10 000 ms window, on the same timer, so a captured log and a captured overlay can be read
  together (§8.2 of the design).
- **Report:** the harness samples its own metrics every 500 ms during the run and writes one aggregate per seat at the
  end: latest for gauges, p95 and max for the two delay metrics. [D] A single end-of-run sample would miss the impairment
  window entirely.

### 3.5 The overlay

Off by default. On when `?net=1` **and** the build is not published (`build` is `'draft' | 'test' | 'published'` in the
game route; `apps/web/src/routes/game/GameScreen.tsx:115` derives `'published'` only when the served build id equals the
published one). [C] Mounted inside the game route over the frame container: `position: absolute`, top-left, monospace
12 px, `pointer-events: none`, one translucent background, no border, no button, no title bar.

```text
seat 0/4 · per-seat · tick 1234 · epoch 3f9a · build b2 · ruleset 7c1e
rtt 41 ms · jitter 8 ms · loss 0.0% · clock +12 ms
local 16.7 ms · remote 84 ms p95 · event 96 ms p95 · delay 3 ticks · gaps 0
desync 0 · recoveries 0 · hard 0 · dropped 0 B · oversized 0
```

Four lines, one per group: identity and agreement, path quality, simulation delays, failure counters. Values that are
not yet known render as `–` rather than `0`, because "0 ms of RTT" and "not measured" must not look alike. [D]

The remote seats are not in the overlay: it has room for the local seat's numbers, and inventing rows for other seats
would show either stale room facts or fabricated numbers (§3.1). The verify report is where per-seat comparison lives.

### 3.6 The log line

While the overlay is on, the same sampler writes one line per 10 s:

```text
[ogm.net] {"t":1760000000000,"seat":0,"mode":"per-seat","epoch":"3f9a","tick":1234,"buildId":"b2","rulesetHash":"7c1e",
"rttMs":41,"jitterMs":8,"lossPct":0,"clockOffsetMs":12,"inputDelayTicks":3,"inputGaps":0,"localResponseMs":16.7,
"remoteUpdateP95Ms":84,"eventDelayP95Ms":96,"desyncs":0,"recoveries":0,"hardResyncs":0,"droppedBytes":0,"oversized":0}
```

One JSON object, the same field names as `SeatMetrics` (§4.1), so the two can be read side by side. `console.info`, not
`console.error` or `console.warn`: `ConsoleCollector` records only `error` and `warning` (`packages/gm-verify/src/console.ts:5`),
so a diagnostics line can never turn a verify verdict red. [C] No analytics POST: the log is for a human with devtools
and for a captured console, and it adds no network surface. [D]

### 3.7 The link simulator

**Placement.** Two files under `packages/gm-verify/src/link/`: `schedule.ts` (pure decisions, no clock, no clock reads)
and `transport.ts` (a decorator over the design's `Transport` interface, §6.2). The decorator wraps whatever transport the
harness page uses; today that is a thin adapter over the Colyseus room client, after N4 it is `WsRelayTransport`.

The simulator must sit above the room's own socket, not replace it. Colyseus's membership and schema-sync frames are
reliable and ordered by construction; dropping them at a proxy would test Colyseus's failure modes, not the game's. What
N6 impairs is the three game channels of §6.1, which is exactly what the transport seam defines. [D]

**Channels.** `input` and `state` are impaired: delayed, jittered, dropped and reordered. `event` is delayed only,
because §6.1 makes it reliable and ordered and the platform verifies *that promise* by never dropping it here. A future
profile can impair it (`[Q]` in §10) but the default profiles do not. [D]

**Configuration.** One value, echoed into the report as `link`, so a failing run reproduces from its seed:

```ts
export type LinkConfig = {
  seed: number;
  latencyMs: number;   // one way; the design's "latency 80 ms" is an RTT, so 40 one way
  jitterMs: number;    // ± this, uniform
  lossPct: number;     // input and state only
  reorderPct: number;  // input and state only
  disconnects: { seat: number; atMs: number; downMs: number }[];
};
```

**Determinism.** One 32-bit xorshift stream per link, three draws per message (drop, delay, reorder) so the byte stream is
a pure function of `(seed, channel, index)`. Same seed → same decisions, byte for byte, which is the property the test
asserts against a committed fixture. `performance.now()` is never read in `schedule.ts`; the decorator takes its clock as
an injected `LinkClock` (`now`, `later`) so the unit test drives it with a fake clock and no timers.

**Disconnects.** A scheduled disconnect is real: the harness closes that page's room socket and reconnects with the resume
token after `downMs`, so the step proves §4.7 (authenticated reconnect) rather than a synthetic flag. The report's
`recoveries` for that seat is the evidence.

**Test-only.** `packages/gm-verify` is a private package that no product entry point depends on. A test asserts it: no
file under `apps/web/src` other than a test may import `gm-verify`, and the same scan rejects a wall-clock read in
`src/link` (it reuses `scanFile` from `packages/gm-verify/src/gates/no-wall-clock.ts`).

### 3.8 The four-client scenario

`packages/gm-verify/scenarios/multi-client.ts` replaces the harness's two seats with four and keeps the seven assertions
of the two-client scenario. Two profiles run it: `clean` (`CLEAN_LINK`, all zeroes) and `bad` (`BAD_LINK`:
`latencyMs: 40`, `jitterMs: 20`, `lossPct: 2`, `reorderPct: 1`, disconnect seat 2 at 4 000 ms for 3 000 ms).
| Step | Action                                                     | Assertions                                                                                                                                                                                     | Probes                              |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | create a v2 room, invite three seats, all four join        | each `welcomeMs` ≤ 2 000; seats assigned 0–3; four distinct sessions                                                                                                                           | `welcomeMs`, `welcomeMs.seat1..3`   |
| 2    | the host places three entities                             | every watcher's design equals the host's at each rev                                                                                                                                           | `designRev1..3`                     |
| 3    | canary: private presence + a bad `design.tx`               | `sentFrames` ≥ 2; `leaked` = 0 in three watchers' frames                                                                                                                                       | `canarySentFrames`, `watcherFrames` |
| 4    | the primary starts the match                               | all four reach `playing` within 500 ms of the start request                                                                                                                                    | `playSwitchMs`                      |
| 5    | each of the three peers holds `{ move: 1 }` for 1 s        | each peer's avatar moves on all four renders; the primary's avatar never moves                                                                                                                 | `peerMovedPx` per seat              |
| 6    | seat 2 drops 3 s and returns; seat 3 drops past the window | `net.seat.offline` + pause everywhere; on rejoin `net.seat.online`, `recoveries` ≥ 1, resume at the same tick; seat 3 gets `net.seat.forfeit`, the room does not end, the primary is unchanged | `reconnectMs`, `forfeitMs`          |
| 7    | load the draft build                                       | all four report `draft.ready` for `b2` and the pin changes on all four                                                                                                                         | `draftPin`                          |
| 8    | collect metrics from every page                            | §3.10's bands; every seat's `seats[]` entry present; `clients: 4`                                                                                                                              | `seats`, `link`                     |

The two-client scenario's step 6 (the host leaves, the room ends `host-left`) becomes step 6 above: a v2 room does
not end when the creator leaves (D-NET-13), so the assertion moves from "the room ended" to "the seat forfeited and the
match continued". `hostLeftEndedMs` therefore stays a **v1** probe and is not produced by the multi-client scenario. That
is the one place the four-client run is not a superset of the two-client one, and it is why the two-client scenario is
kept (§3.11).

### 3.9 Report additions

`verifyReportSchema` gains two fields and keeps every existing one:

- `seats: SeatMetrics[]` (default `[]`) — one entry per seat, §4.1.
- `link?: LinkConfig` — the profile the run used, when the run had a simulator.

Both are additive with defaults, so every report written before N6 still parses, and acceptance check 16's fields
(`frames`, `probes`, `clients`, `unchecked`, `verdict`) keep their meaning and their probe names. `summaryLines` gains
exactly one line, and only when `seats.length > 0`, so an old report's `summary.txt` stays byte-identical:

```text
seats 4 desyncs 0 recoveries 1
```

The emitted schema (`packages/gm-verify/schemas/verify-report.v1.json`) is regenerated by
`pnpm --filter @ogm/gm-verify emit`; CI's `pretest` runs `emit-schema.mjs --check` and fails without it. [C]

### 3.10 Comparing numbers to targets

The §8.1 targets describe the relay baseline. A run that is *deliberately* impaired cannot be held to them — 80 ms of
simulated RTT plus one hop is already more than the 150 ms event budget — so the two profiles are judged differently: [D]

- **clean:** `localResponseMs ≤ 17` on every seat, `remoteUpdateP95Ms ≤ 100`, `eventDelayP95Ms ≤ 150`, `desyncs` 0 after
  the 10 s settling window, `inputGaps ≤ 1`, `oversized` 0, `droppedBytes` 0.
- **bad:** `localResponseMs ≤ 17` still (it never crosses the link), `remoteUpdateP95Ms ≤ 100 + latencyMs + 2 × jitterMs`,
  `eventDelayP95Ms ≤ 150 + latencyMs + 2 × jitterMs`, `desyncs` 0 after settling, `inputGaps ≤ 2`, `recoveries ≥ 1` on
  every reconnected seat, `hardResyncs` 0.

Writing the impairment into the bound, and echoing the profile in `link`, is what makes the bad run a real assertion
instead of a number the reviewer has to trust.

### 3.11 Keeping the v1 two-client scenario

§10.5 of the design has the four-client scenario replace `two-client/`. This spike recommends **keeping both** and says
so plainly, because the replacement would delete an evidence path the V1 acceptance record depends on: check 16
(`docs/plans/ogm-v1-build/acceptance.md:33`) names the two-client verify report and its `host-left` assertion, and that
behaviour belongs to v1 rooms, which v2 rooms deliberately drop (D-NET-13). [D]

So: `two-client` stays, pinned to a v1 room option (N3 owns that pin, design §11.2), and its seven assertions stay
exactly as they are; `multi-client` is added beside it. The `gm-multiplayer-ready` skill points at `multi-client` for a
v2 game and at `two-client` for a v1 game, in one sentence each.

## 4. Interfaces

### 4.1 `packages/gm-verify/src/report.ts` (additive)

```ts
export const linkProfileSchema = z.object({
  seed: z.number().int(),
  latencyMs: z.number().min(0).max(1_000),
  jitterMs: z.number().min(0).max(1_000),
  lossPct: z.number().min(0).max(100),
  reorderPct: z.number().min(0).max(100),
  disconnects: z
    .array(z.object({ seat: z.number().int().min(0).max(7), atMs: z.number().min(0), downMs: z.number().min(0) }))
    .max(8),
});
export type LinkProfile = z.infer<typeof linkProfileSchema>;

export const seatMetricsSchema = z.object({
  seat: z.number().int().min(0).max(7),
  buildId: z.string().min(1),
  rulesetHash: z.string().optional(),
  epoch: z.string().optional(),
  mode: z.enum(['host', 'per-seat', 'rollback']),
  tick: z.number().int().min(0),
  rttMs: z.number().min(0),
  jitterMs: z.number().min(0),
  lossPct: z.number().min(0).max(100),
  clockOffsetMs: z.number(),
  lateStartTicks: z.number().int().min(0),
  inputDelayTicks: z.number().int().min(0),
  inputGaps: z.number().int().min(0),
  localResponseMs: z.number().min(0),
  remoteUpdateP95Ms: z.number().min(0),
  eventDelayP95Ms: z.number().min(0),
  desyncs: z.number().int().min(0),
  recoveries: z.number().int().min(0),
  hardResyncs: z.number().int().min(0),
  droppedBytes: z.number().int().min(0),
  oversized: z.number().int().min(0),
});
export type SeatMetrics = z.infer<typeof seatMetricsSchema>;

export const verifyReportSchema = z.object({
  // every existing field unchanged …
  clients: z.number().int().min(1),
  seats: z.array(seatMetricsSchema).max(8).default([]), // added
  link: linkProfileSchema.optional(), // added
  // … unchecked, verdict, error, startedAt, endedAt, gmVerifyVersion unchanged
});
```

No `userId` and no display name in a `SeatMetrics`: the seat index is the identity a multiplayer report needs, and an
account id in a report file under `shots/` is a leak for no gain. [D]

### 4.2 `packages/sdk/src/net/diagnostics.ts` (new file)

The type moves here so the file that produces it stays readable, and `index.ts` re-exports it so no existing import
breaks:

```ts
export interface NetDiagnostics {
  // v1 counters, unchanged
  dropped: number;
  eventGaps: number;
  outOfOrderSnapshots: number;
  stalls: number;
  oversized: number;
  // N2 (#496)
  mode: AuthorityMode;
  epoch: string;
  tick: number;
  lateStartTicks: number;
  inputDelayTicks: number;
  inputGaps: number;
  lateInputs: number;
  localResponseMs: number;
  remoteUpdateMs: number;
  clockOffsetMs: number;
  clockResyncs: number;
  desyncs: number;
  recoveries: number;
  hardResyncs: number;
  desynced: boolean;
  // N6 (#499)
  eventDelayMs: number; // the most recent delivery; 0 before the first
  eventDelayP95Ms: number; // nearest-rank p95 over the last EVENT_DELAY_SAMPLES deliveries
  droppedBytes: number; // bytes the codec refused
}

export const EVENT_DELAY_SAMPLES = 120;

export class EventDelayRing {
  constructor(readonly capacity: number = EVENT_DELAY_SAMPLES);
  add(delayMs: number): void; // ignores a negative or non-finite sample
  readonly latest: number;
  readonly p95: number; // 0 when empty
  readonly samples: number;
}
```

Wiring: `net/index.ts` stamps each outgoing event's sequence with `options.now()` and hands the ring the difference when
`deliverAvailableEvents` emits it; `oversized()` adds the refused byte count to `droppedBytes`. `zeroNetDiagnostics()`
(`packages/sdk/src/core/runtime.ts:263`) gains the three fields, and the exact-shape assertion at
`packages/sdk/src/test/hooks.test.ts:176-183` is updated — it is an `toEqual`, so it goes red the moment a field is added.
[C]

### 4.3 `packages/gm-verify/src/link/schedule.ts` (new)

```ts
export type ChannelName = 'input' | 'state' | 'event';
export type Disconnect = { seat: number; atMs: number; downMs: number };
export type LinkConfig = {
  seed: number;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  reorderPct: number;
  disconnects: Disconnect[];
};
export type Delivery = { dropped: boolean; delayMs: number; reordered: boolean };

/** Pure: the same (config, channel, index) always yields the same delivery. */
export function createLinkSchedule(config: LinkConfig): (channel: ChannelName, index: number) => Delivery;

export const CLEAN_LINK: LinkConfig; // { seed: 1, latencyMs: 0, jitterMs: 0, lossPct: 0, reorderPct: 0, disconnects: [] }
export const BAD_LINK: LinkConfig; // seed 1234, 40 ms one way, ±20 ms, 2 % loss, 1 % reorder, seat 2 down at 4 s for 3 s
```

### 4.4 `packages/gm-verify/src/link/transport.ts` (new)

```ts
export type LinkClock = { now(): number; later(ms: number, run: () => void): () => void };

export type LinkTransportOptions = {
  inner: Transport; // the design's §6.2 seam
  config: LinkConfig;
  clock: LinkClock;
};

export class LinkTransport implements Transport {
  readonly kind: TransportKind;
  open(handlers: TransportHandlers): Promise<void>;
  send(channel: ChannelName, bytes: Uint8Array): void;
  stats(): TransportStats; // inner numbers plus applied drops and the measured applied delay
  close(reason: string): void;
  /** Closes the inner transport now and reopens it after `downMs`; the harness's reconnect path drives the resume token. */
  drop(downMs: number): void;
}
```

**One contract question this raises.** §6.2 declares `Transport`, `TransportHandlers`, `TransportStats` and
`TransportKind` inside `apps/web/src/net/transport/types.ts`, which a test-only package must not import. [D] Those five
declarations move into `packages/contracts/src/net.ts` (same contract family, appended to `src/index.ts`), and N4's file
re-exports them; whoever of N4/N6 lands first does the move. The alternative — a structural duplicate plus an
assignability test — costs a second source of truth for four types and buys nothing.

### 4.5 `packages/gm-verify/scenarios/multi-client/harness.ts` (new page)

```ts
export type HarnessNetDraft = Omit<SeatMetrics, 'remoteUpdateP95Ms' | 'eventDelayP95Ms'> & {
  remoteUpdateMs: number;
  eventDelayMs: number;
};

export type HarnessApi = {
  join(input: JoinInput): Promise<void>;
  netMetrics(): Promise<HarnessNetDraft>; // one snapshot: test.renderInfo + room state + link stats
  seats(): { seat: number; connected: boolean; ready: boolean; team: number }[];
  link: { config(): LinkConfig | undefined; drop(downMs: number): void };
  // the two-client harness's existing surface (join, play, hold, send, renderGameToText, loadDraft, …)
};
```

The harness polls `netMetrics()` every 500 ms while the match runs and keeps the per-seat p95/max itself, so the
scenario only asks for the aggregate at the end of each step.

### 4.6 `apps/web`: the data layer

```ts
// apps/web/src/net/diagnostics/metrics.ts
export type NetInfoSnapshot = {
  net: NetDiagnostics; // from the game, via test.renderInfo
  room: { buildId?: string; rulesetHash?: string; seat?: number; epoch?: string; phase?: string };
  transport: { rttMs: number; jitterMs: number; lossPct: number };
};
export function collectNetMetrics(sources: NetInfoSources): Promise<NetInfoSnapshot | undefined>;
export function metricLines(snapshot: NetInfoSnapshot): string[]; // the four lines of §3.5, exactly
export function logLine(snapshot: NetInfoSnapshot, now: number): string; // the §3.6 JSON line

// apps/web/src/net/diagnostics/useNetMetrics.ts
export function useNetMetrics(options: {
  read: () => Promise<NetInfoSnapshot | undefined>;
  intervalMs?: number;
}): NetInfoSnapshot | undefined;

// apps/web/src/features/editor/frame.ts (additive member)
export type GameFrameController = {
  // existing members unchanged
  /** `test.renderInfo`, or undefined when the game refused it (published build) or did not answer in time. */
  netInfo(timeoutMs?: number): Promise<unknown>;
};
```

### 4.7 `apps/web/src/net/diagnostics/DiagnosticsOverlay.tsx` (new)

```tsx
export type DiagnosticsOverlayProps = {
  enabled: boolean;
  build: 'draft' | 'test' | 'published';
  read: () => Promise<NetInfoSnapshot | undefined>;
  intervalMs?: number;
};

/** Renders null when `!enabled` or `build === 'published'`, before it starts any timer. */
export function DiagnosticsOverlay(props: DiagnosticsOverlayProps): ReactElement | null;
```

`GameScreen` passes `enabled={searchParams.get('net') === '1'}` and `build={build}`:

```tsx
<DiagnosticsOverlay enabled={searchParams.get('net') === '1'} build={build} read={() => frameController.netInfo()} />
```

## 5. Implementation units

Each unit is one commit-sized change with its own tests. "Fails without it" names the test that proves the unit is
load-bearing.
| #       | Files                                                                                                                                                                                               | Change                                                                                                                                                                                         | Tests                                                                                                                                                                 | Fails without it                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **U1**  | `packages/gm-verify/src/report.ts`, `packages/gm-verify/schemas/verify-report.v1.json`, `packages/gm-verify/test/report.test.ts`                                                                    | `seatMetricsSchema`, `linkProfileSchema`, `seats`, `link`, and the conditional `seats …` summary line                                                                                          | a seat entry round-trips; a report without `seats` parses to `[]`; `lossPct: 101` is rejected; the committed v1 report fixture parses and summarises byte-identically | the defaults/old-fixture test                                        |
| **U2**  | `packages/sdk/src/net/diagnostics.ts` (new), `packages/sdk/src/net/index.ts`, `packages/sdk/src/core/runtime.ts`, `packages/sdk/src/test/hooks.test.ts`, `packages/sdk/src/net/diagnostics.test.ts` | `EventDelayRing`, `eventDelayMs`, `eventDelayP95Ms`, `droppedBytes`; stamp and measure in `sendEvent`/`deliverAvailableEvents`; zero-diagnostics and exact-shape updates                       | T3's ring vectors; an oversized event adds its bytes to `droppedBytes`                                                                                                | the p95 vector and the `droppedBytes` assertion                      |
| **U3**  | `packages/gm-verify/src/link/schedule.ts`, `packages/gm-verify/test/link-schedule.test.ts`, `packages/gm-verify/fixtures/link/seed-1234.json`                                                       | The seeded pure schedule and its two profiles                                                                                                                                                  | T1: the fixture replays exactly; a different seed differs; `lossPct: 0` never drops; `event` never drops at 50 % loss                                                 | the fixture replay                                                   |
| **U4**  | `packages/gm-verify/src/link/transport.ts`, `packages/gm-verify/test/link-transport.test.ts`                                                                                                        | The decorator over `Transport`, with an injected clock                                                                                                                                         | T2: delay in `[latency - jitter, latency + jitter]`; a dropped input never arrives; reordering never crosses the event channel; `stats()` reports bytes and drops     | the fake-clock delay and the dropped-input assertions                |
| **U5**  | `packages/gm-verify/scenarios/multi-client/harness.ts`, `.html`, `rooms.ts`                                                                                                                         | Four-seat harness page: v2 room client, `net.*` forwarding for the v2 names, metric polling, `drop`/rejoin, `seats()`                                                                          | exercised by T8/T9 (host-only)                                                                                                                                        | T8's per-seat metrics, which only exist if the harness collects them |
| **U6**  | `packages/gm-verify/scenarios/multi-client.ts`, `packages/gm-verify/scenarios/scenario.ts`                                                                                                          | The four-client scenario; the CLI gains `multi-client` and `--link clean` / `--link bad` / `--link @<file>`                                                                                    | T8/T9 (host-only); the CLI usage text                                                                                                                                 | the usage assertion and the scenario itself                          |
| **U7**  | `packages/gm-verify/scenarios/multi-client.test.ts`                                                                                                                                                 | Host-only test behind `OGM_SCENARIOS=1`, running `clean` then `bad`                                                                                                                            | T8 and T9                                                                                                                                                             | both runs                                                            |
| **U8**  | `apps/web/src/net/diagnostics/metrics.ts`, `useNetMetrics.ts`, `log.ts`, `apps/web/src/net/diagnostics/metrics.test.ts`, `log.test.ts`                                                              | `collectNetMetrics`, `metricLines`, `logLine`, the 500 ms/10 s sampler                                                                                                                         | T6 exact line set; T7 one line per 10 s with the metric field names                                                                                                   | the exact-line and cadence assertions                                |
| **U9**  | `apps/web/src/net/diagnostics/DiagnosticsOverlay.tsx`, `GameScreen.tsx`, `apps/web/src/features/editor/frame.ts`, `DiagnosticsOverlay.test.tsx`                                                     | The overlay component, the route wiring, `frame.netInfo()`                                                                                                                                     | T5 gating; the overlay renders the four lines for a fixed snapshot                                                                                                    | T5: without the gate, a published build renders and requests         |
| **U10** | `packages/gm-verify/test/link-is-test-only.test.ts`, `apps/web/src/net/diagnostics/published.test.tsx`                                                                                              | A scan of `apps/web/src` for `gm-verify` imports and the simulator's own no-wall-clock check; the published-build assertion                                                                    | T10, and T5's second half (zero `test.renderInfo` requests in a published build)                                                                                      | the scan and the request-count assertion                             |
| **U11** | `skills/gm-multiplayer-ready/SKILL.md`, `skills/gm-multiplayer-ready/references/convert-single-to-multiplayer.md`                                                                                   | The "Two-client verify" section becomes "Multi-client verify": `scenario multi-client --game <dir> --link bad`, `clients: 4`, and one sentence naming the v1 `two-client` command for v1 games | documentation; checked by review                                                                                                                                      | —                                                                    |

Ordering: U1–U4 are pure and land first (schema, SDK, schedule, decorator — each testable without a browser), then U5
and U6 together (the harness and the scenario that drives it), then U7, then U8–U10 (the app surface), then U11. U2
lands after N2's diagnostics change, not beside it: both edit `NetDiagnostics` and the same exact-shape test.

## 6. Test scenarios with expected values

T1–T7 run in Node, in the normal `pnpm --filter @ogm/gm-verify test` and `pnpm --filter @ogm/sdk test` runs. T8 and T9
need Chromium and a built rooms service and stay behind `OGM_SCENARIOS=1`, exactly as the two-client run does today. [C]

- **T1 — the schedule is deterministic given its seed.** 200 `input` decisions at `BAD_LINK` replay the committed
  fixture byte for byte (`packages/gm-verify/fixtures/link/seed-1234.json`); the same config built twice yields the same
  200 decisions; a config with seed 1235 differs from the fixture in at least one decision; `CLEAN_LINK` yields
  `dropped: false`, `delayMs: 0`, `reordered: false` for every index; at `lossPct: 50` the `event` channel still drops
  none of 200.
- **T2 — the decorator applies the schedule and only on impair-able channels.** With a fake clock, `latencyMs: 40`,
  `jitterMs: 0`: a message sent at `t = 0` is delivered at `t = 40`, exactly. With `jitterMs: 20`: every delivery lands
  in `[20, 60]`. A scheduled drop never reaches the handler (0 calls out of 1 send). At `reorderPct: 50` the `event`
  channel delivers in send order for 100 messages. `stats().drops` equals the number of dropped sends, and
  `stats().bytesOut` equals the summed byte lengths of the delivered sends.
- **T3 — the SDK event-delay ring.** Adding 100 samples with delays `1..100` gives `latest = 100`, `p95 = 95`
  (nearest rank, `ceil(0.95 × 100) = 95`) and `samples = 100`; a 121st sample evicts the oldest and keeps
  `samples = 120`; a negative or `NaN` sample is ignored (count unchanged); `eventDelayMs` is `0` and `p95` is `0` before
  the first delivery.
- **T4 — the widened report schema is additive.** A report with `seats` omitted parses and yields `seats: []`; a report
  with `link` omitted parses; `lossPct: 101` is rejected; `seat: 8` is rejected; the committed v1 report fixture from
  acceptance check 16 still parses and `summaryLines` on it is byte-identical to today's output.
- **T5 — the overlay is inert outside a draft build.** `enabled: true`, `build: 'published'`: renders `null`, the `read`
  spy is called 0 times, and no timer is started. `enabled: false`, `build: 'draft'`: `null`, 0 reads. `enabled: true`,
  `build: 'draft'`: the four lines render and `read` is called once per `intervalMs`.
- **T6 — the four lines are exact.** Given a fixed snapshot, `metricLines` returns exactly:

  ```text
  seat 0/4 · per-seat · tick 1234 · epoch 3f9a · build b2 · ruleset 7c1e
  rtt 41 ms · jitter 8 ms · loss 0.0% · clock +12 ms
  local 16.7 ms · remote 84 ms p95 · event 96 ms p95 · delay 3 ticks · gaps 0
  desync 0 · recoveries 0 · hard 0 · dropped 0 B · oversized 0
  ```

  and a snapshot with an unknown `rttMs` renders `rtt – ms · …` rather than `0`. No fifth line and no other punctuation.

- **T7 — one log line per 10 s, with the metric names.** With fake timers, 9 999 ms produce 0 lines, 10 000 ms produce 1
  and 25 000 ms produce 2; `JSON.parse` of a line has exactly the `SeatMetrics` field names plus `t`, and an
  `expect(Object.keys(parsed).sort())` list pins them so a rename cannot slip through.
- **T8 — four clients on a clean link.** Every `welcomeMs` ≤ 2 000; `playSwitchMs` ≤ 500; the canary leaks into 0
  frames of three watchers; the three design revs match on all four clients; `report.clients === 4`;
  `report.seats.length === 4`; on every seat `localResponseMs ≤ 17`, `remoteUpdateP95Ms ≤ 100`, `eventDelayP95Ms ≤ 150`,
  `desyncs === 0`, `inputGaps ≤ 1`, `oversized === 0`, `droppedBytes === 0`; `report.verdict === 'pass'`; 28
  screenshots written.
- **T9 — four clients on a bad link.** `BAD_LINK`: seat 2's `recoveries ≥ 1` after its 3 s drop and its `desyncs === 0`
  after settling; seat 3 receives `net.seat.forfeit` and the room does **not** end; the primary seat is unchanged;
  `localResponseMs ≤ 17` on every seat; `remoteUpdateP95Ms ≤ 180` and `eventDelayP95Ms ≤ 230` (the §3.10 bounds with
  `latencyMs + 2 × jitterMs = 80`); `inputGaps ≤ 2`; `report.link.seed === 1234`; `report.verdict === 'pass'`.
- **T10 — the simulator is test-only.** A scan of `apps/web/src` (excluding `*.test.*`) reports no `gm-verify` import,
  and reports one when a fixture file that imports it is added; the same scan over `packages/gm-verify/src/link`
  reports no `Date.now`, `performance.now` or `Math.random`.
- **T11 — the v1 two-client scenario is unchanged.** The existing `scenarios/two-client.test.ts` run passes as it does
  today and its report parses under the widened schema with `seats: []`.
- **T12 — nothing else in the report moves.** For the committed check-16 fixture: same `probes` keys, same `clients`,
  same `unchecked`, same `verdict`, and `frames` unchanged.

## 7. Assets

No game asset, no art, no audio, no licence and nothing under `assets-local/` is added or touched. The run's artifacts
are the ones the scenario already writes, plus:

- `shots/multi-client/steps/<step>-seat<0..3>.png` — 28 screenshots at 960 × 600, the same viewport the two-client
  scenario uses; roughly 3–5 MB per run.
- `shots/multi-client/report.json` and `summary.txt` — the report, now carrying `seats` and `link`.
- `packages/gm-verify/fixtures/link/seed-1234.json` — the committed 200-decision fixture, about 4 KB of JSON.

## 8. Evidence

**Read for this document.** `docs/plans/netcode-platform.md` (§2, §4.3–§4.7, §6.1–§6.5, §8, §9.4, §9.7, §10.5, §11.2,
§12, §13, §14); `docs/plans/ogm-v1-build/acceptance.md:33` (check 16) and `deferred-findings.md:31`;
`packages/sdk/src/net/index.ts`, `peer.ts`, `codec.ts`; `packages/sdk/src/core/runtime.ts`, `boot.ts`;
`packages/sdk/src/test/hooks.test.ts`; `packages/contracts/src/bridge.ts`, `room.ts`;
`apps/web/src/net/{bridge-forwarding.ts,room-client.ts,room-store.ts,test-handle.ts}`;
`apps/web/src/routes/game/GameScreen.tsx`; `apps/web/src/features/editor/frame.ts`;
`packages/host/src/{frame.ts,overlay.ts}`; `packages/gm-verify/src/{report.ts,console.ts,run.ts}`;
`packages/gm-verify/scenarios/{scenario.ts,two-client.ts,two-client.test.ts,two-client/harness.ts}`;
`packages/gm-verify/test/{report.test.ts,no-wall-clock.test.ts}`; `services/rooms/src/game-room.ts`, `lifecycle.ts`;
`skills/gm-multiplayer-ready/SKILL.md`, `references/convert-single-to-multiplayer.md`.

**Not verified here [X].** This workspace has no Node toolchain: `node` reports
`aiur_build_gate … command_unavailable … status=127` and `pnpm` is not on `PATH`, so no `pnpm lint`, `pnpm test`,
`pnpm typecheck` or scenario run was performed for #504. The document is docs-only by design, so the implementer runs
these against the change in #499:

```bash
pnpm --filter @ogm/gm-verify test          # schedule, decorator, report (T1–T4, T10–T12)
pnpm --filter @gm/sdk test                 # the event-delay ring (T3)
pnpm --filter @ogm/web test                # overlay gating, lines, log cadence (T5–T7)
OGM_SCENARIOS=1 pnpm --filter @ogm/gm-verify test scenarios/multi-client.test.ts   # T8, T9 on a host
```

The one thing this spike *did* verify mechanically is that no host name, tailnet node, service account, user name or
home path appears in this file: a Python port of `.github/scripts/check-host-names.mjs` reports 0 hits over it. [X] no
Node needed for that check, but it is not the repo's own script.

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Four browser contexts on one machine | CPU and memory pressure makes real-time assertions drift, and CI cannot run it | one browser, four contexts, 960 × 600, screenshots only at step boundaries; host-only behind `OGM_SCENARIOS=1`; `loadavg1` stays in `probes` as the two-client scenario already records it |
| Impairment applied at the wrong layer | dropping Colyseus membership or schema-sync frames would test Colyseus, not the game | the decorator wraps the transport and impairs only the three game channels; the room's own socket is untouched |
| Real-time assertions flake on a loaded host | false red runs | assert the delay bounds on the pure schedule (T1) and the orderings on a fake clock (T2); the browser run asserts §3.10's bands, which carry the impairment as headroom |
| The overlay reaching a published build | a debug surface inside a shipped game | the component gates on `build !== 'published'`; T5 asserts no render and no request; the SDK independently refuses `test.*` in a published build (`packages/sdk/src/core/boot.ts:184-188`) |
| Report shape churn | acceptance check 16's evidence path | additive fields with defaults; T4 and T12 pin the old fixture and the summary text |
| Deleting the two-client scenario | the v1 evidence path disappears | kept beside the new one (§3.11) |
| Screenshot volume | 28 PNGs per run in `shots/` | one screenshot set per step, not per assertion; the directory is already outside the repo's tracked files |
| `pauseOnDisconnect` pausing the match mid-measurement | delay samples collected across a pause look like a stall | the scenario samples only inside running windows and records the pause boundary as a probe |

## 10. Open questions, with the default taken

| Question | Default taken here | Why |
| --- | --- | --- |
| Should loss reach the event channel? | No. `event` is delayed only. | §6.1 makes it reliable and ordered; dropping it would test a path the platform promises does not exist. A future `--link` profile can opt in. |
| Second overlay surface in edit mode? | No. Play mode only. | §8.2 and D-NET-14 keep it out of the editor screens; the editor has its own debug affordances. |
| p95 or max for the delay metrics? | Both: p95 in `seats[]`, max in `probes`. | The targets are p95; the max is what a reviewer wants when p95 is just inside the bound. |
| Where do the 10 s log lines go? | `console.info` only. | No analytics POST, so no new network surface and no data leaving the machine for a debug feature. |
| Does `multi-client` replace `two-client`? | No. Both stay. | §3.11: check 16 depends on the v1 report and its `host-left` assertion. |
| Seat identity in a report? | Seat index only. | A report under `shots/` is shared in reviews; an account id there is a needless leak. |
| Model a mid-match transport switch (`net.transport`)? | Not in N6. | N4 owns selection and its own tests; N6 records the transport `kind` per seat and leaves switching alone. |
| Should the harness assert on `droppedBytes` on the clean link? | Yes, as `=== 0`. | Any drop on a clean link is a codec bug, not impairment. |

## 11. Decisions taken in this spike

| ID | Decision | Why |
| --- | --- | --- |
| D-N6-1 | Metrics are local per client; the verify scenario joins them into a per-seat table | No telemetry channel on the relay (§3.1), and per-seat comparison is a verification need, not a runtime one |
| D-N6-2 | The v1 `two-client` scenario is kept beside the new `multi-client` one | Acceptance check 16's evidence path depends on it, and a v2 room does not reproduce `host-left` |
| D-N6-3 | The link simulator decorates the transport seam and impairs only the three game channels | Tests the game's resilience, not Colyseus's; keeps the room protocol's own reliability intact |
| D-N6-4 | `Transport`, `TransportHandlers`, `TransportStats`, `TransportKind`, `ChannelName` live in `packages/contracts/src/net.ts` | A test-only package must not import app source, and two declarations of the same seam is a drift bug waiting to happen |
| D-N6-5 | Two profiles (`clean`, `bad`) judged by different bounds, with the impairment written into the bad bound | A simulated 80 ms RTT cannot meet a 150 ms relay budget; the bound must move with the profile or the run is theatre |
| D-N6-6 | The overlay gates on `build !== 'published'` **and** `?net=1`, and asserts it makes no request when published | A refused `test.*` request is still a round trip on a shipped game; the gate is the contract, the SDK refusal is the backstop |
| D-N6-7 | `eventDelayMs` and `droppedBytes` are the only SDK diagnostics N6 adds | Everything else §8.1 lists exists in N2's set or comes from the room or the transport |
| D-N6-8 | Report additions are `seats[]` and `link`, both additive with defaults; one conditional summary line | Keeps check 16's report parsable and its summary byte-identical |
| D-N6-9 | The log line is `console.info`, never `console.error`/`warn` | `ConsoleCollector` records only errors and warnings, so a diagnostics line must never colour a verdict |
| D-N6-10 | Disconnects are real socket closes with a resume-token reconnect, not a simulated flag | The step then proves N3's reconnect path, which is the part most likely to break |

## 12. What the rewritten #499 must say

The Executor's rewrite should carry these lines as the acceptance and the write surface. Each is checkable from the
diff and the report.

1. Deliver a per-seat metric set covering every row of §3.2, with `eventDelayMs` and `droppedBytes` added to
   `NetDiagnostics` and the exact-shape assertion at `packages/sdk/src/test/hooks.test.ts:176-183` updated.
2. Deliver a draft-only overlay behind `?net=1` with the four lines of §3.5, plus one JSON log line per 10 s (§3.6). It
   must render nothing and make no `test.renderInfo` request in a published build.
3. Deliver `packages/gm-verify/src/link/{schedule,transport}.ts`: a seeded, pure schedule and a decorator over the
   transport seam, test-only, with no wall-clock read in the schedule.
4. Deliver `packages/gm-verify/scenarios/multi-client.ts` and its harness: four seats, the eight steps of §3.8, and the
   `clean` and `bad` profiles, keeping the two-client scenario untouched.
5. Extend `verifyReportSchema` with `seats[]` and `link` only, regenerate the emitted schema, and keep every existing
   report field and probe name.
6. Pass, on a host, `OGM_SCENARIOS=1 … scenarios/multi-client.test.ts` for both profiles, and attach the two report
   paths to the PR.
7. Pass `pnpm --filter @ogm/gm-verify test`, `pnpm --filter @gm/sdk test`, `pnpm --filter @ogm/web test`, and the repo
   gates `pnpm lint`, `pnpm typecheck`, `pnpm build`.
8. Write surface: `packages/gm-verify/**`, `packages/sdk/src/net/{diagnostics.ts,index.ts}`,
   `packages/sdk/src/core/runtime.ts`, `packages/contracts/src/net.ts` (the transport declarations only),
   `apps/web/src/net/diagnostics/**`, `apps/web/src/routes/game/GameScreen.tsx`,
   `apps/web/src/features/editor/frame.ts`, `skills/gm-multiplayer-ready/**`. Nothing in `docs/plans/`, no new
   dependency, no provider key, no deployment.
9. Do not restyle any screen. The overlay is the only new surface, it is behind a flag, and the title town, games
   selection, creation, editor and chat panel are untouched.
