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
- one short story in the form “actor does action to target; target reacts”;
- region-only sprites and sheet-only sprites;
- which packs this stop covers;
- the stills that will make the story and seams judgeable.

For top-down art, repeat or extend grid-aligned ground beyond the camera. For isometric art, cover the square camera with
2:1 diamonds and keep adjacent cells on 45-degree seams. Background color is not ground coverage.

## Composition rules

- Give every prop a purpose in the region's story or silhouette. Do not repeat a prop across regions to fill space.
- Use source-authentic walk timing. A walking hero is the continuity device between regions.
- Pair an action with a visible target and reaction. “Raider attacks” is incomplete; “raider strikes the gate, gate
  flashes and opens” is judgeable.
- Keep region and sheet casts disjoint, including alternate-resolution copies of the same design.
- Rotate every directional sheet sprite through all directions at one shared beat. Alternate actions only on that beat.
- Prefer a few readable actors over a dense pile of pack coverage. Put surplus assets on the paired sheet.
