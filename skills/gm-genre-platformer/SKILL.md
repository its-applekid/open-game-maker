---
name: gm-genre-platformer
description: Load for a platformer, side-scroller, jump-and-run, or a request to tune platformer feel.
---

# Platformer build route

Load when `gm scope` names a platformer, side-scroller, jump-and-run, or jump-feel tuning. The scope still owns every
mechanic, role, theme, and name; this skill supplies implementation patterns only.

## Core loop

1. Read the scope's feel words and listed mechanics. Do not inherit mechanics from a card.
2. Fetch only the needed cards with `gm docs pattern <topic>`.
3. Pick values from each card's ranges and export them from `src/tunables.ts`; never copy a filled example value.
4. Build a themeless grey-box from the 2D template before selecting presentation assets.
5. Run `gm run --rig side --viewport both`, inspect both viewports, then post the evidence with `gm chat post`.

## Card index

| Brief need | Card |
|---|---|
| forgiving jump timing | `jump-buffer-coyote` |
| stable side-view framing | `deadzone-camera` |
| jump-through surfaces | `one-way-platforms` |
| proportional impact response | `hit-feedback-tiers` |

## References to open only when needed

- Jump math and feel ranges: `vendor/gamedev/platformer` and its `references/feel-tuning.md`.
- General feel tuning: `vendor/gamedev/physics-tuning` and `vendor/gamedev/game-feel`.
- Arcade bodies: `vendor/phaser/physics-arcade`.
- Level collision: `vendor/phaser/tilemaps`.
- Follow and bounds: `vendor/phaser/cameras`.

## Pitfalls

- Clamp high fall speed or use the engine's collision seam so the Player cannot tunnel through a surface.
- Keep one-way re-entry disabled for the chosen drop window; do not immediately catch the Player again.
- Smooth and bound the camera; snapping on each jump is a verification failure.
- Derive each move's duration from its path and feel target, never from a fixed content slot.
- Keep role names (`Player`, `Hazard`, `Pickup`) until the scope supplies presentation names.
