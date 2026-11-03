# Showcase project format

A project directory contains `sequence.json`, region JSON files, and sheet JSON files. Paths in `sequence.json` are
relative to the project directory and may not escape it.

## `sequence.json`

```json
{
  "schema": "ogm.set-showcase/2",
  "set": "set-id",
  "style_family": "pixel-art",
  "fps": 24,
  "sprite_fps": 12,
  "loop_seconds": 10,
  "layout": {
    "projection": "top-down",
    "seam": "grid",
    "viewport": [512, 512],
    "directions": ["down", "left", "right", "up"],
    "background": "#28332a"
  },
  "world": {
    "ground": { "ref": "card:pack-b/road", "fill": "cover", "scale": 2 }
  },
  "required_packs": ["pack-a", "pack-b"],
  "runner": {
    "ref": "card:pack-a/hero",
    "action": "walk",
    "path": { "points": [[0, 0], [240, 0], [0, 0]] },
    "speed": 48,
    "scale": 2,
    "collision": { "type": "actor", "footprint": [20, 12] }
  },
  "stops": [
    {
      "id": "market-corner",
      "region": "regions/market-corner.json",
      "sheet": "sheets/market-corner.json",
      "start_time": 0,
      "tile_sprites": ["card:pack-b/paving", "card:pack-b/cart"],
      "sheet_sprites": ["card:pack-a/shopper-a", "card:pack-a/shopper-b"],
      "story": [{
        "actor": "runner",
        "action": "walk",
        "target": "cart",
        "reaction": "bob",
        "timing": [1.25, 2.5, 3.75]
      }]
    },
    {
      "id": "farm-lane",
      "region": "regions/farm-lane.json",
      "sheet": "sheets/farm-lane.json",
      "start_time": 5,
      "tile_sprites": ["card:pack-b/grass", "card:pack-b/trough"],
      "sheet_sprites": ["card:pack-a/farmer-a", "card:pack-a/farmer-b"],
      "story": [{
        "actor": "runner",
        "action": "walk",
        "target": "trough",
        "reaction": "bob",
        "timing": [1, 2, 4]
      }]
    }
  ]
}
```

Use `projection: "isometric"` with `seam: "diamond"` for 2:1 isometric sets. The viewport must be square. A stop id is
lowercase letters, digits, and hyphens so it is safe in generated filenames.

There is one route point per stop plus a closing point equal to the first. Each `start_time` begins the interval from its
route point to the next; the final interval ends at `loop_seconds`. Projected distance divided by interval duration must
stay within 2% of `runner.speed`, and the loop may not exceed 30 seconds.

`tile_sprites` exactly lists the region ground and sprite refs. `sheet_sprites` exactly lists all 24 paired sheet refs.
`required_packs` lists the complete inventory scope, not just favorites. Story actors are `runner`, the runner card's
last path segment, or a region sprite id; targets are region sprite ids. `action` is an action exposed by the actor's
card. `timing` is `[start, contact, end]`: the action plays once before contact, then the target reacts until the end.
`reaction` may be a target card action or the built-in one-shot `bob`/settled `hold` choreography.

Optional stop `weather` is either one weather object or a non-empty array of weather objects. Every object has a
supported `kind` and a positive integer `count`; precipitation may also declare deterministic `seed` and horizontal
`wind` as a finite number. Array layers render in declaration order.

## Region file

```json
{
  "ground": {
    "ref": "card:pack-b/road",
    "fill": "area",
    "size": [320, 512],
    "bounds_offset": [16, 0],
    "scale": 2,
    "underlay": "#596f42",
    "grid": { "cell": [64, 32], "origin": [0, 0] },
    "layers": [{
      "ref": "card:pack-b/path",
      "role": "path",
      "cells": [[-1, 0], [0, 0], [1, 0]]
    }]
  },
  "sprites": [
    {
      "id": "cart",
      "ref": "card:pack-b/cart",
      "at": [104, -44],
      "scale": 2,
      "z": 0,
      "collision": { "type": "solid", "footprint": [64, 28] }
    },
    {
      "id": "dog",
      "ref": "card:pack-a/dog",
      "action": "walk",
      "dir": "right",
      "at": [-80, 40],
      "collision": { "type": "actor", "footprint": [18, 10] },
      "walk": { "to": [20, 40], "seconds": 2.5, "offset": 0.5 }
    }
  ]
}
```

In v2 region ground uses `fill: "area"` with a base `ref`, or `fill: "layers"` with no base and at least one ordered
layer. `size` is the region's world-space patch around its route point; optional `bounds_offset` moves that patch without
moving the region's route origin. The full-cover `world.ground` remains underneath every patch so camera corners never
expose empty canvas. Region coordinates are local to that stop's route point. `underlay` is an opaque terrain-matched
safety color for transparent base-tile margins. Ordered `layers` place catalog refs at `grid` cells; include every base
and layer ref in `tile_sprites`. Mark the continuous cells under the complete runner route with `role: "path"`; the
frame audit samples the hero's foot point against those rendered isometric diamonds. Sprites need globally
unique stable `id` values and are anchored at bottom-center. Treat that anchor as the visible footprint: ordinary
sprites depth-sort by projected footprint position, while `z` is only a narrow correction for a known structural layer,
not a way to force every focal actor above the world.

The portable schema intentionally stays small: it carries the shared collision type, footprint, and optional offset,
while a set-specific authoring tool may retain composite anchors, focal zones, wall mounts, or particle emitters in its
private source data. The baked result must also satisfy these rules:

- protect the runner, objective or portal, contact effect, and active actor/target pair from accidental occlusion;
- keep composite parts on one anchor and facing, and keep openings clear of unrelated props;
- join interior walls and mount doors, windows, signs, banners, paintings, and torches to a real wall surface;
- make every route exit meet the following entrance at the declared natural walk speed; and
- seed full-viewport particles while varying position, speed, phase, and lifetime so the loop is deterministic without
  obvious synchronized bands.

Do not add those set-specific facts to `tile_sprites`; that list remains the exact catalog-reference manifest for the
region. Validate private compositor metadata with the set's own preflight and preserve the generic
`ogm.set-showcase/2` contract for other projects.

Every runner and region sprite needs `collision.type`: `actor` for characters and creatures, `solid` for props, walls,
and vehicles, or `none` for non-solid effects. Actors and solids also need a positive `[width, depth]` footprint in
world pixels. The rectangle is bottom-centered on `at`; optional `collision.offset: [x, y]` moves its anchor for an
asymmetric source. Measure occupied ground, not the full visible sprite. The checker reserves those rectangles and scans
every output frame before the renderer starts encoding. Touching edges are valid; overlapping areas are not.

The checker also compares rendered alpha pixels for every actor/solid pair. Pixel overlap is allowed only when the actor
has lower depth and is therefore drawn behind the solid. A foreground actor intersecting a solid fails even when their
declared footprints do not overlap, which catches the actor-through-counter case.

For v2, the checker expands every route segment by the runner footprint and rejects any placed footprint that crosses
that open corridor, including the closing segment and moving sprites' swept bounds. It also rejects any sprite drawn
after and visibly over the runner, regardless of collision class, and samples every rendered hero foot point against a
`role: "path"` ground tile. The report's `corridor-intersections`, `runner-occlusion-frames`, and
`runner-off-path-frames` counts must all be zero before encoding.

## Sheet file

```json
{
  "background": "#d4d0c4",
  "grid": [6, 4],
  "direction_seconds": 1.25,
  "sprites": [
    {
      "id": "shopper",
      "ref": "card:pack-a/shopper",
      "actions": ["walk", "idle"],
      "directions": ["down", "left", "right", "up"],
      "scale": 2
    }
  ]
}
```

The example shows one entry for readability; a valid v2 sheet contains exactly 24 distinct source designs and a grid
with at least 24 cells. Directions must contain the complete sequence from `layout.directions`. All sprites advance
directions on the sheet's shared `direction_seconds` beat.

## Catalog references

`card:<pack>/<id>` resolves a catalog asset card. Static cards use `source.files[0].path`. Animated cards use
`sprite.animations`, including frames, directions, and either a sheet, per-direction files, or per-frame files. A sheet
entry may include `left` and `top` for one character inside a multi-character atlas.

`sheet:<pack>|<directory>` is the compatibility form for an uncarded action sheet. It expects `<directory>/<action>.png`
and defaults to 15 columns by 8 rows in `E,SE,S,SW,W,NW,N,NE` order; pass `columns`, `rows`, and `directions` on the
sprite when the verified layout differs. Prefer catalog cards whenever they exist.

`raw-char:<pack>|<directory>` resolves verified per-frame folders at `<directory>/<action>/<direction>/*.png`.
`raw-tile:<pack>|<path>` and `raw-fx:<pack>|<path>` resolve a pack-relative PNG (or a direction-suffixed PNG when the
path has no extension). All raw paths remain inside the installed pack; absolute and escaping paths fail preflight.

## Legacy compatibility

`ogm.set-showcase/1` remains readable and renderable for existing projects. Its runner has one `path.from`/`path.to`
segment and each stop has `seconds`; it emits per-stop media. Do not choose v1 for new showcases and never concatenate
its stop clips to imitate a continuous world.
