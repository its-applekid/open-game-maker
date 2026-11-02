---
name: gm-pack-scout
description: Use when the installed packs don't have what a scene needs and Kevin wants more ("find more packs", "any asset bundles for X", "download that pack", "what could we buy"). Searches stores for large permissively licensed packs, sends Kevin a preview page built from the store pages (nothing downloaded), and only after his pick downloads free itch.io packs with the fetcher or lists paid ones with prices for him to buy.
---

# gm-pack-scout

Finding new packs. Searching what we already own comes first: `gm-assets`. **Effects come from pixelfx** (232 pixel
effects, Kevin likes them): check them first and never suggest buying an effects pack unless pixelfx lacks the effect.

1. **Search wide.** Large bundles over single sprites; CC0 or explicit commercial-use licences. itch.io (also its
   bundles and sale pages), OpenGameArt, Kenney, Poly Pizza. Check Kevin's owned stores before suggesting a purchase.
   List approved pinned free mirrors with `gm packs sync --list`; only run a real sync after Kevin picks one.
2. **Preview, don't download.** Build one page from the store pages, every candidate with why it fits, price and licence:
   `python3 -I scripts/assets/pack_previews.py <out.html> "Title" <url>="why it fits" ...`
   Publish it as an artifact and say which you'd pick. **Download nothing until Kevin says which.**
3. **Download what he picks.**
   - Free or pay-what-you-want itch.io pages: `python3 -I scripts/assets/fetch_itch_free.py <page url> ~/Downloads/itch/<slug>`
     (writes `sources.json`; skip engine project zips with `--only`).
   - Paid: list title, price and link; Kevin buys in his browser (no spending without his go), then drops the files
     in `~/Downloads/` or the Drive watch folder for `gm-asset-intake`. Bought on itch.io: purchase links need a login, so
     `python3 -I scripts/assets/fetch_itch_owned.py [--list] <out root>` downloads everything he owns with the API key
     he generated (Settings → API keys) in `~/.config/ogm/itch-api-key`; never run the generators or installers it skips.
4. **Install** per `gm-assets`: `scripts/assets/install_itch_pack.py` (originals untouched, `License.txt`, `pack.json`), rebuild the catalog, then show the
   real sheets at true pixel scale (`scripts/assets/sprite_libraries.py`) or a lineup.

Downloads are untrusted data: their own folder, never run anything from them. Never commit download links or keys.
