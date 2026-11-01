# OGM-054 plan — SDK net layer

## 1. Problem frame

Game code must be multiplayer-shaped from the first template (E04-15, R78) without knowing about rooms: it implements `MultiplayerHooks` and reads `gm.net`. This ticket is the SDK side of the wire: it turns `net.*` bridge messages into role, player list, per-player input on the host and interpolated state on peers, and emits snapshots and events at fixed rates. Single player is the degenerate case with one host and no traffic, so one code path serves both.

Requirements trace:
- R75 → `input-codec.ts` (wire `InputFrame` ≤ 256 B), `host.ts` (`onInput` with server-stamped `playerIndex`, 20 Hz snapshots, reliable events), `peer.ts` (interpolation), caps from `LIMITS`.
- R78 → `GmNet` is what `gm-multiplayer-ready` teaches and the multiplayer template uses; single player is the same game; `renderGameToText().players` works for ≥ 2.

## 2. Patterns to follow

- `packages/sdk/src/core/clock.ts` and `packages/sdk/src/core/runtime.ts` (OGM-022, new): fixed-step subscription, RNG seeding, how areas receive the bridge port; copy the area module shape (`src/<area>/index.ts` exporting a factory).
- `packages/sdk/src/input/merge.ts` (OGM-025, new): per-player `ActionFrame` merge; the net host path feeds frames in through the same function with `source: 'network'`.
- `packages/sdk/src/camera/*` (OGM-025): `CameraRig.attach(target, playerIndex)`; `bind.ts` calls it, never re-implements a rig.
- `packages/contracts/src/room.ts` (OGM-050): `InputFrame`, `LIMITS`, `net.*` payload schemas; `packages/contracts/src/game.ts` (OGM-020): `MultiplayerHooks`, `GmTestHooks.renderGameToText().players`.
- `/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/site/js/dungeon.js` lines 755–865 (verified): the separated input/sim/render loop; read for shape, do not port.

Repository conventions: pnpm workspace; package scripts `build`, `test`, `typecheck`, `lint`; Vitest with pure fixtures (no browser); Playwright on `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` with `GM_VERIFY_SOFTWARE_GL=1` fallback only for the conformance run (OGM-029); every service binds `127.0.0.1` (n/a); secrets only from `packages/config` names (none here); no dependency under 1k stars without a named exception (none added); PR first line `Closes #<issue>`; `## Local tests` with policy, tested head SHA, base, selection, commands, results.

## 3. Implementation units

### U1 — Roles, players and the `GmNet` surface

Goal: `gm.net` object with role, local index, players and join/leave callbacks.
Files: Create `packages/sdk/src/net/index.ts`, `packages/sdk/src/net/roles.ts`; Modify `packages/sdk/src/index.ts` (one re-export line); Test `packages/sdk/src/net/roles.test.ts`.
Approach:
- `createNet(deps: { port: BridgePort; clock: FixedClock; rng: SeededRng; instance: () => GameInstance; manifest: GameManifest })` returns `{ net: GmNet, dispose }` and internally `attachHost`/`attachPeer` by role.
- `roles.ts` subscribes to `net.role` and `net.players`; keeps `players` sorted by `playerIndex`.
- Diff the previous list to fire `onPlayerJoined`/`onPlayerLeft`; on the host call `instance().mp.spawn(index, id)` / `mp.despawn(id)` with host-minted `id = `p${index}`` kept in a map (rule 3).
- Defaults before any message: `role: 'host'`, `localPlayerIndex` from `hello.playerIndex` (OGM-022 passes it), `players: [local]`.
- Callbacks return unsubscribe functions; `dispose()` removes every port listener.
Interface sketch: `GmNet` as quoted in OGM-054.md; plus `export function createNet(deps): { net: GmNet; dispose(): void }`.
Test scenarios:
- Given no messages, when `createNet` runs, then `role === 'host'` and `players` has one entry with the hello index.
- Given `net.players {local:0, players:[0,1]}` then `[0,1,2]`, when handled, then `onPlayerJoined` fires for 1 then 2 and `mp.spawn(2,'p2')` was called on the host.
- Given `[0,2]` next, when handled, then `onPlayerLeft(1)` and `mp.despawn('p1')`.
- Given `net.role {role:'peer'}`, when handled, then `role === 'peer'` and `mp.spawn` is never called afterwards.
- Given an unsubscribe is called, when the next `net.players` arrives, then the callback does not fire.

### U2 — Input codec and the host path

Goal: wire-form input, host input dispatch, fixed-rate snapshots and reliable events.
Files: Create `packages/sdk/src/net/input-codec.ts`, `packages/sdk/src/net/host.ts`, `packages/sdk/src/net/codec.ts`; Test `packages/sdk/src/net/input-codec.test.ts`, `packages/sdk/src/net/host.test.ts`, `packages/sdk/src/net/codec.test.ts`.
Approach:
- `input-codec.ts`: `encode(frame, inputs)` walks `manifest.inputs` in declared order: vector → two axes (clamped −1..1, quantised to 1/127), number → one axis, button → bit `i` in `buttons`; `decode(f, inputs)` with `source: 'network'`; `assertSize(f)` (JSON bytes ≤ `LIMITS.inputBytes`).
- `codec.ts`: `pack(obj): Uint8Array` (`TextEncoder` over JSON), `unpack`; `assertBytes(bytes, cap)`.
- `host.ts` `attachHost(net, deps)`: `port.on('net.input', m => …)` → `onInput` subscribers and the core input merge (so `applyInput` sees it on the next fixed step).
- `clock.onTick(tick => tick % 3 === 0 && sendSnapshot())`: pack `instance().mp.snapshot()`, enforce `LIMITS.snapshotBytes`, `seq++`, post `net.snapshot {seq, tick, data}`; skip entirely when `players.length === 1`.
- `sendEvent(e)`: `net.event {seq, data}` ≤ `LIMITS.eventBytes`; caps refused with a once-per-session warning and a `renderInfo().net.dropped` counter.
- The local player's frames on the host come from the ordinary input path and are never encoded.
Interface sketch:
```ts
export function encode(frame: ActionFrame, inputs: ManifestInput[]): InputFrame;
export function decode(f: InputFrame & { playerIndex: number }, inputs: ManifestInput[]): ActionFrame;
export function attachHost(net: NetInternals, deps: NetDeps): () => void;
```
Test scenarios:
- Given the worked manifest and frame, when encoded then decoded, then actions equal within 1/127.
- Given 100 button actions, when encoded, then `assertSize` throws (> 256 B) and the host logs once.
- Given the manual clock advanced 180 ticks with two players, when run, then exactly 60 `net.snapshot` posts with `seq` 1..60 and `tick` multiples of 3.
- Given `mp.snapshot` returns 70 KB of state, when the tick fires, then no post and `renderInfo().net.dropped === 1`.
- Given `net.input` for index 1 while the local index is 0, when handled, then `onInput(1, frame)` fired and the merge received a frame with `playerIndex: 1` and `source: 'network'`.
- Given `sendEvent({k:1})` twice, when posted, then `seq` 1 and 2 with packed JSON bodies.
- Given a single player, when 600 ticks pass, then zero `net.*` posts.

### U3 — Peer path with interpolation, events in order

Goal: peers render smoothly 100 ms behind the host and receive events in order.
Files: Create `packages/sdk/src/net/peer.ts`; Test `packages/sdk/src/net/peer.test.ts`.
Approach:
- `attachPeer(net, deps)`: buffer `{recvAt, seq, tick, state}` for the last three snapshots; drop `seq ≤ lastSeq`.
- On each render frame (`clock.onRender(nowMs)`): `t = nowMs − 100`; find `a ≤ t ≤ b`; `state = lerp(a.state, b.state, k)` where `lerp` interpolates numeric arrays under `entities[id].p` and `entities[id].r` (shortest-arc for length 4) and copies everything else from `b`.
- Call `instance().mp.applySnapshot({tick: b.tick, state})`; honour `instance().mp.interpolate?.(a, b, k)` if OGM-020's type carries it (do not add it to contracts here).
- Events: min-heap by `seq`; deliver contiguous from `lastEventSeq + 1`; a 2 s gap → `renderInfo().net.eventGaps++` and skip ahead.
- Stall: no snapshot for 2 s → one `net.stalled` through the SDK event path; cleared on the next snapshot.
- Peers never call `clock.step`.
Interface sketch: `export function attachPeer(net: NetInternals, deps: NetDeps): () => void;`
Test scenarios:
- Given snapshots at recv 0 ms (`p:[0,0,0]`) and 50 ms (`p:[10,0,0]`), when rendered at 125 ms, then `applySnapshot` got `p:[5,0,0]` and the later `tick`.
- Given only one snapshot, when rendered, then `applySnapshot` gets it unchanged (no extrapolation).
- Given a snapshot with `seq 3` after `seq 4`, when received, then it is dropped.
- Given events `seq 2` then `seq 1`, when received, then callbacks fire 1, 2.
- Given no snapshot for 2 s (fake timers), when the timer fires, then one `net.stalled`.
- Given a peer, when 600 ticks pass, then `clock.step` was never called by the net module.

### U4 — Camera and HUD binding, single player, text hook

Goal: `localPlayerIndex` drives the rig and HUD; `renderGameToText` lists players and net state.
Files: Create `packages/sdk/src/net/bind.ts`; Test `packages/sdk/src/net/bind.test.ts`, `packages/sdk/src/net/single-player.test.ts`.
Approach:
- `bind(net, { rig, hudSink, instance })`: on role or local index change → `rig()?.attach(instance().localAvatar(localPlayerIndex), localPlayerIndex)` (accessor name per OGM-025; refresh at pickup).
- Each render frame → `hudSink(instance().mp.hud(localPlayerIndex))`.
- Register a `net` section `{ role, localPlayerIndex, players: number[] }` in `renderGameToText()` through OGM-022's hook registry.
Test scenarios:
- Given role host and index 0, when bound, then `rig.attach(_, 0)`; given `net.players` with local 1, then `rig.attach(_, 1)` and `hud(1)`.
- Given two players in the fixture, when `renderGameToText()` runs, then `.players.length === 2` and `.net.role === 'host'`.
- Given single player, when `renderGameToText()` runs, then `.net.players` equals `[localPlayerIndex]`.

## 4. Verification

```
pnpm --filter @gm/sdk test -- net
pnpm --filter @gm/sdk typecheck && pnpm -r lint
pnpm --filter @gm/sdk-conformance check -- templates/game-2d templates/game-3d
```
Paste into `## Local tests`: Vitest summary for `net`, conformance output (renderer string, pass list), head SHA, base.

## 5. Deferred to implementation

- Interpolation key paths: default `entities[id].p` (position array) and `entities[id].r` (rotation, 1 or 4 numbers); document in `peer.ts` and in `gm-multiplayer-ready` (OGM-055).
- Snapshot cadence: default every 3rd tick at 60 Hz (20 Hz, A7 R12); constant exported as `snapshotHz`.
- Where `localAvatar(index)` comes from: default `mp.hud(index).target` if OGM-020's `HudModel` has one; else a `net.avatar(index)` optional hook on the instance (name it in the PR).
- Quantisation of axes to 1/127: default yes (keeps frames under 256 B with 8 axes).
- Interpolation delay: default 100 ms; exported as `interpolationDelayMs`.

## 6. Scope boundaries

- Wire shapes: OGM-050. Socket, grant, forwarding: OGM-053. Room: OGM-051. Multiplayer template, skill, scenario: OGM-055. Conformance checks for the net area: OGM-029 consumes; this ticket only keeps them green.

## 7. Risks

- `MultiplayerHooks` as merged by OGM-020 may differ from the T04 §4 quote: default implement against the merged type; do not edit `game.ts`.
- 256 B input frames with many declared actions: default quantise and let OGM-055's checker warn above 8 axes or 32 buttons.
- Interpolating opaque state could mis-handle games that put non-spatial numbers under `p`: default documented convention; `interpolate` override when present.
- Peers on phones at 20 Hz × ≤ 64 KiB (T07 §6): default accept; measure in OGM-055 with a 4× CPU-throttled context; delta encoding deferred.
