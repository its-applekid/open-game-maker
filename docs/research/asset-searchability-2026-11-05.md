# Asset searchability: make every asset cheap to find (2026-11-05)

Research for #364. Kevin's ask, verbatim:

> dont have agents pre-process or tag audio just yet until those later tickets. i get the sense we will need sound
> effects and all assets to be very easy to search by implementation agents. after all DLed, add a research ticket
> before the processing kicks off to see how we might make selection very easy and not resource or token intensive for
> agents. i want to avoid agents listening to or looking at thousands of GB of assets while making games. let the
> research inform the full asset pre-processing tickets to tag in depth for great searchability

This doc answers the six questions in the ticket with measurements taken on this host on 2026-11-05, and it is the plan
#509 (audio first), #353 (2D), #354 (3D), #355 (audio), #356 (maps) and #357 (audio styles) follow.

Everything here builds on C3 (`docs/research/v0.5/C3-asset-metadata-standard.md`): the card schema, the vocabularies,
the rights engine and §10's search sketch stay as they are. This doc decides what §10 leaves open — the index
technology, the result shape, the tag depth per kind, and the query contract the skills use.

## Recommendation

1. **Search queries a prebuilt index, never the card files.** `gm packs index` builds one SQLite database
   (`assets-local/index/assets.db`) next to today's `cards.index.json`: a `cards` table with the filterable fields as
   columns, an FTS5 table over the text, and the facet counters. `gm assets search` opens it read-only and does no
   scan. Measured: **0.7 ms at 2 000 cards, 12.8 ms at 200 000** against today's **183 ms / 30.6 s** (plus a full
   index parse on every CLI call). This is the single change that makes the library feel instant at any size.
2. **No new dependency and no server.** `node:sqlite` is in the Node 24 baseline the repo already requires, and FTS5 is
   compiled into the SQLite it ships (`SQLite 3.49.1`, checked on this host). Nothing else is needed: no vector
   database, no embedding service, no cloud.
3. **Text first, embeddings last and only for re-ranking.** Every query in §2 is answered by tokens plus filters.
   A local CLAP/CLIP embedding is stored on the card for "more like this" and for browsing, and it re-ranks the
   handful of text hits (2 ms for 200 candidates). Brute force over the whole library is not interactive in JS
   (1.0 s per 100 000 rows measured), so it never runs as the first step.
4. **An agent gets ids and one-line facts, never files.** One result row is ~90 characters (~25 tokens). The search
   tool returns a page of 20, plus facet counts; `gm assets info <id>` gives the details. A file is only opened for a
   2-second audio thumbnail or a 128-px tile, one at a time, behind an explicit flag, and never for 3D.
5. **Tag depth is a budget, not an ideal.** Filenames, folders, vendor lists (`Filelist.xlsx`, Synty `MaterialList`,
   Kenney `Tilesheet`) and code measurements cover most of what agents ask; a local model fills only the fields that
   names cannot carry (mood, genre, "what does it sound like", "what does it look like"). §5 prices each layer.

## 1. Scale: what the library holds

**What is committed and reliable today** (design packet §4, `local-asset-library.md`, and the tickets):

| Group | Packs / items | Notes |
| --- | --- | --- |
| Visual packs in style families | 291 | 78 chunky low poly, 11 detailed low poly, 2 simple low poly, 45 pixel art, 100 flat cartoon, 49 isometric 2D, 6 sketch |
| Audio | Sidetrax 128 packs, Abstraction 11 packs, Pixabay 554 tracks (20 moods), Kenney audio, Sonniss GDC bundles | Sidetrax is carded; Pixabay, Sonniss and the loop packs are imported but untagged (#509) |
| Sonniss GDC 2026 part 9 | 347 files, 7.47 GB, ~122 vendor libraries, 5 zips | the per-file average, 21.5 MB, is the anchor for the ~200 GB / 73 zips in the ticket: **≈10 000 SFX files** |
| ProFantasy bundle | ~7 000 `.FCW` maps, ~257 000 symbol/fill bitmaps, ~4 000 rendered maps | only rendered maps get cards; bitmaps go in the hash manifest (C3 §16) |

**Card count estimate for the whole library.** Sound effects dominate: ~10 000 Sonniss files (the one count we have),
554 Pixabay tracks, 334 Abstraction loops (#292), the Sidetrax packs and Kenney audio clips of unknown size, plus
visual cards — Kenney kits and characters, KayKit, Synty models, SmallScaleInt sprite frames (one card per frame, not
per sheet), LimeZu, UI, fonts, ~4 000 inspiration maps. It is an estimate: only the first two rows are counted facts.

- **~20 000 cards today, ~60 000 once Sonniss and the ProFantasy maps are carded.**
- §3 measures up to **200 000 cards**, three times the worst case, so the design has headroom and the 200 000 column
  is what "one card per file, including every SFX variation" costs.

**Not measured here: the real inventory.** `assets-local/` is a symlink to the shared library and is not mounted in
this ticket's sandbox, so counts by kind, bytes and "cards today" are quoted from the committed surveys above, not
counted. The harness fills that in on the host in one command (it also reports the `cards.index.json` card count):

```sh
node scripts/assets/asset-search-bench.mjs --root assets-local --cards 0 --queries 0   # §1 numbers
node scripts/assets/asset-search-bench.mjs --index assets-local/index/cards.index.json   # §3 on the real cards
```

**Metadata that is already free** — no model, no listening, no looking:

| Source | Gives |
| --- | --- |
| Sonniss filenames and folder names | UCS-style `CATID_Category_SubCategory_Descriptor_Variation` (weapons, foley, ambience, creatures); library folder = vendor + library name |
| Sonniss `Filelist.xlsx` | one description line per library, and the bundle's category |
| Synty `MaterialList_*.txt` | prefab → meshes, material slots, textures (C3 §16 measured: 321 KB for Goblin War Camp) |
| Kenney `Tilesheet.txt`, `License.txt`, folder names | tile size and spacing, licence, `Pack/Item` naming |
| KayKit glTF | rig ids, clip names, joint count (already used by `preprocess_kaykit.py`) |
| Pixabay playlist names | the 20 mood playlists are a mood vocabulary already |
| Sidetrax ID3/RIFF tags and `Tempo: N` labels | title, album, composer, tempo (C3 §3 "Music cards") |
| ffmpeg/ffprobe | duration, channels, rate, loudness (EBU R128), peak, spectral centroid, loop seam |
| Image headers | pixel size, alpha, palette, frames, grid |
| File hashes | near-duplicates across packs (Kenney archive copies) |

## 2. What an agent actually asks

Queries harvested from the skills that consume assets (`gm-core`, `gm-audio`, `gm-set-kaykit`, `gm-set-limezu-modern`,
`gm-set-smallscaleint`, `gm-3d`, `gm-ui-hud`, `gm-new-game-design`) and the design packet:

| Query (verbatim or near) | Source | Needs |
| --- | --- | --- |
| `gm assets search --kind audio` then pick a footstep | `gm-audio` | kind filter + short list |
| "footstep on gravel, short" | ticket | sound event + material + duration ceiling |
| "calm forest loop 60-90 s" | ticket | mood + environment + `loopable` + duration range |
| "upbeat chiptune for levels, calm ambient for menus" | design packet §4 | genre + mood + `game_fit` |
| "orc that can attack in 8 directions" | ticket | rig/clip compatibility across packs |
| "castle wall tile matching set X" | ticket | set/compat + kind + role |
| `gm assets search --set kaykit` / `--set smallscaleint` / `--set limezu-modern` | set skills | compatibility set |
| "something to block a corridor that fits a crypt" | C3 §10 | free text over objects/environments/roles |
| "small crypt 3-5 rooms one loop secret door" | C3 §10 | map layout spec search |
| "UI clicks, impacts, footsteps, sci-fi, retro bleeps" | design packet | subkind + style words |
| SFX variation sets (3-6 per category, e.g. footsteps grass/stone/wood/cave) | #488 | grouped variations of one sound |

**Three shapes cover all of them:**

1. **Filtered text**: 1-3 words + kind/subkind/family/set/use + a numeric range, ranked.
2. **Direction**: mood/genre axes over many packs, no pack choice (what #357 needs).
3. **Compatibility**: rig, clip, set, tile neighbours — an equality join on card fields, not text.

**The answer an agent needs, per hit, without opening the file:** `id`, `kind/subkind`, `status`, `style_family`/`set`,
duration (audio) or size/triangles (visual), rights use, and a one-line description. That is exactly `formatRow()` plus
the measured fields `info` already returns.

## 3. Index design, measured

### The harness

`scripts/assets/asset-search-bench.mjs` (new, committed with this doc) generates a card set shaped like C3 cards and
the library's mix (70 % audio, 12 % model, 10 % sprite, 4 % UI, 2 % texture, 2 % collection) and runs the same 20
queries through five engines:

- `linear` — a port of `packages/asset-cards/src/search.ts`: full scan, every card's fields re-tokenized per query.
  This is what `gm assets search` does today.
- `cached` — the same scan with token lists built once: the cheapest a full scan can ever be.
- `postings` — the JSON index plus inverted postings (token → card + weight), intersected per query.
- `fts5` — SQLite FTS5 (`node:sqlite`), `kind`/`subkind`/`family`/`status`/`uses` as columns, ranked `MATCH`.
- `shards` — JSON shards by kind, parsed and scanned per query.

It refuses to report if the engines disagree on which cards match (verified: the three full-text engines agree on
every query). Sizes are `JSON.stringify` of the same cards; the parse column is a whole-index `JSON.parse`, i.e. the
cold-start cost every `gm assets search` pays today.

```sh
node scripts/assets/asset-search-bench.mjs --cards 2000,10000,50000,200000 --queries 20 \
  --engines cached,postings,fts5,vectors
node scripts/assets/asset-search-bench.mjs --cards 2000,10000,50000 --queries 5 --engines linear,shards
```

### Results (query latency, ms; p50 / p95)

| cards | index JSON | linear (today) | cached scan | postings | FTS5 | FTS5 size on disk |
| --- | --- | --- | --- | --- | --- | --- |
| 2 000 | 1.5 MB, parse 45 ms | 183 / 203 | 17.6 / 21.6 | 0.67 / 2.77 | **0.68 / 1.81** | 1.2 MB |
| 10 000 | 7.6 MB, parse 194 ms | 817 / 863 | 67.6 / 90.0 | 1.23 / 8.39 | **1.30 / 6.30** | 7.2 MB |
| 50 000 | 38.1 MB, parse 1.0 s | 4 670 / 4 957 | 397 / 499 | 5.76 / 29.5 | **5.55 / 27.9** | 32.7 MB |
| 200 000 | 152 MB, parse 6.8 s | 30 556 (1 query) | 3 763 / 4 820 | 27.4 / 128 | **12.8 / 77.7** | 119 MB |

JSON shards, for completeness: 209 ms / 1 053 ms / 5 889 ms / 38 238 ms — worse than the plain scan, because every
query re-parses the shard files.

Build cost, same runs: postings 0.33 s → 52 s, FTS5 0.08 s → 35 s, cached fields 0.19 s → 23 s (2 000 → 200 000).

### What the numbers say

- **Today's engine is already the bottleneck at today's size.** 183 ms of scan plus 45 ms of index parse for a 2 000-card
  library; at a realistic 20 000 cards that is ~1.6 s of scan and 0.4 s of parse **per search**, and the same index
  parse also happens for `facets`, `info`, `sheet` and `list`. Every one of those is in a game-build loop an agent runs
  tens of times per session.
- **Caching the tokens is not enough.** The `cached` column is 10× better and still 3.8 s at 200 000, and it needs
  ~1 GB of token lists in memory. A full scan cannot reach "instant".
- **FTS5 is the one that stays flat** — 0.68 ms → 12.8 ms over a 100× size change, because `MATCH … ORDER BY rank
  LIMIT` reads only the posting lists it needs, and the columns it joins against are indexed. It also keeps the
  words and the filters in one place, so a facet count is a second cheap query instead of a second scan.
- **Inverted postings in JSON are good enough if FTS5 is unwanted** (0.67 ms → 27 ms). Keep that as the fallback:
  it needs no dependency at all and can live inside `cards.index.json`. The reason to prefer FTS5 anyway: prefix and
  phrase queries, `bm25()` ranking, and no need to load postings into memory on every CLI call.
- **Caveats.** These are synthetic cards: 758 B/card is a floor, since a real card also carries `provenance` (real
  cards are 2-4 KB, so a real 50 000-card index is 100-200 MB rather than 38 MB; the FTS5 rows stay small because they
  hold only the searchable text). The host is a 12-vCPU i7-10710U sandbox; a faster NUC shifts every column, not the
  shape. Node is 22.16 here (the repo wants ≥ 24) and `node:sqlite` still prints an ExperimentalWarning there;
  Node 24 keeps the API and FTS5 (verify with `node -e "const {DatabaseSync}=require('node:sqlite');…"` on the host).

### Recommended index

`assets-local/index/assets.db` (SQLite, built by `gm packs index`, rebuilt incrementally on card mtime — `isStale()`
already exists):

```sql
CREATE TABLE cards (id TEXT PRIMARY KEY, kind, subkind, collection, style_family, status, uses, set_id,
                    card_type, tier, duration_s, bytes, triangles, loopable, family_json);
CREATE INDEX cards_kind ON cards(kind, subkind, style_family, status);
CREATE VIRTUAL TABLE cards_fts USING fts5(id UNINDEXED, title, description, objects, keywords, moods, roles,
                                          environments, path, clips);
CREATE TABLE facets (facet TEXT, value TEXT, n INTEGER);
```

- `uses` is a canonical ordered string (`in-game,placeholder`) so `LIKE '%in-game%'` is exact and cheap; set and
  family come from `families.ts` at build time (today `passes()` recomputes `setFor()` per card per query).
- `facets` is recomputed at build time: `gm assets facets` becomes one indexed `SELECT`, not a scan + re-tokenize.
- The card files stay the source of truth. `cards.index.json` stays as the dump `gm assets --json` and the review
  scripts read; the `.db` is derived and always rebuildable, so a corrupt index is a rebuild, not a data loss.
- Ranking: `bm25(cards_fts)` × status weight (reviewed > tagged > measured > draft) + family/set boost. The
  character-tier rule in `search.ts` stays, expressed as one `CASE` on `kind`/`subkind`/`collection`.

## 4. Token and attention budget for agents

Measured with the real `formatRow()` shape (`id kind/subkind status family title`):

```
t1:sonniss-gdc2026-part9-1of5/weapons/sword-slice-03@v1  audio/sfx/weapon  tagged  any  Sword slice 03
```

That is ~100 characters, ~25 tokens. What each surface costs an agent:

| Surface | Tokens | Rule |
| --- | --- | --- |
| One result row | ~25 | default page 20 rows = ~500 tokens |
| Facet summary for the same query | ~120 | counts only, printed with the page |
| `gm assets info <id>` | ~150-400 | full card, or `--fields id,audio,duration_s,rights` for less |
| 2 s audio thumbnail (path, agent plays it) | ~0 | one file per call, only with `--audio-thumb` |
| 128-px tile path (one image, contact sheet of 6) | ~2 000 if the agent looks at it | only with `--tile`, never for 3D, never a directory |
| Opening a raw asset | 0 tokens, minutes of time | **never** — the CLI refuses paths outside a preview |

Rules that go with it:

1. **Search returns a page, not a list.** `--limit` defaults to 20 and caps at 100. "More" is `--page 2`, and the CLI
   prints `20 of 3 481 (kind: ambience 812, sfx/footstep 305 …)` so the agent knows to narrow rather than page.
2. **"More like this" is an id, not a sentence**: `gm assets similar t1:…/footstep-grass-02@v1 --limit 10` — tag
   overlap plus the stored embedding over the top 200 text candidates (~2 ms).
3. **Preview is a deliberate step, and bounded.** `gm assets preview <id> --audio-thumb` writes a 2-second OGG and
   prints one path with its size; `--tile` writes one 128-px PNG or a 6-tile contact sheet. Nothing loops over ids:
   one id per call. This is the only path an agent may hand to a listening or vision step, and the human-written
   `gm-audio` rule (never listen to prove output) still applies to the final mix.
4. **Never re-listen to choose.** The point of §5's tagging is that "footstep on gravel" is answered by tags. An agent
   that finds itself previewing more than 2-3 candidates per decision should re-query with facets instead.

## 5. Tagging recipe per kind, and what it costs

Three layers, cheapest first. A card earns its status from them: `draft` (names) → `measured` (code) → `tagged`
(+ model) → `reviewed` (human), exactly as C3 §1 defines.

**Layer 1 — names and vendor metadata (free, no file read):**

| Kind | Free fields |
| --- | --- |
| SFX | `kind`/`subkind` from extension + folder (`sfx/footstep`, `sfx/weapon`, `ambience`); `ucs_cat_id` + category name from the UCS-style filename; `objects`, `materials`, `condition` from filename words; `variation_group` = filename minus its numeric suffix; one-line `description` from the vendor/library and file words |
| Music | title/album/composer/tempo from tags; `genre` from the pack or playlist name (Pixabay's 20 playlists are a vocabulary); `role` (loop / track / stinger) from duration and folder |
| 3D model | subkind from folder; `kit.piece` and `connects_to` from name (`wall-corner`); `geometry` bounds/triangles from glTF; rig id and canonical clips from `preprocess_kaykit.py` |
| Sprite | size, grid, frames, directions and animation names from the sheet name and folder (SmallScaleInt's 8 directions are in the file names) |
| Texture | `maps` role (albedo/normal/…), tileable from the seam test, real size |
| UI | subkind (icon/panel/button/font), `nine_slice` for panels, glyph ranges for fonts |
| Map | `view`, `scale`, `is_map`, grid, from folder + ink coverage (C3 §7) |
| Collection | counts, `family_coverage`, `requires`, vendor |

**Layer 2 — code measurements (ffmpeg / probe / image header; no model):** duration, channels, rate, loudness, peak,
spectral centroid, loop seam and loop points; sprite pixel size, alpha, palette, frame count; triangles, bounds,
footprint, material slots; tilesheet grid; font cmap ranges.

**Layer 3 — local models, only where names cannot answer:**

| Field | Model | Why it pays |
| --- | --- | --- |
| SFX sound event, mood | CLAP (`laion/clap-htsat-unfused`, local) | "what does it sound like" for 10 000 files with vendor-ish names |
| Music mood/genre/instruments/`game_fit` | CLAP (already chosen 2026-10-27) | #357's mood axes need it |
| Visual `objects`/`description` for pieces with no usable name | notes in `describe` from contact sheets (vision, `vision-input` gated) | only for the residue: most visual packs name their items |

**Measured cost of the code layer** (ffmpeg 7.1.5, 48 kHz stereo 24-bit WAV, this host, one core):

| Work | Time | Notes |
| --- | --- | --- |
| `ffprobe` metadata | 250 ms per process | ~fixed cost; batch many files per process |
| decode to raw (librosa/soundfile path) | 269 ms for 60 s of audio | ~46× realtime |
| EBU R128 loudness (`ebur128`) | 63 ms per MB (5.4 s for 300 s of audio) | 55× realtime |
| `ebur128` + `astats` | 2.06 s per 60 s file | 2× loudness; use only when brightness/LRA is needed |
| 2 s preview to MP3/OGG | 300-330 ms per file | dominated by process start |
| waveform PNG 800×180 | 381 ms per file | |
| 2048×2048 PNG decode + 128/360 px thumbnail (ffmpeg as a proxy; the 2D pipeline uses PIL/libvips, which is faster) | 450-470 ms per image | upper bound |

Extrapolated to the audio library (~200 GB, ~10 000 files): loudness + peak ≈ **3.5 h** single-threaded
(200 GB at 63 ms/MB), ~30 min across 8 workers; ~+1 h for previews and waveforms (0.3-0.4 s per file). That is a
one-time cost, paid at preprocess time, never at game-build time.

**Unmeasured here:** CLAP inference. `torch` and the model are not installed in this sandbox and the model weights are
not downloadable here. It is also the only unbounded cost, so the pre-processing ticket must calibrate it before the
library-wide run (C3 §13's cost guard): time 20 files, multiply, and state the estimate in the PR.

```sh
# calibration on the host, before any library-wide tagging run
time .venv/bin/python -I scripts/audio/measure.py <one 60 s track> /tmp/one
```

**Disk:** previews are the small part — a 2 s 96k OGG is ~24 KB, a 128-px WebP ~4 KB, a waveform 800×180 PNG ~10 KB, so
~40 KB per audio card and ~10 KB per visual card: **~600 MB for the whole library**, plus the index (119 MB FTS5 at
200 000 cards). Raw assets are never copied or derived for search.

**Licences:** no cloud processing of paid assets (Synty, Sonniss), ever. Sonniss's EULA forbids AI **training**; local
feature extraction and local CLAP inference to describe a file for search is analysis of an asset we own, not training
on it, and nothing leaves the host — that is the reading already recorded for #303, and it is why layer 3 runs only
against a local model directory. Embeddings derived from a file inherit its rights and stay host-local (C3 §7).

## 6. Output: cards, CLI, skills, tickets

### Card changes (C3 schema, minor bump, all additive)

| Field | Card type | Why |
| --- | --- | --- |
| `audio.ucs_cat_id` + `audio.ucs_category` | audio | exists as `ucs_cat_id`; the category *name* makes rows readable without a lookup table |
| `audio.variation_group` | audio | "give me 4 sword impacts" (#488) is a group query; code sets it from the filename minus the numeric suffix |
| `audio.search_notes` | audio | one line ("gravel footsteps, close, dry") written by layer 1/3, printed in the result row |
| `sprite.directions` | sprite | explicit count and order (`8`, `s,n,e,w,…`), so "can attack in 8 directions" is a filter |
| `describe.search_terms` | all | the layer-1/3 words that are not enum values (synonyms, vendor names), so FTS matches without inventing vocabulary |
| `collection_info.search_summary` | collection | one line per library for the "which pack has feet on gravel" answer and the #357 tile copy |

Nothing is removed. `proposed_tags` keeps working for vocabulary gaps; `search_terms` is deliberately not an enum.

### CLI contract

| Command | Change |
| --- | --- |
| `gm assets search <words> [filters]` | reads `assets.db`; same flags as today; result row gains duration/size; prints a facet summary line; `--page`, `--limit` (default 20, max 100) |
| `gm assets facets` | one indexed query; `--proposed` unchanged |
| `gm assets similar <id> [--limit]` | new: tag overlap + embedding over the text candidates |
| `gm assets preview <id> --audio-thumb\|--tile` | new: one 2 s OGG / one 128-px PNG (or 6-tile sheet), path printed, sizes logged |
| `gm packs index` | also writes `assets.db`; `--reindex` rebuilds from scratch; still runs `--import-previews`/`--families` as today |
| `gm assets sheet` | unchanged; the escape hatch for a human, not the agent's path |

Skill updates: `gm-core` documents the loop `search → facets → search → info → use`; `gm-audio` replaces "find pack
samples with `gm assets search --kind audio`" with a recipe (`--kind audio/sfx/footstep --use in-game`, facet on
`materials`, then `similar` for variations); `gm-set-*` keep `--set`, which now hits an indexed column.

### Ticket edits (bodies updated to follow this doc)

- **#509 (audio first)**: per-file UCS + name tags before any model pass; `variation_group`; a CLAP calibration step
  with its measured estimate in the PR; `gm assets search` must answer during the run, so `gm packs index` writes
  `assets.db` in the same PR; report coverage per pack and per field, not per file.
- **#353 (2D)**: contact sheets are for humans and `--tile`, not for agents' searches; band the work by set, and after
  each set rebuild the index and spot-check 10 real queries from §2; add `sprite.directions` while splitting sheets.
- **#354 (3D)**: FBX → glTF conversion produces the `geometry`/`rig` fields the index filters on, so land the cards and
  the index together; no vision pass for named pieces; the 4 re-preprocess families in family order.
- **#355 (audio)**: same recipe as #509, extended to Sidetrax/Kenney/Abstraction/Pixabay; add `audio.search_notes`,
  `describe.genre/instruments/game_fit` for music only (SFX get `subkind`/`objects`/`materials` and CLAP's 170 sound
  events), and the mood/genre vocabulary #357 consumes.
- **#356 (maps)**: layout specs are a different index (graph fields, not FTS): `room`, `connection`, `loop`, `secret`,
  `biome`, `scale` as columns, so `gm maps search` answers without tokenizing 4 000 cards; no preview path for maps.
- **#357 (audio styles)**: the montage builder reads `assets.db` by mood/genre and `variation_group`, and the option
  tiles are taste-led, so it needs the music fields from #355 and none of the index work.

### What was measured, and what was not

Measured here: five index designs at four scales on synthetic C3-shaped cards (harness committed), FTS5 availability
and version in `node:sqlite`, ffmpeg analysis throughput, native vs JS cosine cost, this host's CPU and RAM.

Not measured here, with the command that does it on the host: the real library's counts and bytes (§1), the real
build index's latency (`--index assets-local/index/cards.index.json`), CLAP inference cost (§5 calibration), and
libvips/PIL thumbnail throughput for the 2D path (PIL is not installed in this sandbox).
