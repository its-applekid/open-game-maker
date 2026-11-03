---
name: gm-pixabay-music
description: Use when Kevin asks for more music from Pixabay (playlists, curated playlists, "grab songs like these"), or when the library needs non-game soundtrack music by mood or genre. Downloads slowly through a signed-in browser on the host, files tracks with licence metadata, and never tags them (tagging waits for the searchability research and audio preprocessing tickets).
---

# Pixabay music

Pixabay has no music API, its terms disallow systematic mass downloads, and its pages block scripted HTTP. So music comes in only through a real, signed-in Chromium on the NUC, one track at a time at human pace (Kevin, 2026-11-02: "very slow downloads, random times, no daily cap, random but believable mouse moves"). Spike: `docs/research/pixabay-music-2026-11-02.md`.

## One-time setup
- Credentials: `~/.config/ogm/pixabay.env` (`PIXABAY_EMAIL`, `PIXABAY_PASSWORD`, mode 600; Kevin writes it with `read -rs`; never print it).
- Sign in once: `DISPLAY=:1 node scripts/assets/pixabay/login.mjs <profile-dir>` (types like a person, prints LOGGED IN). The profile keeps the session.
- Playwright: `scripts/assets/pixabay/node_modules/playwright` links to the workspace install (gitignored).
- The NUC monitor must be awake for a headed browser: `DISPLAY=:1 xset dpms force on; xset s off -dpms`.

## Download
`DISPLAY=:1 nice -n 10 node scripts/assets/pixabay/fetch-curated.mjs <profile-dir> assets-local/inbox/pixabay-curated [start-url] > assets-local/inbox/pixabay-curated.log 2>&1` (log outside the output folder)
- Default start is https://pixabay.com/curated_playlists/ (Kevin wants curated playlists only); pass one playlist URL to fetch just that playlist.
- Pacing via env: `PIX_MIN_MS`/`PIX_MAX_MS` between tracks (default 45-240 s), `PIX_BREAK_MIN_MS`/`PIX_BREAK_MAX_MS` every 15-25 tracks (default 5-15 min). Overnight run used 8-30 s and 45-120 s (~1,000 tracks in ~12 h).
- Per track: page visit, mouse moves and scrolls, click Download, save `<artist>-<title>-<id>.mp3` plus a `.json` (id, page, playlist, title, tags, licence). 45-240 s between tracks, longer pauses every 6-12. Resumable by id. Run it as a background job; never in parallel.
- Login check fails (no Download event): rerun login.mjs.

## Filing (no tagging)
After a run: move `assets-local/inbox/pixabay-curated/<playlist>/` into `assets-local/packs/pixabay-music-curated/<date>/extracted/<playlist>/` with a root `pack.json` (vendor pixabay, licence `LicenseRef-Pixabay-Content-License`, rights in-game/derive, redistribution none, attribution none required, source per track from the `.json`), rebuild the catalog. Cards, moods and search come later (#364, #355, #357). Credits: the `.json` carries what #367 needs.
