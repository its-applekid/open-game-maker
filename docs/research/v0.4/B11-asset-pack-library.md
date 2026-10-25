# B11: Asset pack library

- **Source requirement:** Kevin, 2026-10-25. Agents should get standardized access to resource packs (art, models, textures, VFX, SFX, music) instead of making every asset themselves. The engine repo is open source and Kevin's game repos are closed. The full library is never hosted on GitHub; a game repo holds only the assets that game uses. The library lives in object storage, and that hosting choice becomes the default the engine repo is designed around.
- **Builds on:** B5 (art and audio toolchain; its "library rung"), B6 (S3-compatible bucket, hash keys, signed URLs, license records), and the v0.5 decision "Bucket: Railway".
- **Evidence labels:** **[V]** verified against a primary source; **[I]** inferred; **[U]** unverified or assumed.
- **Scope:** research and design only. Nothing was downloaded, bought or deployed. Not legal advice.

## 1. TL;DR

- **One pack library per Game Maker instance**, stored in the instance's S3-compatible bucket under its own prefix. Railway Storage Buckets are the default (B6 D1). The engine code speaks only the S3 API, so R2, AWS S3 or MinIO also work.
- **Packs are ingested once, then normalized:** 3D to GLB, 2D to PNG/WebP with atlas JSON, and audio to OGG/Opus at normalized loudness. Each asset gets a thumbnail or preview, tags and a license class, and is stored under its content hash.
- **Agents never touch the bucket.** They use a small catalog API on the backend: `search`, `preview` and `use`. `use` copies the chosen file into the game repo and records it in `assets.lock.json`. Sandboxes get a per-job token, never bucket credentials (B4, B6).
- **A game repo holds only the assets it uses**, plus a lockfile recording each one's source, hash and license. CREDITS are generated from the lockfile.
- **Licenses are data and are enforced at `use` time:**
  - CC0 assets can go anywhere.
  - Attribution assets add a credit line.
  - Personal-license paid assets (Synty, Humble bundles) are refused for a public repo, a fork into another account, or a non-owner account.
- **The open-source engine ships no packs.** It ships the importer, the catalog, the license policy and a script that fetches a CC0 starter set (Kenney) from its official source.
- **Three tiers, strongly preferred in order** (Kevin, 2026-10-25). It is a strong recommendation to agents, not a hard rule:
  1. **Installed packs.** The scope chat offers styles, characters and sounds from these first. Each game locks one or two packs as its art direction.
  2. **Online free sources.** Used only when the creator clearly asks for something tier 1 lacks. Sources are reachable by API, git or npm with no click-through downloads; see §4.6.
  3. **Agent-made assets.** Code tools (Three.js props, ZzFX, Tone.js) when tiers 1 and 2 have nothing.
- Agents adapt before creating: recolor, kit-bash, animate. Every asset, from any tier, goes through the same `use` call and license check.

## 2. What changes from earlier research

| Earlier | Now |
|---|---|
| B5: V1 starts with "skills and code tools only"; CC0 kit-bashing is one technique among several | **Packs first, online free sources second, agent-made third.** B5's code tools become tier 3 and the customization layer |
| B6: binaries in the bucket, only a manifest in Git | **Library** in the bucket. **A game's own assets** are committed to its private repo (Kevin's choice). B6's limits still hold: GitHub blocks files over 100 MiB and recommends repos under 1 GB [V, B6]. A typical game's live set is about 2–100 MB [U, B6 §2], so this fits. Large narration stays in the bucket as B6 describes |
| Open question 1 (do CC0 kits count as "tools"?) | Answered: yes, and packs are now the default source |

## 3. Starting packs

| Pack | License class | Notes |
|---|---|---|
| Kenney (all-in-one) | `cc0` | Public domain, no attribution needed [V, kenney.nl/support]. Safe for public repos and the engine's starter script |
| Synty (Humble "Best of Synty 6") | `personal` | A per-buyer license; don't redistribute raw files [U: read Synty's EULA before ingesting]. Downloads usually include FBX/OBJ source files next to engine packages [U]. Synty uses one shared palette texture per pack, so GLB conversion is easy [I] |
| Later candidates | | Quaternius and KayKit (`cc0`), Poly Haven and ambientCG textures and HDRIs (`cc0`), Brackeys, Kronbits and PVFX particles (`cc0`; check each license file), Sonniss GDC audio (`royalty-free`, no AI/ML training, redistribution unclear [U]) |

The download links Kevin used contain personal keys. Keep them out of the repo, the bucket metadata and any channel.

## 4. Design

### 4.1 Storage layout (same bucket as B6, separate prefix)

```
packs/originals/<pack-id>/<version>/<file>.zip   # untouched download, for re-ingest
packs/blobs/sha256/<hex>                         # normalized assets, write-once
packs/previews/sha256/<hex>.webp                 # thumbnails / audio preview clips
```

Postgres holds the catalog: tables `pack`, `asset` and `asset_tag`, with full-text search. The `pack` row stores the source URL (without download keys), version, license class, license text and attribution string.

Railway buckets have no versioning or backups [V, B6]. The originals prefix plus a deterministic importer makes the library rebuildable. Keep a second copy of `packs/originals/` off Railway: B6's nightly rclone job, or simply Kevin's local download folder.

### 4.2 Importer (one CLI in the engine repo, run by the admin)

`gm packs import <zip> --pack synty-best-of-6 --license personal`

1. Unzip into a fresh temporary directory. Treat archives as untrusted: no symlinks, no path traversal, size caps.
2. Convert and optimize the assets:
   - FBX, OBJ or DAE to GLB with headless Blender (`blender -b --python`), then `gltf-transform` for meshopt compression and KTX2 or WebP textures;
   - sprites to PNG or WebP, with sheets sliced or recorded as atlas JSON;
   - audio to OGG/Opus, loudness-normalized with ffmpeg `ebur128` (B5).
3. Extract metadata: kind, dimensions, triangle count, rig and animation names, loop points, duration.
4. Tag each asset from the pack's folder and file names. An optional one-time vision-model tagging pass per pack improves search but costs money, so it needs Kevin's approval.
5. Render previews: a Blender turntable still for 3D, a contact sheet for sprites, and a waveform plus a 3-second clip for audio.
6. Upload blobs and previews, then write the catalog rows. Re-running the import is idempotent, because keys are content hashes.

This runs as a Railway job or on Kevin's machine. It is CPU-only and never runs inside an agent sandbox.

### 4.3 Agent access (catalog API)

| Call | Returns |
|---|---|
| `assets.search({query, kind, tier?, packs?, max_tris?})` | Ranked ids, names, tags, preview URLs, license class and tier. Tier 1 by default. `tier: 2` queries the online sources through the backend, which caches each hit in the bucket with its license before it can be used |
| `assets.preview(id)` | Signed preview URL (agents with vision can look at it) |
| `assets.use(id, {dest})` | Writes the file into the job's repo checkout, adds a lockfile entry, or refuses with a reason |

- **How agents reach it:** an HTTPS endpoint on the backend, allowlisted in the E2B sandbox network policy (B4), with a token scoped to that job, its game and its repo visibility. It is wrapped as a skill or CLI (`gm-assets search ...`) so any agent harness can call it.
- **Pre-staging:** when the scope chat settles, the backend pre-stages the style-locked packs' previews and index into the job, so most searches never leave the sandbox.
- **Policy check inside `use`, not in the agent:** it reads the license class, repo visibility and account. That decides allow, allow with a credit line, or refuse. Agents cannot override it.

### 4.4 Game repo

```
assets/<kind>/<name>.<ext>     # only what the game uses
assets.lock.json               # [{id, pack, version, sha256, license, attribution, path}]
CREDITS.md                     # generated from the lockfile
```

- **Forks:** a fork into another account re-runs the policy check for every lockfile entry. `personal` assets are stripped and listed for replacement.
- **Visibility changes:** making a private repo public is blocked while `personal` entries remain. Game Maker shows the list and offers CC0 substitutes.

### 4.5 Open-source engine repo

The engine repo contains:
- the importer;
- the catalog service;
- the policy;
- the SDK loaders for GLB, atlas and audio;
- `gm packs fetch-starter`, which downloads Kenney packs from kenney.nl into the operator's own bucket. Pack files are never committed.

The documented default deployment is Railway backend + Railway bucket + Postgres, and any S3-compatible endpoint can replace the bucket.

### 4.6 Tier 2: online free sources (no click-through downloads)

The backend queries these, never the sandbox. It caches each fetched file under `packs/online/<source>/<id>` along with its license record and source URL. Only search terms derived by the agent are sent out; a creator's raw prompt is not.

| Need | Source | Access | License | Notes |
|---|---|---|---|---|
| Low-poly 3D characters and props | [KayKit GitHub org](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | `git clone`, pinned commit | CC0 [V: per LICENSE.txt via Godot asset library listing] | FBX and glTF; matches the mockup look. Better installed as tier 1 |
| PBR materials, HDRIs | [ambientCG API](https://docs.ambientcg.com/api/v2/) | JSON API with direct download links; v3 recommended for new code | CC0 [U: confirm on its license page] | Largest CC0 material library |
| Photoreal models, textures, HDRIs | [Poly Haven API](https://github.com/Poly-Haven/Public-API) | JSON API, User-Agent required | Assets CC0 [V]; live-API commercial terms conflict [V, see §6] | Prefer a one-time tier 1 install |
| 2D RPG characters | [Universal LPC generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) | `git clone`; layered spritesheets | Per image: CC0, CC-BY, CC-BY-SA, OGA-BY or GPL, listed in `CREDITS.csv` [V] | Filter by license; credits generated from CSV |
| Game icons (items, skills, UI) | [game-icons.net](https://game-icons.net/about.html) | SVG set, also packaged for icon libraries | CC BY 3.0, some authors CC0 [V] | 4,000+ icons; one credit line per author |
| Emoji-style 3D and flat art | Microsoft Fluent Emoji | `git clone` (3D PNG, SVG) | MIT [U: secondary sources] | Trademarked emoji (logos, flags) withheld |
| UI icons | Lucide, Tabler Icons | npm | ISC / MIT [U] | Editor and HUD |
| Fonts | Fontsource (Google Fonts) | npm `@fontsource/*` | OFL mostly [U: per font] | Self-hosted, no Google calls |
| SFX | [Freesound API](https://opensource.creativecommons.org/blog/entries/freesound-intro/) | REST, API key, filter `license:"Creative Commons 0"` | Per sound; filter CC0 or CC-BY [V] | Needs an adult-owned API key in backend env |
| Images and audio (aggregator) | Openverse API | REST, anonymous or registered, license filter | Per item [V] | Rate-limited; scraping is forbidden by ToS [V] |

Not used as tier 2: Kenney, Quaternius and itch.io packs. They are download-button sites with no official repo or API, so install them as tier 1 instead. OpenGameArt and Sketchfab are also excluded, because licenses are mixed and there's no clean license API.

## 5. Options considered

| Option | Verdict |
|---|---|
| Agents generate everything (the B5 default) | Rejected as the default: inconsistent style, slow, and the hardest to review. Kept as tier 3 |
| Live web search of any site | Rejected: unclear licenses and click-through downloads. Tier 2 is a fixed allowlist of sources with machine-readable licenses |
| Full library in Git or Git LFS | Rejected: GitHub limits, bandwidth billed on every clone (B6), and paid packs exposed |
| Library mounted read-only into sandboxes | Workable on a self-hosted VM. E2B sandboxes would download gigabytes per job [I]. Pre-staging only the style-locked packs gets most of the benefit |
| Game repo stores only the lockfile, with assets fetched at build time | Smallest repos, but builds then need bucket access, and a closed repo is no longer self-contained. Possible later for heavy audio; not the default |

## 6. Open questions for Kevin

1. **Family members and `personal` packs.** Can child or other family accounts use Synty assets in their games on your instance? It depends on Synty's EULA (seats, household use). Until it's read, the default is owner-only.
2. **Tier 2 licenses.** Recommended: allow CC0, CC-BY, OGA-BY and MIT/OFL, with credits generated automatically. Allow CC-BY-SA with a "share-alike" flag. Block NC, ND and GPL-only art. Tier 2 assets a game uses are recorded on a "pack wishlist" for the admin, so popular gaps can become tier 1 packs.
3. **Poly Haven.** The assets are CC0, but the official API page says commercial use of the live API needs a license, which conflicts with its GitHub README. Recommended: download Poly Haven assets as a one-time tier 1 install, or ask Poly Haven first.
4. **Vision tagging at import.** Approve a small one-time model spend per pack for better search, or start with filename tags only?
5. **Off-Railway backup** of `packs/originals/`: B6's nightly copy to a second provider, or your local copies?
6. **aiur angle.** Hosted aiur jobs need a per-job tool endpoint and token, which is related to #5937 (per-job read scoping). No ticket until you say so.

## 7. Next research steps (no spend)

- Read Synty's EULA and the license file in every downloaded pack, and record each in the `pack` row.
- Run the B5 kit coverage audit against Kenney and Synty: map each mockup item to a pack asset.
- Test Synty FBX to GLB conversion in headless Blender on one pack, and measure output sizes for the B6 volume table.
