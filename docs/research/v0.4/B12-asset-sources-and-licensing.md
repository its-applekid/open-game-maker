# B12: Asset sources, bundles and licensing

- **Source requirement:** Kevin, 2026-10-24/25. Find popular, cheap or free asset packs (2D, 3D, textures, particles, audio, Blender add-ons) that allow commercial use, and work out how licenses fit Game Maker.
- **Related:** B11 (the asset pack library and its tiers), B5 (art and audio), B6 (storage).
- **Evidence labels:** **[V]** verified against a primary source; **[S]** secondary source (guide, news or listing), not checked against the primary; **[U]** unverified.
- **Scope:** research only. Nothing was bought or downloaded by the agent. Kevin downloads packs himself. Not legal advice.

> **Version scope (2026-10-25):** everything here is V1 (packs, free sources and license rules, for adult creators). Paid generators are V2. See `docs/spec/release-plan.md`.

## 1. Licensing model for Game Maker

There are two different uses, and each has its own rules.

| Use | What's allowed |
|---|---|
| **Kevin's own games** on his own instance | Any royalty-free license: Synty, Humble bundles, Fab Standard, Blender Market. Shipping assets inside a playable game is normal use |
| **Built-in library offered to other users**, or the open-source engine repo | **CC0 or explicitly redistributable licenses only.** Giving raw files to other users so they can put them in their own games is redistribution, and personal licenses forbid it [S] |

Two conditions apply even to Kevin's own games:
1. **Repo visibility.** A Game Maker game lives in a GitHub repo. Raw paid files in a public repo (or a fork into another account) publish the assets, which most licenses forbid. So paid assets require private game repos. The deployed playable game is fine. (B11 §4.4 enforces this in `gm assets use`.)
2. **Other accounts.** Another adult family member building with Kevin's paid pack is a second user. That's allowed only if the license covers seats or household use. Owner-only until the EULA is read.

Kevin's resulting setup (2026-10-25): the engine repo is open source and ships no packs. Kevin's game repos are closed. The full library lives in object storage, and only the assets each game uses are committed to its repo.

## 2. Packs Kevin is downloading

| Pack | License | Notes |
|---|---|---|
| Kenney all-in-one (itch.io) | CC0 [V, kenney.nl/support] | Tier 1 core. Safe everywhere |
| Synty, "Best of Synty Game Dev Assets 6" (Humble, launched 2026-09-23; 12 packs, over $1,000 of value for $30) [S, syntystore.com blog] | Synty EULA, personal [U: not yet read] | Tier 1, Kevin's instance only, private repos. FBX/OBJ alongside engine packages [S] |

The download links contain personal keys. Never commit them or post them anywhere.

## 3. Bundles worth watching (paid, cheap)

| Source | Pattern | Notes |
|---|---|---|
| Humble × Synty | Several a year (Sci-Fi until 2026-03-31, Dungeon until 2026-06-22, Best of 6 from 2026-09-23) [S] | About $30 for over $1,000 of value |
| Humble × Blender Market (now Superhive) | "Best of" and themed add-on bundles, e.g. Creature and Character Creation, 2026-06-10 to 07-01 [S] | Bundle versions have no updates or support [S]. Add-ons, not game assets |
| Humble, October 2026 | Game-key bundles only, no asset bundles [S] | — |
| Fab (Epic) free rotation | Free packs every two weeks, under the Fab Standard License, which allows commercial use [S] | Mostly Unreal. Claim them while free; they stay in your library [S] |

### Engine-specific bundles (Unreal/Fab, Unity) — 2026-10-25

- **License:** Fab's Standard License summary says assets may be used with any compatible tool, not only Unreal. Exceptions [S]:
  - Epic-owned content (Megascans, Paragon, MetaHumans) stays Unreal-only;
  - use in fully open-source projects is limited.

  Same rule as Synty: Kevin's instance only, in private game repos. The Fab EULA itself wasn't readable (403), so read it before buying.
- **Format is the real barrier.**
  - A Fab listing that offers FBX, OBJ or glTF downloads is fine.
  - An Unreal-only listing delivers `.uasset` content. Getting at it means installing the Unreal Editor (a large install), adding the content to a project and exporting to FBX or glTF. That's a manual step outside our headless Blender importer.
  - Unity Asset Store `.unitypackage` files are gzip tarballs holding the source FBX and PNG files, so a script can extract them without Unity.
- **What survives export:** meshes, textures, skeletons and animations.
- **What doesn't:** Unreal or Unity material graphs (they must be rebuilt as three.js PBR materials from the textures), Niagara or Shuriken VFX, Blueprints and scripts, levels, lighting and landscapes.
- **Browser fit:** realistic Unreal environment packs (e.g. Dekogon, Meshingun) are usually high-poly, use Nanite, carry 4K textures and look realistic. That's a poor match for web budgets and for low-poly packs like Kenney and Synty.
- **Rule of thumb:**
  - Buy when the bundle is stylized or low-poly and ships FBX, glTF or a Unity package.
  - 2D art and audio are engine-neutral anyway (PNG, WAV).
  - Skip realistic Unreal-only packs for V1.

## 4. Free sources found

**CC0 (no restrictions):**
- Kenney: tens of thousands of assets, 2D, 3D, UI and audio.
- KayKit: stylized characters and kits, also on GitHub.
- Quaternius: low-poly; per-pack license check advised.
- Poly Haven: photoreal models, textures and HDRIs; API terms in B11 §6.
- ambientCG: over 2,000 materials and over 400 HDRIs.

All [S]; Kenney and KayKit are [V] via B5.

**VFX particles:**
- Brackeys VFX Bundle (CC0) [S].
- Kronbits Particle Pack, 1,000 particles at 512 px (CC0) [S].
- PVFX Foundry and Foundry Thirteen (CC0, redistribution allowed) [S].
- CodeManu VFX Free Pack: the description and the metadata disagree, so check the license file [S].
- Ragnapixel Particle FX: CC-BY 4.0, so credit is needed [S].
- Ardes particles: CC0, with a request not to resell [S].

**Audio:**
- Sonniss GDC 2026 bundle: about 7.5 GB of professional SFX, royalty-free with no attribution required. AI/ML training is prohibited. Redistribution is unclear [S]. Fine for Kevin's own games; not for the shared library until the license is read.
- Kenney audio (CC0).

**Mixed licenses (check every asset):** OpenGameArt, Sketchfab (its store moved to Fab) and Poly Pizza (mostly CC-BY) [S].

**Blender add-ons:**
- The Blender Artists free tag lists current releases, e.g. MACHIN3tools [S].
- For a pipeline, Game Maker needs only headless Blender, with no paid add-ons (B11 §4.2).

## 5. Tier 2 sources an agent can reach without a download button

See B11 §4.6 for the full table and the adapter design. Summary:
- **Mirrors (git or npm):** KayKit, the Universal LPC generator, game-icons.net, Fluent Emoji, Lucide, Tabler and Fontsource.
- **Live APIs:** Freesound, Openverse and ambientCG; Poly Haven only if its API terms allow.

Excluded from tier 2, because they offer only download buttons and should be installed as tier 1 instead: Kenney, Quaternius and itch.io packs.

## Sources

- Kenney license: https://kenney.nl/support
- Synty Humble bundles: https://syntystore.com/blogs/blog/latest-humble-bundle-best-of-synty-game-dev-assets-6, https://syntystore.com/blogs/blog/sci-fi-game-dev-humble-bundle-2026, https://syntystore.com/blogs/blog/dungeon-game-dev-humble-bundle-2026
- Blender Market bundles: https://gamefromscratch.com/blender-market-best-of-2024-humble-bundle/, https://superhivemarket.com/bundles/creature-and-character-creation
- Fab free assets: https://80.lv/articles/grab-three-free-asset-packs-on-fab-every-two-weeks, https://gamedev.net/news/3970-june-2026-free-asset-round-up-2/
- Sonniss GDC 2026: https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/, https://zeli.app/en/story/49262841
- Free asset guides: https://app.cinevva.com/guides/free-3d-model-sites, https://app.cinevva.com/guides/free-textures-hdris-materials, https://app.cinevva.com/guides/free-sound-effects-music
- Particles: https://brackeysgames.itch.io/brackeys-vfx-bundle, https://kronbits.itch.io/particle-pack, https://nerijs.itch.io/pvfx-foundry, https://nerijs.itch.io/pvfx-foundry-thirteen, https://codemanu.itch.io/vfx-free-pack, https://ragnapixel.itch.io/particle-fx-status, https://ardes.gumroad.com/l/ParticlePack1
- Blender add-ons: https://blenderartists.org/tag/free/91, https://all3dp.com/2/must-have-blender-add-ons-plugins/
