# QA and publication

For a continuous project the renderer writes:

- `showcase.region.mp4`, `showcase.region.gif`, and `showcase.region.poster.png`;
- `showcase.sheet.mp4`, `showcase.sheet.gif`, and `showcase.sheet.poster.png`;
- one region and sheet poster per stop, text-free `timeline-*.png` frames at 1 fps, and one `manifest.json`.

MP4 files are H.264, yuv420p, silent, and faststart. GIF files loop forever. The manifest declares
`client_rendering: false` and the required playback attributes: `autoplay`, `loop`, `muted`, and `playsInline`.
The renderer stages and probes every generated track before replacing any published file, then publishes the new
manifest last. A failed render leaves the previously published media and manifest unchanged.

The manifest records the loop duration, shared tracks, each stop's `start_time`, and the declared/measured speed table.
Legacy v1 projects retain their per-stop files for compatibility; do not use that shape for new work.

## QA

Apply `gm-verify` to the two shared tracks, every stop poster, and the complete 1 fps timeline. Extract contact/reaction
frames where a story needs finer timing. Confirm:

- every edge has coherent ground at every sampled time;
- the route report has zero corridor intersections, zero runner-occlusion frames, and zero runner-off-path frames;
- one camera follows one walking hero with no cut, reset, or pop at the loop boundary;
- every measured interval is within 2% of the declared projected-pixel speed;
- story action, target, and reaction read at phone size;
- feet are not clipped and painter order is stable;
- every active sheet contains 24 distinct assets and changes direction on the shared beat;
- paired region and sheet casts do not duplicate a design;
- every building close-up has joined walls, one covering roof, and doors mounted in walls;
- rain and snow move down-screen between wraps with visible horizontal wind drift;
- no label, caption, scene number, or title appears in any media pixel.

Keep a comparison strip that includes every stop and seam. When repairing an accepted showcase, put matching prior and
current stills beside it so scene density, terrain, structures, and content ownership can be judged directly.

Do not claim iPhone playback or a physical-device check unless it was run. Record it as a post-deploy check when the
workspace cannot perform it.

## Style-picker integration

Copy only the baked media and manifest into the authorized set-detail media directory. The detail view should load one
normal region `<video>` and one sheet `<video>` with `autoplay loop muted playsinline`, posters, MP4 sources, and GIF
fallbacks where needed. A stop control seeks both existing videos to the manifest `start_time`; it does not replace
their `src`. If a control is used before metadata loads, retain the selection and apply it after both videos become
seekable without changing their play/pause state. The page must not import `scripts/assets/showcase`, instantiate a game
engine, create a canvas, or load raw pack assets. Rebuilding the showcase is an asset-pipeline job, not page runtime work.
