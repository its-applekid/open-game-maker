---
name: gm-set-smallscaleint
description: Load when gm.lock.json names the smallscaleint set and the game uses its isometric adapter.
---

# SmallScaleInt set route

Confirm `gm.lock.json` has `set: "smallscaleint"`. Inspect chosen cards with `gm assets info`, search with
`gm assets search --set smallscaleint`, and compare candidates with `gm assets sheet`. Fetch one implementation
pattern at a time with `gm docs pattern <topic>`.

## Adapter exports

| Export | Use |
|---|---|
| `smallscaleintConventions` | verified grid, direction, footprint, and sequence facts |
| `smallscaleintVocabulary` | canonical action role to sheet sequence |
| `SpriteActor` | eight-direction sheet binding over plain state |
| `IsoMap` | Tiled isometric layers, wall collision, and depth |
| `LayeredSprite` | creator-piece composition using verified order |
| `smallscaleintPalette` | card-derived editor prefabs and placement checks |

Rows and per-frame folders are pack facts; do not infer them from file names in game code. Loop locomotion and idle
sequences; treat impact, use, and defeat sequences as one-shot-and-hold when the card says so. Keep shadow variants
consistent within one actor. Pieces taller than a cell are depth-sorted sprites, not floor tiles.

## Cards

| Need | Topic |
|---|---|
| stable overlap | `iso-depth-sort` |
| motion facing | `eight-direction-facing` |
| tile walls | `wall-collision-from-tiles` |
| terminal poses | `one-shot-and-hold` |
| isometric control | `iso-movement` |
| ambient motion | `wander-flee` |

The game still chooses roles, input actions, speeds, behavior, combat, inventory, UI, and story.
