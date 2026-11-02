# @gm/pack-limezu-modern

Adapter for the LimeZu modern set (farm, interiors, exteriors, user interface, fantasy battlers, fungus cave):
top-down 2D on Phaser. It reads layout from the asset manifest through `@gm/sdk/assets` and ships no asset bytes.

## Binds

- `TopdownMap(tiledJson, scale)`: Tiled `orthogonal` maps at the game's scale, layers `ground`, `ground-detail`,
  `walls`, `above` plus object layers. A tile layer with `autotile` (`gamemaker` or `godot`), `autotileTileset` and
  `autotileBlock` is a mask; `paintAutotile(mask, layout, block)` picks the 47 blob pieces. `collisionGrid(isSolid)`
  marks `walls` and solid objects (`solidFromCards(loader)`: card `sprite.tile.walkable: false`); object depth is
  `y + h`; `render(scene, textures)` builds the Phaser layers.
- `createSpriteActor4(scene, loader, id, { fps, character? })`: RPG Maker MV sheets, 3 x 4, rows down/left/right/up,
  `sync({ x, y, facing, role, t })`; `facing4(vx, vy, hold?)` with hysteresis.
- `composeLayers(layers)` and `farmerLayers(pieces)`: engine-free Canvas 2D compositor for the farmer generator.
- `lockedScale(gmLock, assetsLock)`: one scale per game (16, 32 or 48), `scale` in `gm.lock.json`.
- `palette(manifest, scale)`: props, animals, crops and vehicles the editor may place.
- `conventions` (every fact with how it was measured) and `vocabulary` (roles, crop stages, battler variants).

## Leaves to the game

- Farming rules, day cycle, economy, which animals exist and what they do, dialogue, inventory, input.
- Walk speed and frame rate (`fps` has no default), the hysteresis width, which sheet is the player.
- The UI pack (`gm-ui-hud`), the map content and which terrain block a layer paints.

## Verified

`pnpm --filter @gm/pack-limezu-modern test` checks all 256 neighbourhoods of both layouts against what the pack draws
in each cell (`test/fixtures/autotile-oracle.ts`, measured separately from the tables); `test:browser` renders a 6x6
autotiled fixture map in Phaser WebGL and compares its pixels with the terrain mask (`test/browser/autotile-6x6.png`).
