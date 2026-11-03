---
name: gm-video
description: Render a short deterministic video locally from HTML, CSS, and rights-cleared media.
---

# Game Maker video

Use this for a short title card, trailer beat, explainer, or motion graphic. Use `gm-asset-showcase` for an asset-set
reel and `gm-verify` for game evidence; this skill does not replace either one.

## Keep the render local

Use the host's pinned `hyperframes@0.9.8` with FFmpeg. Set `HYPERFRAMES_NO_TELEMETRY=1` for every HyperFrames command.
Do not add the renderer to a game's runtime dependencies, use
a provider key, publish the project, or upload source media. Paid-pack art and all generated frames stay under
ignored `assets-local/` or task-local scratch space. If the pinned tool is not cached, stop and request a cache fill
instead of substituting `latest`.

Start from a script with exact duration, dimensions, frame rate, and on-screen copy. Create one HyperFrames
composition, keep every animation seekable, and use CSS or Web Animations by default. Do not add GSAP unless the ticket
explicitly confirms that the use fits its current Standard license. Use Three.js only for a real 3D shot, not
decorative complexity.

Preview representative start, middle, and end frames before rendering. Motion must preserve the fixed prototype's
copy and visual language when it depicts the product; do not add interface chrome or redesign a screen for video.

## Render and gate

Render with the exact installed version, for example
`HYPERFRAMES_NO_TELEMETRY=1 pnpm dlx hyperframes@0.9.8 render`. Keep the composition source
beside the local evidence, not in the game package, unless the ticket explicitly asks to ship editable video source.

Inspect the result with FFprobe. Require a non-zero expected duration, H.264 video, the intended dimensions, and
`yuv420p` pixels. Parse the top-level MP4 atoms and require `moov` before `mdat`; a filename or FFmpeg flag is not
proof. Re-encode locally with `-movflags +faststart` when the renderer does not meet the gate. Load `gm-verify` and
look at representative frames for clipping, blank frames, unreadable text, and unintended seams.

## Worked example

The local example is a three-second 640x360 “LOCAL / NO CLOUD” title card rendered with HyperFrames 0.9.8 to
`assets-local/sets/examples/gm-video/video.mp4`. It uses only HTML, CSS, and system fonts. FFprobe and atom inspection are
the acceptance evidence; the MP4 is ignored and never committed.
