---
name: gm-set-showcase
description: Use when a newly installed asset set needs a cohesive living-diorama and sprite-sheet showcase for the style picker, or when asked to plan, render, repair, or QA a set showcase. Produces pre-rendered looping MP4, GIF, and poster media; never a client-side compositor.
---

# gm-set-showcase

Build a set showcase from its catalog facts. The result is a set of small stories, not a contact sheet of unrelated
assets: a walking hero moves through continuous regions while nearby characters, animals, and props do legible things.
Each region also gets a synchronized sprite sheet containing different assets from the scene.

Do not commit asset bytes or anything under `assets-local/`. Work in a scratch directory and publish only where the
calling task authorizes it. Preserve every card's usage rights and local-processing restrictions.

## Inputs

Collect these before planning:

- the set id;
- the catalog card index containing renderable source facts;
- the style family (pixel art, painted, low-poly, and so on);
- the local asset-library root;
- a scratch project directory and an authorized media destination.

Read [planning.md](references/planning.md) while inventorying and planning. Read
[sequence.md](references/sequence.md) while authoring JSON. For the known-good timing and composition lessons from the
first showcase, read [smallscaleint-example.md](references/smallscaleint-example.md). The runnable LimeZu Modern dry run
is under [examples/limezu-modern](references/examples/limezu-modern/).

## Workflow

1. Inventory every card by pack, kind, world/theme, actions, directions, and renderable source. Keep an explicit list of
   all packs that must appear.
2. Plan adjacent regions and one story beat per region. A beat names an actor, an action, a visible target, the target's
   reaction, and timing. An attack without a target and reaction is not a story.
3. Make the world continuous. Use 45-degree diamond seams for isometric sets and grid seams for top-down sets. Ground
   must cover every edge; do not leave empty canvas around a diorama.
4. Choose a hero with a real `walk` action and a natural source-derived cadence. Give it a path across the region. The
   square camera follows that hero. Do not substitute an idle bob or run animation.
5. Put additional, non-scene assets on each region's sheet. Every animated sheet sprite rotates through the set's full
   direction order on the same tempo. A design may appear in the region or its paired sheet, never both.
6. Write `sequence.json`, `regions/*.json`, and `sheets/*.json` using [sequence.md](references/sequence.md). Keep
   `tile_sprites`, `sheet_sprites`, story beats, and `required_packs` explicit so the checker can audit the plan.
7. Check every reference, direction, pack, story target, repeated prop, and region/sheet overlap:

   ```sh
   node scripts/assets/showcase/check.mjs \
     --project <project-dir> \
     --assets-root <asset-library-root> \
     --catalog <cards.index.json>
   ```

8. Render to a scratch output directory:

   ```sh
   node scripts/assets/showcase/render.mjs \
     --project <project-dir> \
     --assets-root <asset-library-root> \
     --catalog <cards.index.json> \
     --output <scratch-output>
   ```

   Use `--only <region-id>` during authoring. The compositor emits a looping H.264/yuv420p/faststart MP4, GIF fallback,
   and PNG poster for every region and every sheet, plus `manifest.json`.
9. QA start, middle, and end stills from every region and sheet using `gm-verify`. Look for empty edges, discontinuous
   seams, clipped feet, direction-order mistakes, repeated props, unreadable action/reaction pairs, and an unnatural
   walking cadence. Fix the worst visual defect and rerender before judging the next one.
10. Publish the baked files and manifest to the style-picker detail surface. The client uses the manifest's media files
    with `autoplay loop muted playsinline`; it never imports these tools, runs a game engine, or renders a canvas preview.
    Follow [publication.md](references/publication.md).

## Completion gate

The checker passes; every installed pack is represented; each region and sheet has been visually inspected; the hero
walks; every story has a target and reaction; paired scene/sheet casts do not overlap; and the published surface uses
only the generated MP4/GIF/poster files. Report any device or physical-phone check that was not run.
