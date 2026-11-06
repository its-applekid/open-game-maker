---
name: gm-pack-adapter
description: Load when changing a pack adapter, proposing a layer promotion, or ejecting shared pack code.
---

# Pack-adapter route

Apply the first matching layer test:

1. A measurable pack fact belongs on an asset card, or in L2 data when the card schema has no field.
2. Code a second game on this set needs unchanged belongs in `@gm/pack-<set>` (L2).
3. Code a second set or dimension needs unchanged, with no set symbol left, belongs in `@gm/sdk` (L1).
4. Everything else stays in the game's `src/features/` (L3).

Write a rule once in L3 before promoting it. A 300–800-token pattern card beats a shared helper when the game should
read and adapt the idea. In a PR, add `## Promote` with the observed second use, destination layer, and callers; write
`None` when there is no move.

## Adapter shape

Keep one package at `packages/pack-adapters/<set>/`, published as `@gm/pack-<set>`. Public exports come only from
`src/index.ts`: verified convention data, canonical vocabulary, bindings over plain state, Tiled JSON map loading,
and a card-derived editor palette. Bindings may register with `defineFeature`; synthetic timing tests use `FixedClock`.
From an instance repository, `gm new <template> <game-slug> --set <set>` pins it; `gm skills sync` keeps only the chosen
set skill installed.

## Checklist

- Export and type names are themeless; speeds, times, radii, and counts are required arguments, never filled defaults.
- Do not choose input actions, gameplay loops, entity roles, UI copy, levels, story, or difficulty.
- Test every binding with generated fixtures; never read pack bytes or `assets-local/`.
- Every convention records how and when it was verified; README lists what the adapter binds and leaves to the game.
- Run both scaffold checks and keep engine-specific imports inside the matching SDK wrapper.

## Eject only for a real divergence

When a game needs different gameplay behavior, copy adapter source into `src/pack/`, remove the dependency, and
treat the copy as L3. Keep the package unchanged; return to it when the shared contract can serve the game again.
