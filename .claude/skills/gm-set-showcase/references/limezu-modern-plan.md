# LimeZu Modern dry-run plan

Set: `limezu-modern`. Style family: crisp modern top-down pixel art. Verified adapter facts: orthogonal grid; direction
rows `down,left,right,up`; source crops and cell sizes come from cards; stationary actors preserve their previous facing.

The dry run uses Modern Exteriors for a paved plaza, mall, and market cart, plus Modern Farm's RPG Maker MV farmer atlas
for the runner and a second farmer on the paired sheet. The set's collection catalog currently supplies the inventory;
the example catalog overlay records the four measured render crops without shipping asset bytes.

## Region: market-errand

- Route: the farmer walks left-to-right across a square paved plaza; the camera follows on the orthogonal grid.
- Story: the walking farmer reaches the fruit cart; the cart bobs once at contact and settles. The cart is a visible
  stable-id target, so the beat is not an action in empty air.
- Region cast: pavement, mall, fruit cart, walking farmer.
- Sheet cast: a different farmer, rotating `down,left,right,up` on a shared 1.25-second beat.
- Coverage: `limezu-modern-exteriors` and `limezu-modern-farm`.
- QA: start/middle/end region stills show ground coverage and the mall/cart composition; sheet stills cover all four
  directions. The poster is the middle frame. The all-frame collision report must stay at zero for full footprints and
  disallowed actor/solid pixel intersections.

Files under `examples/limezu-modern/` are the runnable project. Use `catalog.example.json` only as a local overlay for
an installed licensed copy of those packs. Render output belongs in scratch storage and is deliberately not committed.
