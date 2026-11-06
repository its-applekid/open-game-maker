# Convert a single-player game to multiplayer

An edit job: the game already plays alone; after these steps any number of seats up to `maxPlayers` play it in one
room. Do the steps in order and keep `gm test` green after each one. Acceptance is the verify that matches your
room: `multi-client` for a protocol-2 room, `two-client` for a v1 one.

## Before

The usual single-player loop reads keys inside the update, keeps one `player` object at module scope, and lets the
camera and HUD read that object:

```js
const player = { pos: { x: 0, y: 0 }, hp: 3 };
function update(dt) {
  let ix = 0;
  if (keys.has('a')) ix -= 1;
  if (keys.has('d')) ix += 1;
  player.pos.x += ix * SPEED * dt;
  hpLabel.text = String(player.hp);
  camTarget.lerp(player.pos, dt * 5);
}
```

## Steps

1. **Players map.** Replace the singleton with `players = new Map<number, PlayerState>()` inside the simulation
   state. Give each avatar `id`, `playerIndex` and its visible fields. Search for every read of the old object and
   route it through `players.get(index)`.

2. **applyInput.** Declare the actions in `manifest.inputs.actions` and stop reading keys, the stick or the gamepad
   in game code. Add `applyInput(state, playerIndex, frame)` that only stores intent (move axis, queued jump) for
   that seat; the fixed step reads the stored intent. In the step listener, call it for every frame:
   `for (const frame of frames) applyInput(state, frame.playerIndex, frame)`. Remote seats arrive in the same list.

3. **Host-minted ids.** Key every entity by a string id the host mints (`p<index>` for avatars, the design id for
   placed things, a host counter turned into `e<n>` only on the host). Never index `entities` by array position.

4. **Spawns as design data.** Move spawn points into `design/spawns.json` as `[{ "id", "x", "y" }]` with at least
   `maxPlayers` entries, and set `maxPlayers` in `gm.manifest.json`. Spawn seat `i` at `spawns[i % spawns.length]`.

5. **Net hooks.** On the game instance add `net`:
   - `spawn(playerIndex, playerId)` adds the avatar; `despawn(playerId)` removes it.
   - `snapshot()` returns `{ tick, state: { tick, entities: { [id]: { p, r?, ...visible } } } }`.
   - `applySnapshot(snapshot)` writes those fields back. Derive effects (dust, flashes, sounds) from state changes
     on each client; do not put them in the snapshot.

6. **Per-player HUD and camera.** Add `hud(playerIndex)` that reads `players.get(playerIndex)` only, draw
   `hud(localPlayerIndex)` on each client, and attach the camera rig to the local avatar. Keep `localPlayerIndex`
   from `runtime.net`, which changes when the room seats this client.

7. **Two seats in tests.** Add a test that spawns seat 1, feeds a move frame for seat 1 only for 60 steps, and
   asserts seat 1 moved while seat 0 did not. `tick(seconds)` and `render_game_to_text()` must still work.

## After

```ts
for (const frame of frames) applyInput(state, frame.playerIndex, frame);
stepSimulation(state, design, dt);
// HUD and camera, on every client
const model = hud(state.players, localPlayerIndex);
```

## Accept

Run `gm test`, `gm check`, then the checker
(`node .claude/skills/gm-multiplayer-ready/scripts/check.ts .`) and fix every finding. Then ask the platform for the
multi-client verify (`pnpm --filter @ogm/gm-verify scenario multi-client --game <gameDir> --link bad`), or the
two-client one on a v1 room (`pnpm --filter @ogm/gm-verify scenario two-client --game <gameDir>`); the job is done when its
report says `verdict: pass` with `clients: 4` (`2` on the v1 room).
