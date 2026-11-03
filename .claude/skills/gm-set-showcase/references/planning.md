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
- the prior-version or design-derived density baseline, the new scene-element count, and the gameplay purpose of each
  structure or prop cluster;
- the protected focal zones for the hero, portal or objective, and active story pair;
- one short story in the form “stable actor id does a real card action to stable target id; target reacts at contact”;
- region-only sprites and sheet-only sprites;
- which packs this stop covers;
- the start, contact, reaction, result, end, and seam stills that will make the story and movement judgeable.

For top-down art, repeat or extend grid-aligned ground beyond the camera. For isometric art, cover the square camera with
2:1 diamonds and keep adjacent cells on 45-degree seams. Background color is not ground coverage.

## Composition rules

- Start from the closest store thumbnail or official pack screenshot. Match its setting, ground and walls, prop choices,
  density, layering, and camera framing in a still before adding the story beat.
- Give every prop a purpose in the region's gameplay, structure, or silhouette. Meet an explicit scene-element target
  with buildings, boundaries, work areas, furniture, or other thematic clusters; repeated loose filler does not count.
- Do not repeat one design inside a region. Crowd actors may use visibly different variants, never copies of the same
  sprite.
- Build one coherent ground language per region. Roads, paths, plots, curbs, and borders need compatible transition
  tiles instead of arbitrary patterns touching edge-to-edge.
- Classify every region sprite as `actor`, `solid`, or `none`. Reserve the full declared footprint for actors and solid
  props before placing the next entity; anchor points alone are not collision geometry. Effects such as rain use `none`.
- Treat the ground contact point as a sprite's footprint. Sort ordinary sprites by projected footprint depth, then use
  narrow priority exceptions only for protected focal elements. Tall art may overlap plausibly, but it must not hide the
  hero, objective, portal opening, contact effect, or active story pair.
- Check the complete motion path, not only the authored still. Moving actors must keep their footprints disjoint on every
  output frame, and an actor may share visible pixels with a solid only while depth-sorted behind it.
- Anchor multi-part props to one origin and facing. Check the assembled result: an effect fills its frame or arch, and
  no unrelated prop blocks the interactive opening.
- Make interiors read as connected cutaway rooms: continuous walls, doors and windows in those walls, furniture against
  plausible surfaces, and signs, banners, paintings, windows, or torches mounted rather than floating.
- Use source-authentic walk timing. Derive travel distance from cadence and duration, and make each region's exit equal
  the next region's entrance. A walking hero is the continuity device, so a seam teleport is a failed route.
- Pair an action with a visible target and reaction. Face both participants toward each other, align contact to the
  source action's strike frame, and record `[start, contact, end]`; the action runs once before contact, then the target
  plays a visible hit, stagger, knockback, or death response once and settles. “Raider attacks” is incomplete; “raider
  strikes the gate, gate recoils once” is judgeable.
- Seed particle emitters so rerenders are deterministic, but vary position, speed, phase, and lifetime across the full
  viewport. Inspect a timeline for synchronized rows, identical phases, sparse corners, and an obvious loop reset.
- Keep region and sheet casts disjoint, including alternate-resolution copies of the same design.
- Rotate every directional sheet sprite through all directions at one shared beat. Alternate actions only on that beat.
- Keep actors readable inside dense scenes. Put surplus character designs on the paired sheet instead of crowding focal
  zones, but do not use the sheet as an excuse for a sparse or stage-like world.
