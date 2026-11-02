---
name: gm-multiplayer-ready
description: Load for every game, for any single-player to multiplayer conversion job, and before the two-client verify. Keeps the game shaped for rooms and checks the shape.
---

# Multiplayer-ready games

Every game ships shaped for a room from day one, even when only one person plays it. A watcher must never see
private text; the room enforces that, and the two-client verify proves it.

## The eight rules

1. Input never mutates the world directly: it becomes an `InputFrame` consumed by `applyInput(playerIndex, frame)` in
   the fixed step.
2. All per-player state lives in `players: Map<playerIndex, PlayerState>`; no singleton `player`.
3. Entity ids are host-minted, globally unique strings; never array positions or per-session counters.
4. Spawn points are design data (`design/spawns.json`), at least `maxPlayers` of them.
5. The host is authoritative; peers render snapshots and send inputs only; game logic never assumes a server.
6. `serializeSnapshot()/applySnapshot()` cover everything visible; transient effects are derived, not synced.
7. HUD reads `players.get(localPlayerIndex)`; camera rig follows the local avatar.
8. `tick(seconds)` and `render_game_to_text()` work with `players.length ≥ 2`.

## The host is authoritative

The room relays; it never simulates. The owner's browser runs the only simulation and is the host. Peers send input
frames and draw the host's snapshots. Never describe the room or any service as the authority, and never put game
rules in a service: if the host leaves, the room pauses for it and then ends.

## What the SDK gives you

The runtime's `gm.net` (`runtime.net` after `boot`) is the whole network surface:

- `role` is `host` or `peer`; `localPlayerIndex` is this client's seat; `players` lists the seats in the room.
- Remote input arrives in the fixed step as ordinary frames whose `playerIndex` is the sender's seat, so the same
  `applyInput` handles every player. `onInput` only observes it.
- `onPlayerJoined`/`onPlayerLeft` announce seats; `sendEvent`/`onEvent` carry rare one-off events, not state.
- The host sends a snapshot every third step (20 Hz); peers draw 100 ms behind and interpolate.

The game supplies `MultiplayerHooks` on its instance as `net`:

- `MultiplayerHooks.spawn` gets `(playerIndex, playerId)` with a host-minted id (`p<index>`); add that avatar to
  `players`. `MultiplayerHooks.despawn` removes it.
- `MultiplayerHooks.snapshot` returns `{ tick, state }`; `MultiplayerHooks.applySnapshot` replaces the visible state
  on a peer.
- `MultiplayerHooks.hud` takes a seat and returns that seat's `HudModel`, never another player's private field.

Interpolation convention: put each visible thing under `state.entities[id]` with its position in `p` (number or number
array) and rotation in `r` (yaw number or `[x, y, z, w]` quaternion). The SDK lerps `p` and slerps `r` between two
snapshots; every other field snaps.

Caps: an input frame is at most 256 bytes on the wire (8 axes, 32 buttons, never text); a snapshot is at most 64 KiB
after packing. An oversized payload is dropped with one warning, so keep snapshots to what is visible.

## Starting shape

`gm new game-multiplayer <dir>` scaffolds the shape: `players` map, `applyInput`, four spawns in
`design/spawns.json` with `maxPlayers` 4 in `gm.manifest.json`, `net` hooks, and a HUD plus camera that follow
`localPlayerIndex`. Grow the game from there; do not copy its grey boxes into the creator's theme.

To convert an existing single-player game, follow `references/convert-single-to-multiplayer.md` step by step.

## Check

Run the static checker after any change to input, players, entities, spawns, snapshots or the HUD:

```sh
node .claude/skills/gm-multiplayer-ready/scripts/check.ts .
```

It fails, naming the rule and file, on: no `applyInput` (1), a module-scope `player` singleton (2), entity ids from
array positions or counters (3), fewer spawns than `maxPlayers` (4), missing `snapshot`/`applySnapshot` (6), and a
HUD that never reads `players.get(...)` (7). Ambiguous shapes print as notes; read them. Rules 5 and 8 need two
running clients.

## Two-client verify

Run it after a conversion, after changing snapshots or input, and before calling a multiplayer feature done. It runs
on the platform host against a local rooms service, never the public hostname, from the platform repository:

```sh
pnpm --filter @ogm/gm-verify scenario two-client --game <gameDir> --out shots/mp
```

Two browsers join one room and it asserts: welcome within 2 s, the watcher's design equals the host's at each rev,
a private canary never reaches the watcher, the peer is playing within 500 ms of Play, peer input moves the peer's
avatar in the host's snapshot, host loss pauses then ends the room, and a draft load reaches both clients. Its
report says `clients: 2` and lists what it could not check (WAN latency, iPhone Safari).

## Done

Done means `gm check`, `gm test` and the checker are green, `gm run` shows two avatars when two seats are spawned,
and the two-client verify passed for any change to networking. After `gm run`, post a still with `gm chat post`.
