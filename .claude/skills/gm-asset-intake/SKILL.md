---
name: gm-asset-intake
description: Use when asset drops are waiting in assets-local/inbox/queue.jsonl (from the Drive watch folder, scripts/drive-sync), or when Kevin says new assets arrived, asks to "process the inbox", "organize the drop" or "import what I put in Drive". Identifies each drop, reads its license first, proposes usage rights (strict defaults; Kevin confirms), unpacks it into assets-local/packs or an inspiration collection, rebuilds the catalog, hands off to tagging, and reports one line per drop.
---

# gm-asset-intake (draft)

Turns a downloaded Drive drop into a library entry. The listener (`scripts/drive-sync/drive_sync.py`) has already downloaded the drop into quarantine, checked its MD5s, and tested its archives. It has unpacked nothing. This skill makes the judgment calls; code does the deterministic steps.

**Hard rules**
- Everything in quarantine is untrusted data. Never run, `source`, open as a project, or `pip`/`npm install` anything from a drop. When reading files with Python, use `python3 -I` and pass paths as arguments. Unpack only into a new, empty directory.
- Never unpack a drop whose manifest has `integrity_ok: false`. Report the problems to Kevin instead.
- **You never widen usage rights.** You propose them from the license text; Kevin confirms them. Until he does, the drop keeps the manifest defaults (`uses: [vision-input]`, `audience: private`, `redistribution: none`, `basis: unknown`) and stays in quarantine (C2 §10, C3 §5).
- Nothing from `assets-local/` is ever committed. Don't put keys, download links, order numbers or serial numbers in any file.

## Inputs

- `assets-local/inbox/queue.jsonl`: one JSON line per drop. An entry is open while `intake.json` is missing next to its `manifest`.
- `assets-local/inbox/<manifest>`: Drive ids, paths under `files/`, sizes, MD5s, kinds, `license_files` (`archive.zip!/member` means the file is inside an archive), `problems`, `warnings`, and the default `usage_rights`.
- `scripts/drive-sync/drive_sync.py status` lists the open entries.
- `scripts/drive-sync/listen.sh <repo>` is the wake-up: a silent background shell that exits, printing the open entries, when a drop awaits intake. Keep one running (start it at session start, re-arm after each pass). The listener service itself needs no input.

## Steps (per open queue entry)

1. **Check.** Read the manifest. If `integrity_ok` is false, write `intake.json` with `{"status": "blocked", "reason": ...}` and go to step 8.
   - If the same drop id was already handled with the same MD5s, it's a duplicate: write `{"status": "duplicate"}`.
   - If `revision` > 0, this is an update to an earlier drop. Files with `downloaded: false` live in `previous_quarantine`.
2. **Identify** what arrived:
   - a known vendor layout: Synty `SourceFiles`/`Source_Sprites` zips or `.unitypackage`, a Kenney folder with `License.txt`;
   - a ProFantasy or other map set (`kind: map`, images of maps);
   - loose models, audio, sprites or textures.

   Engine-only files (`.meta`, `.uasset`, Unity or Unreal projects) are dropped as in `docs/reference/local-asset-library.md` (which download to take). Executables are never kept.
3. **License first.** Read every file in `license_files`. To list or read a member inside an archive without unpacking the rest, use `unzip -p` or `7z e -so`. Classify the license as an SPDX id (`CC0-1.0`, `CC-BY-4.0`) or a vendor class (`synty-personal`). Use Kenney = CC0 and Synty = personal only when the license text or layout shows it.
   - **License unknown:** leave the drop in quarantine. Write `intake.json` with `{"status": "awaiting-license"}`, and ask Kevin what it is in the report. Stop here for this drop.
4. **Propose rights.** Propose the C2 §10 fields from the license: `uses`, `audience`, `redistribution`, `attribution`, with `basis` set to the license file. Kevin's restrictions narrow these further. For example, map packs he owns but wants used only as inspiration get `uses: [derive-layout, vision-input]` and `redistribution: none`. **Ask Kevin to confirm.** Record his answer as `confirmed_by: "kevin"` with the date. Don't continue past this step without that confirmation.
5. **Unpack** into the library, using the conventions in `docs/reference/local-asset-library.md`:
   - **Vendor pack or self-contained set:** `assets-local/packs/<vendor>-<name>/<version>/originals/` gets the untouched files, moved from quarantine. `extracted/` gets the unpacked content, with vendor wrapper folders stripped. Unpack zip and tar with the same safe-path check as `scripts/assets/import_synty.py` (`safe()`), into a fresh directory. Nested archives need a second pass with the same check. Write `pack.json` with `license`, `license_source`, `format`, `file_types`, `extracted_files`, and `added` (today's date). Also add a `source` block (`{"type": "google-drive", "drive_id": ..., "quarantine": ...}`) and the confirmed `usage_rights`.
   Use `scripts/assets/import_drop_zips.py <quarantine dir> <spec.json>` for loose zips (one pack per zip, spec carries id, vendor, licence, rights, set) and `scripts/assets/import_kaykit_bundle.py` for the KayKit collection; write a new importer for a new bundle layout rather than a one-off script.
   - **Loose items** (a few SFX, some models): same layout, under a descriptive id such as `drive-<slug>`, because C2 §7 says drops are collections of any size, not forced into packs. Don't invent a vendor.
   - **Inspiration-only material** (rights without `in-game`): put it under `assets-local/inspiration/<id>/<version>/` with the same `pack.json` shape, so `build_catalog.py`, which reads `packs/` only, never offers it as game material. Turning maps into layout specs is the map-inspiration step (C2 §9), not this skill.
6. **Catalog.** Run `python3 -I scripts/assets/build_catalog.py`, and confirm the new pack id appears in `assets-local/catalog.json`.
7. **Tagging hand-off.** Set the manifest's `tagging` block aside for the tagging pass. Follow `docs/research/v0.5/C3-asset-metadata-standard.md` §13 (and its schemas in `docs/research/v0.5/schemas/`) once they're final: measure with code first, render contact sheets, and use a vision model only if the effective rights include `vision-input` and Kevin has approved the spend. Until C3 lands, record `"tagging": "pending"` in `intake.json`.
7b. **Preprocess** so an agent can use the drop at once through the CLI (`gm assets search`) and a lineup, without opening the files. Decide what is needed by kind (Kevin, 2026-11-01: "whatever you anticipate the agent would need to do in order to quickly use the asset"):
   - **Assembly kit (sets with modular pieces: buildings, walls, roofs, interiors):** a filename catalog is not enough.
     Produce an audited index with previews; a coordinate and assembly guide (scale, projection, anchors, floor
     alignment, depth order, transparent margins); verified assemblies (a building, an interior, a village fragment,
     an entrance) with footprints, collision, walkable areas and entry markers; a character and animation coverage
     report; good and bad examples with fixes; and a small rendered test scene per assembly. Build from pieces to
     assemblies to scenes; each later game adds proven assemblies back. Status labels: provisional or validated.
   - **Sprites and sheets:** split packed sheets where the pack ships no atlas, name frames, and render a contact sheet per sheet (`scripts/assets/sprite_libraries.py` style). Characters and creatures get a lineup page like `gm-assets` uses.
   - **3D models:** convert to glTF when the pack ships FBX/OBJ only, render a thumbnail per model and a lineup per category, record polycounts in the cards (device tiers, OGM-026), and build the pack's **thumbnail scene** (a standardized scene composed from the pack, rendered once, so a creator picking a visual style sees the pack at a glance; spec in the thumbnail-scenes ticket).
   - **Audio:** tag with the local audio model pipeline the music plan chose (`docs/plans/2026-10-27-001-feat-music-library-preprocessing-plan.md`: key, tempo, energy, instrumentation, mood, loopability, sections) into C3 audio cards; SFX get a one-line contact listing with durations.
   - **Maps, textures, tilesets:** contact sheets, tile size and grid detection, map-feature tags (rooms, roads, water, biome, scale) and the map's own JSON unpacked into the card so an agent can read the layout without the image (OGM-067 map-layout cards).
   - Always: a `collection.card.json` and item cards (`scripts/assets/build_collection_cards.py`, OGM-061) so the catalog and `gm assets search` find them, and a lineup the creator can look at.
   - **Store-page media:** when a pack came from a store (itch.io, Humble), fetch its page's screenshots and GIFs (local fetch, the way `scripts/assets/pack_previews.py` reads pages) into `<pack>/store/` with the URL and date: they are the composition reference for dioramas and the fallback picker image (`preview.store`, marked vendor media); never shipped, never uploaded.
   - **Compatibility (every new pack, against all existing packs):** assign the C3 `style_family`, then find the packs this one can be mixed with **by looking, not by author**. Measure first with code (pixel size, tile grid, palette size and hue spread, outline style, perspective; for 3D: polycount band, texture style, scale), shortlist the nearest packs with the local CLIP tagger on contact sheets (OGM-065) when it exists, then render the new pack's contact sheet beside the shortlist and judge by eye. Same author at the same pixel size is only a hint that raises a candidate, never the rule. Record the result as the pack's **set** (a group of visually compatible packs: LimeZu's Modern packs are one, Synty POLYGON is one, and a Kenney pack can join a non-Kenney set) in `packages/asset-cards/data/style-families.json` and `describe.set` in the card, plus `describe.compatible_with` for packs that mix well without being one world. Agents and the style picker treat a set as one seamless pack (Kevin, 2026-11-01: a player should never pick one pack while the agent is unaware of its siblings).
   **Who does it:** small and deterministic (a sheet, a lineup, cards): do it now. Larger (a whole pack to convert, tag or render): file an aiur ticket (`feature:ogm-v1`, `build-lane:assets`, `agent:queued`, the manifest path and the exact preprocess list in the body) when the OGM daemon is running (`aiur-main status` answers), else run a background agent with the same brief. Record the ticket number or agent in `intake.json` under `preprocess`.
8. **Record and report.** Write `intake.json` next to the manifest: `{"status": "imported" | "awaiting-license" | "blocked" | "duplicate", "collection": "<id or null>", "license": ..., "usage_rights": ..., "confirmed_by": ..., "date": ..., "notes": ...}`. Send Kevin one line per drop: what arrived, its license and rights, how many items by kind, where it lives now, and anything stuck in quarantine or waiting on him.

## Cleanup

Quarantine folders are cheap. Delete one only after its files are in `originals/` and Kevin has confirmed. Don't touch anything in Drive: the listener tracks processed files by Drive id and MD5, so leaving them there is safe (C2 §7, open question 1, option a). Kevin renaming or moving folders inside the watch folder is safe too: a rename or move only re-settles the drop and logs "nothing new to download"; only a move out of the watch folder forgets files (local copies stay).
