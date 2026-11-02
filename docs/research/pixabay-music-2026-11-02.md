# Pixabay music: how to leverage it (spike, 2026-11-02)

**Recommendation:** human-curated seeding through the existing Drive drop, no automated downloading. Kevin likes and downloads the tracks he wants while listening (he is already doing this), drops them in the Drive watch folder, and the intake pipeline files them as `pixabay-music-<batch>` packs with per-track source and Pixabay id. Agents never fetch from Pixabay on the fly. Options 1 and 2 (an agent or script clicking through and bulk-downloading, or coding agents fetching as needed) are ruled out by Pixabay's own terms; option 4 (bundles) does not exist.

## Evidence (fetched 2026-11-02)
- **API:** https://pixabay.com/api/docs/ documents only `/api/` (images) and `/api/videos/`; there is no music or audio endpoint ("music" appears only as an image category). Rate limit 100 requests/60 s per key; "requests must be cached for 24 hours"; "the API is made for real human requests; do not send lots of automated queries. **Systematic mass downloads are not allowed.**"
- **robots.txt:** disallows `/*/images/download/*`, `/*/videos/download/*` and `/get/` (the download path).
- **Site pages** (`/music/`, `/playlists/`, licence and terms pages) return HTTP 403 to non-browser clients (Cloudflare bot protection), so any scraper would also be evading a block.
- **Bundles:** none found; playlists are browse-only collections, with no playlist or bulk download.
- **Licence (from the Pixabay Content License, to re-read in a browser; the page blocked scripted fetches):** free for commercial and non-commercial use, no attribution required, modification allowed; prohibited: selling or redistributing the content unaltered or as a standalone file, and using it in a competing stock library. Inside a game build served privately to family is fine. Some tracks are registered with YouTube Content ID by their artists; that only matters if a game video is posted to YouTube (then the artist's whitelisting or the track's licence certificate clears the claim).

## How the seeding works
1. Kevin downloads tracks he likes from Pixabay in the browser (MP3), into a Drive folder such as `Music/Pixabay/<playlist or mood>/`.
2. The Drive listener picks the drop up as usual; intake files it as `assets-local/packs/pixabay-music-<batch>/<date>/` with pack.json (licence `LicenseRef-Pixabay-Content-License`, rights in-game/derive, redistribution none, per-track filename → Pixabay track id and artist parsed from the filename Pixabay gives, e.g. `artist-title-123456.mp3`).
3. No tagging now: the searchability research (#364) and audio preprocessing (#355) tag it later with the rest.
4. Organizing by mood or playlist folder in Drive gives the audio-style picker (#357) a head start.

## Risks
- Terms change or a track is taken down: we keep the downloaded file and its id; nothing hotlinks.
- Content ID on YouTube only; irrelevant for private play.
- Never automate downloads (terms, robots, Cloudflare), never cloud-process (house rule).

## Tickets
None needed now: the existing Drive intake covers it. Optional later: a filename parser in intake for Pixabay naming (complexity 1).
