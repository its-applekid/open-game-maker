# Local asset library (`assets-local/`)

Purchased and downloaded asset packs live in `assets-local/` at the repo root. Git ignores the folder, because some packs are personal licenses and none of the raw files may be committed. This layout copies the bucket layout in B11 §4.1, so the future `gm packs import` can read straight from it, and the originals here are the off-Railway backup that B11 asks for.

## Layout

```
assets-local/
  catalog.json                         # generated: one entry per pack (scripts/assets/build_catalog.py)
  packs/<pack-id>/
    pack.json                          # manifest (below)
    icon.png                           # vendor preview, when there is one
    <version>/
      originals/                       # untouched download (zip / unitypackage), for re-import
      extracted/                       # unpacked content; vendor wrapper folders stripped
  bundles/<bundle-id>/
    bundle.json                        # which packs came out of this bundle
    <version>/originals/               # the bundle archive, stored once
    <version>/extracted/               # bundle-level leftovers (readme, vendor index, goodies)
  tools/<tool-id>/<version>/           # vendor apps, e.g. the Kenney launcher AppImage
  inspiration/<id>/<version>/          # reference-only collections (no in-game rights), same shape as packs/
  previews/<hh>/<hash>-<kind>.webp     # card previews (thumb, sheet, waveform, clip) of shareable assets
  private/
    previews/<hh>/...                  # previews of private vendors' assets (never served publicly)
    hash-manifests/<name>.txt          # "sha256  bytes  path" of every file of a collection, carded or not
    blocklist/redistribution-none.txt  # gm packs blocklist: the commit check's hash feed (OGM_BLOCKLIST_FILE)
  derived/<pack-id>/                   # variants made from a pack's files; inherit its rights
  index/cards.index.json               # gm's card index (gm packs index rebuilds it)
  inbox/                               # Drive watch-folder intake (scripts/drive-sync/)
    queue.jsonl                        # one line per downloaded drop, appended by the listener
    quarantine/<time>-<slug>-<id8>/
      manifest.json                    # Drive ids, MD5s, kinds, license files, archive checks, strict default rights
      files/...                        # downloaded files, read-only, never unpacked or run here
      intake.json                      # written by the gm-asset-intake skill when the drop is handled
```

- **Pack ids** are `<vendor>-<name>` in kebab case, e.g. `synty-polygon-viking-realm` or `kenney-racing-kit`. Kenney's `Archive` and `Early access` copies add `-archive` and `-early-access` suffixes, because their names clash with current packs.
- **Versions** come from the vendor: the archive name for Synty (`v3`, `1.0.4`), and the pack's `License.txt` for Kenney (`2.0`), falling back to the bundle version. A new version goes in a new folder next to the old one, and `current` in `pack.json` moves to it.
- **Packs from a bundle** keep no originals of their own. `pack.json` points at the bundle and the path inside it.

## Hash blocklist and preview blobs

`gm packs blocklist` hashes every file of each collection whose resolved `redistribution` is `none`: `packs/<id>/<version>/{originals,extracted}` (or all of `inspiration/<id>/`), every preview its cards reference, `derived/<id>/`, and the lines of its `collection_info.hash_manifest` (re-prefixed `manifest/<id>/`). It writes one sorted `sha256  bytes  path` line per file to `$OGM_BLOCKLIST_FILE`, else `private/blocklist/redistribution-none.txt`, with paths relative to `assets-local/`. The commit service refuses any file whose sha256 is listed. Re-runs only hash files whose size or mtime changed (`private/blocklist/cache.json`).

`gm packs index --import-previews` copies `previews/`, `private/previews/` and `private/hash-manifests/` into the blob store at `$OGM_BLOB_ROOT` (content-addressed, idempotent) and records `previews.blob` and `visibility` (`private` for `private/` keys) on the index entries. Card files and originals are never written or moved.

## `pack.json`

```json
{
  "id": "synty-polygon-shopping-plaza-map",
  "vendor": "synty",
  "title": "POLYGON - Shopping Plaza Map",
  "category": null,
  "license": "synty-personal",
  "requires": ["synty-polygon-shops"],
  "current": "v2",
  "versions": {
    "v2": {
      "format": "source-zip",
      "originals": ["POLYGON_Shopping_Plaza_Map_SourceFiles_v2.zip", "Read_Me_Shopping_Plaza_Map.txt"],
      "extracted_files": 464,
      "file_types": {"fbx": 416, "png": 43, "tga": 3, "txt": 2},
      "added": "2026-10-25"
    }
  }
}
```

- `license` is an SPDX id (`CC0-1.0`) or a vendor class (`synty-personal`: personal purchase under the Synty EULA, never committed or redistributed). `license_source` says where the license came from when the pack has no license file.
- `format` is one of:
  - `source-zip`: the vendor's engine-neutral FBX/PNG download;
  - `unitypackage`: unpacked without Unity, with Unity `.meta` files dropped and `.prefab`/`.mat` kept as references;
  - `bundle`: the pack came out of a bundle (`bundle`, `bundle_path`).
- `requires` lists packs this one needs, e.g. a map pack that reuses another pack's models.

## Which download to take

| Vendor format | Take it? |
|---|---|
| Synty **SourceFiles** / **Source_Sprites** | Yes, first choice. Plain FBX/OBJ/PNG. |
| Synty **Unity** `.unitypackage` | Only when there is no SourceFiles option. It is a tar.gz with raw FBX/PNG inside. |
| Synty **Unreal** zip, Sidekick Character Tool (UE) | No. Only `.uasset` files, which need the Unreal Editor (B12). |
| Kenney All-in-1 | Yes. CC0; each pack already ships GLB/OBJ/FBX/PNG/OGG. |

## Scripts (`scripts/assets/`)

- `import_synty.py`: moves the listed Synty downloads from `~/Downloads` into `packs/`, then unpacks and writes `pack.json`. Add new rows to `PACKS` for new downloads. Packs already extracted are skipped.
- `import_kenney_bundle.py`: splits the Kenney All-in-1 zip into one pack per folder, reads each `License.txt`, and installs the launcher under `tools/`. Some archive packs ship as a zip inside the bundle; those were unpacked afterwards, and `pack.json` records them in `inner_archives_unpacked`.
- `build_catalog.py`: rebuilds `catalog.json`. Run it after any import.

## Drive inbox (`scripts/drive-sync/`)

`drive_sync.py` watches one shared Google Drive folder with a read-only service account. It waits until each drop (a top-level file or subfolder) has settled, downloads it into a fresh `inbox/quarantine/` folder, verifies MD5s, and tests archives for zip-slip, links, corruption and size limits without unpacking them. Then it writes `manifest.json` with strict default rights (`vision-input` only, private, no redistribution) and queues the drop. It never imports into `packs/`. The `gm-asset-intake` skill (`.claude/skills/gm-asset-intake/`) does that once the license is known and Kevin has confirmed the rights. Setup and details are in `scripts/drive-sync/README.md`.

Every archive is checked for absolute and `..` paths before it is extracted. Conversion to GLB, tagging and previews (B11 §4.2 steps 2–5) are not done yet; this library is the input for that importer.
