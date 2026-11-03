---
name: gm-set-showcase
description: Use when a newly installed asset set needs a cohesive living-diorama and sprite-sheet showcase for the style picker, or when asked to plan, render, repair, or QA a set showcase. Produces pre-rendered looping MP4, GIF, and poster media; never a client-side compositor.
---

# gm-set-showcase

Build a set showcase from its catalog facts. The result is one compact living world, not independent levels or a
contact sheet of unrelated assets: one walking hero follows a closed route through small stories while nearby
characters, animals, and props do legible things. One synchronized sheet track shows 24 different assets for each stop.

Do not commit asset bytes or anything under `assets-local/`. Work in a scratch directory and publish only where the
calling task authorizes it. Preserve every card's usage rights and local-processing restrictions.

## Inputs

Collect these before planning:

- the set id;
- the catalog card index containing renderable source facts;
- the style family (pixel art, painted, low-poly, and so on);
- the local asset-library root;
- a scratch project directory and an authorized media destination.
- the matching store thumbnail or official pack screenshot for each region.

Read [planning.md](references/planning.md) while inventorying and planning. Read
[sequence.md](references/sequence.md) while authoring JSON. For the known-good timing and composition lessons from the
first showcase, read [smallscaleint-example.md](references/smallscaleint-example.md). The LimeZu Modern project under
[examples/limezu-modern](references/examples/limezu-modern/) remains the runnable v1 compatibility example.

## Workflow

1. Inventory every card by pack, kind, world/theme, actions, directions, and renderable source. Keep an explicit list of
   all packs that must appear.
2. Recreate the matching store thumbnail as a still before adding motion: preserve its ground, walls, prop choices,
   density, layering, and camera framing as closely as the installed pack allows. Put the reference beside the render
   and fix the largest mismatch before continuing. When an accepted earlier showcase exists, normalize that authored
   region instead of selecting a sparse replacement cast. Only deviate for a named correction or when the pack does not
   contain the pictured asset.
3. Plan compact adjacent regions, purposeful density, protected focal zones, and one story beat per region. Put every
   stop centre on one closed route, including the physical final-to-first seam. A beat names stable
   actor/target ids, a real card action, the target's one-shot reaction, and `[start, contact, end]` timing. An attack
   without a target and reaction is not a story.
4. Make the world continuous. Use 45-degree diamond seams for isometric sets and grid seams for top-down sets. Ground
   must cover every edge with coherent roads, paths, borders, and transitions; do not leave empty canvas around a
   diorama or place incompatible ground patterns edge-to-edge. Use an opaque terrain-matched underlay plus ordered
   ground cells when a tile has transparent margins.
5. Choose a hero with a real `walk` action and a natural source-derived cadence. Declare one slower projected-pixel
   ground speed for the whole closed route. The square camera follows that hero; stop times derive from route distance.
   Measure every stop interval and keep all speeds within 2%. Do not substitute an idle bob or run animation.
6. Put exactly 24 additional, non-scene assets on each stop's sheet. Every animated sheet sprite rotates through the
   set's full direction order on the same tempo. A design may appear in the world or its paired sheet, never both.
7. Write `sequence.json`, `regions/*.json`, and `sheets/*.json` using [sequence.md](references/sequence.md). Every placed
   sprite needs a unique stable id and collision classification. Source designs may back several intentional authored
   instances; reject duplicate ids and colocated copies, not legitimate reuse. Reserve each sprite's complete footprint
   while placing it; never place by anchor point alone. Keep
   `tile_sprites`, `sheet_sprites`, story beats, stop start times, and `required_packs` explicit so the checker can audit
   the plan. Keep human-readable names as manifest/UI metadata; renderer inputs never contain label or caption fields.
8. Check every reference, direction, pack, story target, repeated prop, region/sheet overlap, and rendered frame:

   ```sh
   node scripts/assets/showcase/check.mjs \
     --project <project-dir> \
     --assets-root <asset-library-root> \
     --catalog <cards.index.json>
   ```

   Keep the frame-by-frame report with the region evidence. Its route preflight must report zero corridor intersections,
   and every frame must report zero footprint overlaps, zero disallowed actor/solid-prop intersections, and zero
   later-drawn runner occlusions. Fix the layout, footprint, painter order, or path when a count is non-zero; never waive
   an intersection after rendering.

9. Render to a scratch output directory:

   ```sh
   node scripts/assets/showcase/render.mjs \
     --project <project-dir> \
     --assets-root <asset-library-root> \
     --catalog <cards.index.json> \
     --output <scratch-output>
   ```

   Continuous projects render as one complete loop; `--only` is reserved for legacy v1 projects. The compositor emits
   one region MP4/GIF/poster track, one synchronized sheet MP4/GIF/poster track, per-stop posters, a measured speed
   table, manifest start times, and text-free one-frame-per-second timeline frames. It probes everything before
   publishing `manifest.json`.
10. QA the one-frame-per-second full-loop timeline plus start, contact, reaction, result, and seam stills from every
   stop using `gm-verify`. Inspect the final-to-first seam too. Look for cuts, empty edges, clipped feet, footprint-order mistakes,
   hidden focal actors, floating wall props, misaligned composite parts, repeated placements, unreadable action/reaction
   pairs, upward rain or snow, synchronized particle patterns, and an unnatural walking cadence. Inspect every building
   in a close-up: walls meet, one roof covers the shell, and doors sit in walls. Fix the worst visual defect and rerender
   before judging the next one.
11. Publish the baked files and manifest to the style-picker detail surface. The client loads each shared track once,
    uses `autoplay loop muted playsinline`, and seeks both tracks to a stop's manifest `start_time`; it never swaps
    per-stop videos, imports these tools, runs a game engine, or renders a canvas preview. Follow
    [publication.md](references/publication.md).

## Completion gate

The checker and post-render media probe pass; the route closes physically; every interval is within 2% of the declared
speed; the route has zero corridor intersections; every frame has zero footprint overlaps, zero disallowed actor/solid
pixel intersections, and zero runner occlusions; rain and snow move down-screen with deterministic wind drift; every installed pack
is represented; every stop and both shared tracks have been visually inspected; the one-frame-per-second timeline shows
one hero in one filled world with no cut or burned text; each sheet interval shows 24 distinct sprites; protected focal
elements and weather remain readable; paired world/sheet casts do not overlap; and the published surface seeks the two
generated shared tracks by manifest time. Report any device or physical-phone check that was not run.
