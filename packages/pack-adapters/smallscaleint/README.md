# @gm/pack-smallscaleint

Adapter for the SmallScaleInt isometric 2D set (Phaser). It reads layout from the asset manifest's `meta.sprite`
through `@gm/sdk/assets`, never from pack files, and ships no asset bytes.

## Binds

- `createSpriteActor(scene, loader, id, { variant })`: one texture per action sheet of the variant (`shadow` or
  `shadowless`), one Phaser animation per action and direction, and `sync({ x, y, facing, action, t })`, which sets
  position, frame and depth (`y`). `action` is a role from `vocabulary` or a set action name; loop roles repeat, the
  rest play once and hold their last frame. Sheets are fetched beside the asset's file, as `gm assets use` copies them.
- `facing8(vx, vy, hold?)`: the nearest of 8 facings for a screen velocity, with hysteresis on sector edges.
- `conventions`: the pack facts, each with how it was verified (sheet row order E, SE, S, SW, W, NW, N, NE, measured
  pixel by pixel against the angle-named frame files), and `layerForCategory` for tileset pieces.
- `vocabulary`: canonical roles to this set's action names, and the loop set.

## Leaves to the game

- Which sheet is the player, and which role a button plays.
- Movement, speeds and the hysteresis width.
- Combat, hit boxes and damage; doors, chests, inventory, dialogue and HUD.
- Maps, collision and the editor palette (a later version of this package).

## Verified

`pnpm --filter @gm/pack-smallscaleint test` draws numbered synthetic 128 px and 64 px sheets and checks every
action, direction and frame lands on its cell.
