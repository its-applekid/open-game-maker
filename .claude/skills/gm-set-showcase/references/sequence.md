# Showcase project format

A project directory contains `sequence.json`, region JSON files, and sheet JSON files. Paths in `sequence.json` are
relative to the project directory and may not escape it.

## `sequence.json`

```json
{
  "schema": "ogm.set-showcase/1",
  "set": "set-id",
  "style_family": "pixel-art",
  "fps": 24,
  "sprite_fps": 12,
  "layout": {
    "projection": "top-down",
    "seam": "grid",
    "viewport": [512, 512],
    "directions": ["down", "left", "right", "up"]
  },
  "required_packs": ["pack-a", "pack-b"],
  "runner": {
    "ref": "card:pack-a/hero",
    "action": "walk",
    "path": { "from": [-48, 320], "to": [560, 320] },
    "speed": 48,
    "scale": 2
  },
  "stops": [
    {
      "id": "market-corner",
      "region": "regions/market-corner.json",
      "sheet": "sheets/market-corner.json",
      "seconds": 6.25,
      "tile_sprites": ["card:pack-b/road", "card:pack-b/cart"],
      "sheet_sprites": ["card:pack-a/shopper"],
      "story": [
        {
          "actor": "runner",
          "action": "greet",
          "target": "cart",
          "reaction": "wave",
          "timing": [1.25, 3.75]
        }
      ]
    }
  ]
}
```

Use `projection: "isometric"` with `seam: "diamond"` for 2:1 isometric sets. The viewport must be square. A stop id is
lowercase letters, digits, and hyphens so it is safe in generated filenames.

`tile_sprites` exactly lists the region ground and sprite refs. `sheet_sprites` exactly lists the paired sheet refs.
`required_packs` lists the complete inventory scope, not just favorites. Story actors are `runner`, the runner card's
last path segment, or a region sprite id; targets are region sprite ids.

## Region file

```json
{
  "background": "#28332a",
  "ground": {
    "ref": "card:pack-b/road",
    "fill": "cover",
    "scale": 2
  },
  "sprites": [
    {
      "id": "cart",
      "ref": "card:pack-b/cart",
      "at": [360, 300],
      "scale": 2,
      "z": 0
    },
    {
      "id": "dog",
      "ref": "card:pack-a/dog",
      "action": "walk",
      "dir": "right",
      "at": [180, 340],
      "walk": { "to": [280, 340], "seconds": 2.5, "offset": 0.5 }
    }
  ]
}
```

`fill` must be `cover`. Coordinates are world pixels. The camera offsets the world to keep the runner centered. Sprites
are anchored at bottom-center and depth-sorted by their world y plus optional `z`.

## Sheet file

```json
{
  "background": "#d4d0c4",
  "grid": [3, 3],
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

Directions must contain the complete sequence from `layout.directions`. All sprites advance directions on the sheet's
shared `direction_seconds` beat.

## Catalog references

`card:<pack>/<id>` resolves a catalog asset card. Static cards use `source.files[0].path`. Animated cards use
`sprite.animations`, including frames, directions, and either a sheet, per-direction files, or per-frame files. A sheet
entry may include `left` and `top` for one character inside a multi-character atlas.

`sheet:<pack>|<directory>` is the compatibility form for an uncarded action sheet. It expects `<directory>/<action>.png`
and defaults to 15 columns by 8 rows in `E,SE,S,SW,W,NW,N,NE` order; pass `columns`, `rows`, and `directions` on the
sprite when the verified layout differs. Prefer catalog cards whenever they exist.
