---
name: gm-set-limezu-modern
description: Load when gm.lock.json names the limezu-modern set and the game uses its top-down adapter.
---

# LimeZu Modern set route

Confirm `gm.lock.json` has `set: "limezu-modern"`. Use `gm assets search --set limezu-modern`, inspect sheet and
tile facts with `gm assets info`, compare candidates with `gm assets sheet`, and fetch one focused pattern with
`gm docs pattern <topic>`.

## Adapter exports

| Export | Use |
|---|---|
| `limezuModernConventions` | verified cell, sheet, crop, and layer facts |
| `limezuModernVocabulary` | canonical action role to sequence |
| `TopDownMap` | Tiled orthogonal layers and collision categories |
| `DirectionalSprite` | four-direction sheet binding over plain state |
| `FarmerCompositor` | creator-piece composition using verified order |
| `limezuModernPalette` | card-derived editor prefabs |

Keep source crops and cell sizes from card metadata; do not infer them at runtime. Preserve the sheet's direction
order and use a stable previous facing while velocity is zero. Autotile masks describe adjacency only: gameplay
collision comes from named map categories. Crop stages are presentation states, not growth rules.

## Cards

| Need | Topic |
|---|---|
| neighboring tile selection | `autotile-mask` |
| top-down facing | `four-direction-sheet` |
| staged crop display | `crop-stages` |

The game still chooses roles, input actions, speed, growth timing, economy, interaction results, UI, and story.
