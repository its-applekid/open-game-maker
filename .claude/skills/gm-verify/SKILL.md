---
name: gm-verify
description: Use before showing the creator anything visual: a scene, a screen, a game change. Check by looking (stills at desktop and phone sizes, a timeline of the motion, close-ups of small events), then deliver clips the creator can play on a phone. Also for "record a video", "send screenshots", "does it look right".
---

# gm-verify

Never report a visual result you haven't looked at. Reading code or logs is not looking.

## Look

- Headless Chromium on the GPU: `--use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist` (SwiftShader is the slow
  default). Serve the prototype over HTTP; `file://` breaks module imports.
- Stills: 1440x900 and 390x844 (phone, `deviceScaleFactor: 2`, `isMobile`). Check the title, the main screen and the
  first click.
- Motion: pages expose a capture mode (`?capture`, `window.__frame(t)`) so any time can be drawn exactly.
  `prototypes/title-city/tools/capture.mjs stills|timeline|record "<query>" <out> ...` draws stills, one tiled
  timeline in time order, or a phone-ready MP4. A scene camera that follows scene state lags one frame in stills
  taken out of order; judge camera work from a timeline or the recording. (Tiling by hand? sort with `sort -V`; plain `sort` puts t10 before t4.)
- Small events (a building rebuilt, a monster's punch): add a debug camera that frames the event (`?focus=` /
  `?cam=scene`) instead of judging from the wide shot.
- Read each tiled image and say what is wrong before fixing; fix the worst thing first. Something blocking the shot
  may not be in the scene's object lists (props placed directly, like a market hall): find it before moving the camera.
- When the creator gave a reference image, put it beside your render in one image and compare before showing
  anything (shape, view angle, palette); record clips only once that pair matches.

## Deliver

- `capture.mjs record` encodes H.264 `yuv420p`, 960 px wide, CRF 27, `+faststart` (a 2-minute clip is about 5-10 MB).
  The Claude mobile app does not play WebM.
- Publish an artifact page: `tools/clips_page.py <dir> "title" "intro" clip.mp4="Heading|one line" ...` builds it with
  poster frames; files over the per-call limit get re-encoded smaller, not dropped.
- Sound: `prototypes/title-city/tools/mix_sound.mjs` lays a scene's cues under a recording; check the balance with an
  ffmpeg `showwavespic` image (a loud loop flattens every hit), and say it wasn't listened to.
- A live JS page with many modules (over 256 files per publish): bundle it into one inline script with esbuild
  (`npm i esbuild` in the scratchpad, `--bundle --format=esm --minify`).
- Before deploying anything a phone loads, time it: `prototypes/title-city/tools/loadtime.mjs <url>` (iPhone profile,
  CPU 4x slower, then a cached reload). Seconds of setup on a phone are usually work that never changes: bake it at build
  time (see `title-city/tools/bake.mjs`).
- Say what was checked and what wasn't (for example "not checked on iPhone Safari").
