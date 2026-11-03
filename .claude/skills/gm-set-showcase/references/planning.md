# Showcase planning

## Inventory table

Build this table from catalog cards before choosing scenes:

| Card | Pack | Kind | World/theme | Actions | Directions | Candidate use |
|---|---|---|---|---|---|---|
| `card:<pack>/<id>` | owning pack | character, animal, prop, terrain, effect | card-derived grouping | exact action names | exact card order | runner, region, sheet, or unused with reason |

Do not infer a crop, cell size, direction order, or animation name from a filename. The catalog or verified adapter fact
must supply it. Record every installed pack in `required_packs`; the checker rejects a pack that never appears.

## Region plan

Plan a connected route rather than independent stage boxes. For every stop write:

- its neighboring regions and the shared ground/edge treatment;
- the hero's entrance and exit path;
- one short story in the form “stable actor id does a real card action to stable target id; target reacts at contact”;
- region-only sprites and sheet-only sprites;
- which packs this stop covers;
- the stills that will make the story and seams judgeable.

For top-down art, repeat or extend grid-aligned ground beyond the camera. For isometric art, cover the square camera with
2:1 diamonds and keep adjacent cells on 45-degree seams. Background color is not ground coverage.

## Composition rules

- Start from the closest store thumbnail or official pack screenshot. Match its setting, ground and walls, prop choices,
  density, layering, and camera framing in a still before adding the story beat.
- Give every prop a purpose in the region's story or silhouette. Do not repeat one design inside a region. Crowd actors
  may use visibly different variants, never copies of the same sprite.
- Classify every region sprite as `actor`, `solid`, or `none`. Reserve the full declared footprint for actors and solid
  props before placing the next entity; anchor points alone are not collision geometry. Effects such as rain use `none`.
- Check the complete motion path, not only the authored still. Moving actors must keep their footprints disjoint on every
  output frame, and an actor may share visible pixels with a solid only while depth-sorted behind it.
- Use source-authentic walk timing. A walking hero is the continuity device between regions.
- Pair an action with a visible target and reaction. Record `[start, contact, end]`; the action runs once before contact,
  then the target reacts and settles. “Raider attacks” is incomplete; “raider strikes the gate, gate bobs once” is
  judgeable.
- Keep region and sheet casts disjoint, including alternate-resolution copies of the same design.
- Rotate every directional sheet sprite through all directions at one shared beat. Alternate actions only on that beat.
- Prefer a few readable actors over a dense pile of pack coverage. Put surplus assets on the paired sheet.
