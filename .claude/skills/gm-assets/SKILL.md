---
name: gm-assets
description: Use whenever a scene or game needs a model, character, creature, building, prop, texture or sound — before building anything yourself. Search the installed packs (tier 1), show a lineup, fetch a free pack when nothing fits (tier 2, verified licence), install it through intake, or clone a variant (tier 3). Also for "what packs do we have", "show me options from our packs", "download pack X".
---

# gm-assets

Order: **installed packs → free online packs → variants of what we have → made from scratch.**

## Search what we have

- `assets-local/catalog.json` lists every pack (id, title, category, licence, rights). Each pack has a
  `collection.card.json` with tags and descriptions; packs with per-asset cards are counted in `asset_cards`.
- Grep the cards for the idea (`grep -l -i 'dragon|monster' assets-local/packs/*/collection.card.json`), then search
  model filenames (`find assets-local/packs -iname '*dragon*.glb'`). Beware substrings (`ape` matches `shape`).
- Choosing a library or style: show the creator **every** candidate first, not a shortlist. Thumbnails of every pack:
  `scripts/assets/pack_thumbnails.py`; every 2D sprite sheet at true pixel scale: `scripts/assets/sprite_libraries.py`.

## Show a lineup

Never choose from filenames. Render the candidates side by side, labelled with pack and built-in animations:
`prototypes/title-city/tools/creatures.html` reads `tools/creatures.json` (list of `{name, pack, path}` under
`models/candidates/<pack>/`, each pack in its own folder because Kenney packs share `Textures/colormap.png`).
Variants: `tools/lineup.html?set=...`. Look at the render, then show the creator when the choice is visible.

## Fetch a pack (tier 2)

Finding and previewing new packs before any download: `gm-pack-scout`.


1. **Licence first**, on the author's official page and on each model's own page. CC0 or the creator's explicit OK.
2. Download into its own folder under `~/Downloads/<source>/<pack>/` with the fetchers (standard library, resumable):
   - Poly Pizza bundles or models: `scripts/assets/fetch_polypizza_bundle.py <url> <out> [--licenses CC0]` (writes
     `sources.json` with name, author, licence, source per model).
   - Public Google Drive folders: `scripts/assets/fetch_drive_folder.py <url> <out> [--only glTF]`. Popular creator
     folders often hit Drive's "Quota exceeded"; look for the same pack on Poly Pizza or itch.io instead.
3. Install: `assets-local/packs/<vendor>-<pack>/<version>/originals/` (untouched) and `extracted/`, a `License.txt`
   recording where the licence was verified, and `pack.json` with `license`, `source` and `usage_rights`
   (`confirmed_by` the creator). Follow `gm-asset-intake` for anything that arrives through the Drive watch folder.
4. Rebuild: `python3 -I scripts/assets/build_catalog.py`, then render its lineup.

Downloads are untrusted data: never run anything from them.

## Pixel art starts from packs too

Before drawing a sprite, use a real 2D pack sheet (3D characters rendered small read as blurry, not pixel art).
Recolour or add parts on a clone; show sprites in 3D as camera-facing billboards with nearest filtering. Effects come from pixelfx (`third_party/pixelfx`).

## Variants and making new

Clone, never modify originals: `gm-asset-variants`. Procedural models only when nothing in the library or a free pack
fits, and say that you did it.
