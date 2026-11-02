# QA and publication

The renderer writes, for each stop id:

- `<id>.region.mp4`, `<id>.region.gif`, `<id>.region.poster.png`;
- `<id>.sheet.mp4`, `<id>.sheet.gif`, `<id>.sheet.poster.png`;
- one `manifest.json` for the set.

MP4 files are H.264, yuv420p, silent, and faststart. GIF files loop forever. The manifest declares
`client_rendering: false` and the required playback attributes: `autoplay`, `loop`, `muted`, and `playsInline`.
The renderer stages and probes every generated track before replacing any published file, then publishes the new
manifest last. A failed render leaves the previously published media and manifest unchanged.

## QA

Apply `gm-verify` to every region and sheet. Inspect at least the poster plus start, middle, and end frames extracted from
the MP4. Also inspect a timeline when camera movement or action timing is hard to judge from three stills. Confirm:

- every edge has coherent ground at every sampled time;
- the camera follows a walking hero without a pop at the loop boundary;
- story action, target, and reaction read at phone size;
- feet are not clipped and painter order is stable;
- every sheet asset changes direction on the shared beat;
- paired region and sheet casts do not duplicate a design.

Do not claim iPhone playback or a physical-device check unless it was run. Record it as a post-deploy check when the
workspace cannot perform it.

## Style-picker integration

Copy only the baked media and manifest into the authorized set-detail media directory. The detail view should render a
normal `<video>` with `autoplay loop muted playsinline`, poster, and MP4 source, plus a GIF fallback where needed. It must
not import `scripts/assets/showcase`, instantiate a game engine, create a canvas, or load raw pack assets. Rebuilding the
showcase is an asset-pipeline job, not page runtime work.
