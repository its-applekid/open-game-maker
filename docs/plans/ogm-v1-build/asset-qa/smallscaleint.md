# SmallScaleInt asset QA

This note records the layout facts and unresolved visual checks for the private
SmallScaleInt library. It contains no licensed images, download links, order
details, or serials.

## Reader assumptions

- Character frame folders use the vendor order `E, N, NE, NW, S, SE, SW, W`.
  Action sheets normally use one row per direction and one column per frame.
- Standard character frames are commonly 64×64. HD characters and tiles also
  use 128×128, 256×256, and larger frames; geometry is measured from each PNG
  rather than inferred from the pack name.
- `Shadowless` and `With shadow` sheets are variants of the same action. Their
  row and column counts must agree.
- `_E`, `_N`, `_NE`, `_NW`, `_S`, `_SE`, `_SW`, and `_W` suffixes are facings
  of one tile piece, not separate assets.
- Numbered PNGs below effects, animated tiles, destructible tiles, equipment,
  props, or projectile folders form one ordered animation card.
- A Unity `.anim` `m_SampleRate` is the FPS source. Missing or conflicting
  timing remains absent on the card; the reader does not invent a rate.

The reader rejects odd sheet geometry and disagreeing shadow variants. Those
failures should be checked before adding an exception: a silent guess would
make `gm assets use` return the wrong slice.

## Worlds

- `creatures`: the animals mega-pack. Dinosaur packs join this world when they
  are imported; they are not part of the current 26-pack set.
- `modern-zombie`: zombie packs, rural and interior zombie tiles, the survivor
  and thug characters, and the HD enemy pack.
- `fantasy`: knight, generic character, archer, barbarian, orc/goblin, demon,
  undead, desert/fantasy tiles, demo, and projectile packs.

The demo knight and full knight packs, plus generic and HD character packs,
may contain duplicate characters. They remain separate cards because their
source pack, scale, action coverage, or shadow treatment can differ. Compare
their contact sheets before choosing one for a game.

## Compatibility

All 26 imported packs are one `smallscaleint` compatibility set: the owner
identified them as seamless, and their measured traits share an isometric 2:1
projection with related pixel scales and outline variants.

No positive `compatible_with` link is recorded to LimeZu or Kenney top-down
sets. Their `topdown` projection conflicts with SmallScaleInt's `isometric 2:1`
trait. A visual comparison against both vendors is still required on the real
library; add a positive link only if that comparison demonstrates a usable
cross-set match.

## Character creators

Unity packages are treated as untrusted tar archives. Only regular `asset`,
`asset.meta`, and `pathname` members are read; links, absolute paths, and
traversal are refused before a destination is installed. `layer-order.json`
uses Unity `m_SortingOrder` when present and deterministic path order otherwise.
Entries whose `order_source` is `path` need visual confirmation before
composition because the vendor supplied no explicit order.

## Real-library checks

The licensed corpus is not available in issue workspaces. On the asset-library
host, rebuild cards and sheets, then:

1. Confirm all 26 collections have semantic cards and the card index has zero
   errors; no directory of numbered frames should produce one card per frame.
2. Slice three characters at different scales from their action sheets and
   compare the pixels with the matching per-frame folders.
3. Review every character sheet, tileset-category sheet, and the `fantasy`,
   `modern-zombie`, and `creatures` lineups for missing or duplicate entries.
4. Run `knight attack`, `zombie`, and `desert chest` searches both without a
   game lock and with a game locked to one SmallScaleInt pack.
5. Compare representative fantasy, modern-zombie, and creatures lineups by eye
   with the LimeZu and Kenney top-down sets and record whether any positive
   compatibility link is justified.
