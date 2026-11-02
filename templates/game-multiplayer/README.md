# Multiplayer game template

Grey-box Phaser 4 scaffold for games created by Open Game Maker 2000, shaped for rooms from the first commit. It starts
from `templates/game-2d` at commit `89a6683a05955fc21aca4f4bb6db44d59a4201c2`; all implementation in this directory is
original.

- Every avatar lives in `players: Map<playerIndex, PlayerState>` and is keyed by its host-minted id (`p<index>`).
- Input reaches the world only through `applyInput(state, playerIndex, frame)` inside the fixed step.
- Spawn points are design data in `design/spawns.json`, one per seat (`gm.manifest.json` `maxPlayers`).
- `net.snapshot`/`net.applySnapshot` carry every visible field as `entities[id].p`, which peers interpolate.
- The HUD and the camera follow `gm.net.localPlayerIndex`, so the host and each peer draw their own slice.

Run `pnpm test` for the Node simulation, `pnpm test:browser` for the Chromium boot proof, and
`GM_VERIFY_SOFTWARE_GL=1 pnpm test:browser` for the SwiftShader path. The rules behind this shape are in the
`gm-multiplayer-ready` skill.
