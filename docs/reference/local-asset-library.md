# Local asset library (`assets-local/`)

Purchased and downloaded asset packs live in `assets-local/` at the repo root. Git ignores the folder, because some packs are personal licenses and none of the raw files may be committed. `gm packs import` writes this layout, and the originals here are the off-Railway backup that B11 asks for.

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
  previews/<hh>/<hash>-<kind>.<ext>   # card previews (thumb, sheet, waveform PNG, 2 s clip OGG) of shareable assets
  private/
    previews/<hh>/...                  # previews of private vendors' assets (never served publicly)
    hash-manifests/<name>.txt          # "sha256  bytes  path" of every file of a collection, carded or not
    blocklist/redistribution-none.txt  # gm packs blocklist: the commit check's hash feed (OGM_BLOCKLIST_FILE)
  derived/<pack-id>/                   # variants made from a pack's files; inherit its rights
  derived/kaykit/lineups/              # set-wide thumbnail lineups per category, paginated (preprocess_kaykit.py)
  index/cards.index.json               # gm's card index (gm packs index rebuilds it)
  inbox/                               # Drive watch-folder intake (scripts/drive-sync/)
    queue.jsonl                        # one line per downloaded drop, appended by the listener
    quarantine/<time>-<slug>-<id8>/
      manifest.json                    # Drive ids, MD5s, kinds, license files, archive checks, strict default rights
      files/...                        # downloaded files, read-only, never unpacked or run here
      intake.json                      # service result; confirmation updates awaiting-license to imported
```

- **Pack ids** are `<vendor>-<name>` in kebab case, e.g. `synty-polygon-viking-realm` or `kenney-racing-kit`. Kenney's `Archive` and `Early access` copies add `-archive` and `-early-access` suffixes, because their names clash with current packs.
- **Versions** come from the vendor: the archive name for Synty (`v3`, `1.0.4`), and the pack's `License.txt` for Kenney (`2.0`), falling back to the bundle version. A new version goes in a new folder next to the old one, and `current` in `pack.json` moves to it.
- **Packs from a bundle** keep no originals of their own. `pack.json` points at the bundle and the path inside it.

## Hash blocklist and preview blobs

`gm packs blocklist` hashes every file of each collection whose resolved `redistribution` is `none`: `packs/<id>/<version>/{originals,extracted}` (or all of `inspiration/<id>/`), every preview its cards reference, `derived/<id>/`, and the lines of its `collection_info.hash_manifest` (re-prefixed `manifest/<id>/`). It writes one sorted `sha256  bytes  path` line per file to `$OGM_BLOCKLIST_FILE`, else `private/blocklist/redistribution-none.txt`, with paths relative to `assets-local/`. The commit service refuses any file whose sha256 is listed. Re-runs only hash files whose size or mtime changed (`private/blocklist/cache.json`); `--no-cache` rehashes everything. Rights come from a fresh read of the cards, and an unreadable collection card makes the command exit 1.

`gm packs index --import-previews` copies `previews/`, `private/previews/` and `private/hash-manifests/` into the blob store at `$OGM_BLOB_ROOT` (content-addressed, idempotent) and records `previews.blob` and `visibility` (`private` for `private/` keys) on the index entries. Card files and originals are never written or moved.

`gm packs index --families` recomputes every style family's coverage from the rebuilt card index and rewrites `packages/asset-cards/data/style-families.json`. If a family offered during game creation no longer has characters, environment, or props, the command exits 1 and leaves the family file unchanged.

## `pack.json`

```json
{
  "id": "synty-polygon-shopping-plaza-map",
  "vendor": "synty",
  "title": "POLYGON - Shopping Plaza Map",
  "category": null,
  "license": "synty-personal",
  "license_source": "Synty personal-use licence",
  "attribution": "none required",
  "source": {"label": "Synty Studios", "url": "https://example.com/vendor-pack"},
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
- `attribution` is the exact credit line, or the literal `none required`. `source` names the vendor or drop and may
  include its public source URL. These four fields are copied into every game lock entry; paid pack bytes and download
  locations are never exposed.
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

- `audit_license_metadata.py`: lists every installed pack whose `pack.json` lacks licence, licence source, explicit
  attribution, or source metadata. Run `python3 scripts/assets/audit_license_metadata.py assets-local` after imports.
- `import_synty.py`: moves the listed Synty downloads from `~/Downloads` into `packs/`, then unpacks and writes `pack.json`. Add new rows to `PACKS` for new downloads. Packs already extracted are skipped.
- `import_kenney_bundle.py`: splits the Kenney All-in-1 zip into one pack per folder, reads each `License.txt`, and installs the launcher under `tools/`. Some archive packs ship as a zip inside the bundle; those were unpacked afterwards, and `pack.json` records them in `inner_archives_unpacked`.
- `build_catalog.py`: rebuilds `catalog.json`. Run it after any import.
- `preprocess_kaykit.py`: validates every canonical KayKit glTF or GLB, prefers glTF when both formats exist, and emits model cards plus standalone animation cards with target rigs and searchable clip metadata. Each card carries the layer-1 tags a name and a measurement can carry (`describe.description`, `objects`, `keywords`) and the measured texture sizes (`geometry.texture_sizes`, `max_texture_px`); a character lists the clips of every clip library that shares its rig, so search and `gm assets info` answer without opening a file. It attaches source variants and resources, renders thumbnails, per-pack lineups and paginated set-wide lineups per category (`derived/kaykit/lineups/`), writes a QA report (load failures, categories, texture budget, characters with no clip library, pivots, scale, missing variants and previews), and rebuilds the catalog and card index. Pass `--root <asset-library>` when the library is not at `assets-local/`; the root must already contain `packs/`.
- `apps/web/tools/thumbnail-scene.mjs`: fetches local vendor references, builds deterministic card-backed specimen sheets, and renders 2D still/living dioramas. See [Thumbnail scenes](thumbnail-scenes.md) for the private output layout and commands.

## Audio: carding every library and finding it by mood

Every music track and sound effect gets a C3 audio card, so a game build never has to listen to a file to choose it.
One pass runs over the whole library, in this order:

```sh
.venv/bin/python -I scripts/py/audio/analyze.py --packs assets-local/packs       # measures + CLAP embeddings, one sidecar per file
.venv/bin/python -I scripts/py/audio/build_audio_cards.py --packs assets-local/packs   # the cards, validated by the contracts validator
gm packs index                                                                   # rebuilds index/cards.index.json
```

`analyze.py` writes a sidecar next to nothing that ships (beats, sections, loudness curve, loop points, embeddings) and
`build_audio_cards.py` turns it into the card. Music cards carry `describe.moods`, `describe.genre`,
`describe.instruments` and `describe.game_fit`; sound-effect cards carry `describe.objects` and `describe.materials`
instead, never a genre. Both carry `audio.search_notes`, one line saying what the file is, and each collection card
carries `collection_info.search_summary`, one line saying what the library holds and which moods it covers — the
answer to "which pack has feet on gravel" before opening anything. Mood, genre, instrument and `game_fit` values are
the enums in `packages/contracts/schemas/asset-card.schema.json`; `scripts/py/audio/test_labels.py` fails if the card
step's label table and that schema drift apart.

Search by the direction, not the pack:

```sh
gm assets search --kind audio --mood tense            # every tense track and effect, any pack
gm assets search --kind audio --mood calm --genre orchestral
gm assets facets --kind audio                          # moods, genres, instruments, game_fit counts
gm assets info <id> --json                             # the whole card, including audio.search_notes
```

`--mood` is all-of (a card must carry every mood given) and `--genre` is any-of, and an unknown value is refused with
the list of moods the cards use. Packs are purchased assets: analysis is local only, no model is trained on them, and
Sonniss and Synty audio never leaves the host.

## Drive inbox (`scripts/drive-sync/`)

`drive_sync.py` watches one shared Google Drive folder with a read-only service account. It waits until each drop (a top-level file or subfolder) has settled, downloads it into a fresh `inbox/quarantine/` folder, verifies MD5s, and tests archives for zip-slip, links, corruption and size limits without unpacking them. Then it writes `manifest.json` with strict default rights (`vision-input` only, private, no redistribution) and queues the drop. Setup and details are in `scripts/py/drive-sync/README.md`.

Every archive is checked for absolute and `..` paths before it is extracted. KayKit glTF/GLB cards and previews can be generated with `preprocess_kaykit.py`; the general importer below handles other supported library formats.

`@ogm/intake` polls the queue every 30 seconds. It records failed integrity checks as `blocked`, skips duplicate drop-id/MD5 sets, and runs the safe importer for valid drops. A Kenney drop is auto-confirmed only when its normalized `License.txt` exactly matches the SHA-256 whitelist in the licence table; vendor or CC0 keywords do not grant rights. Unknown licences remain `awaiting-license` and invisible to game search until a named human confirms them. The service status is `~/.local/state/ogm/intake/status.json`; it never moves or deletes quarantine or Drive files.

Import a local directory or archive directly:

```sh
gm packs import <dir-or-archive> --id <vendor-name> --version <version> --json
```

The importer copies originals, preflights every archive member before extraction, performs one nested-archive pass, drops executables, writes cards and image thumbnails, and leaves unknown licences quarantined. Confirm a reviewed collection with:

```sh
gm packs import --confirm <collection-id> --license <SPDX-or-LicenseRef> --confirmed-by kevin --json
```

Confirmation recomputes effective rights from the licence table and makes draft/measured assets searchable. Tagging and rendered 3D previews remain OGM-065 work.

## Pinned tier-2 mirrors

List the approved git and npm mirrors, including their reviewed pins and licence mode:

```sh
gm packs sync --list
```

`gm packs sync kaykit`, `lpc`, `game-icons`, or `fontsource:<font>` fetches only the pinned public source into `~/Downloads/ogm-mirrors/`, verifies the commit or package version, writes `sources.json`, and imports the kept files as `t2:` cards. A real sync requires `--confirmed-by <human>`; inspect its network-free plan first with `--dry-run`. LPC share-alike items are excluded unless the operator passes `--include-sa`; GPL items and anything without a machine-readable licence are always dropped.

The command is operator-only: it refuses game repositories, `GM_JOB` jobs, and Aiur ticket workspaces. It never runs package scripts or reads provider keys. The underlying importer accepts `--tier 2 --license <SPDX> --license-map <json> --confirmed-by <human>` for the mirror handoff; normal local and Drive imports remain tier 1.
