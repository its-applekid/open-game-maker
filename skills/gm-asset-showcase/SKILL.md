---
name: gm-asset-showcase
description: Build and verify a pre-rendered, rights-gated asset-set showcase from installed asset cards.
---

# Asset-set showcase

Use this for a style picker or review reel that demonstrates a whole compatibility set. Source cards, scene data,
frames, and generated media stay under ignored `assets-local/`; do not commit licensed art or publish private keys.

## Author the world

1. Start from installed asset cards and their declared clips. Never invent a source path or copy source pixels into
   the repository.
2. Give every placed character and prop a stable actor id. Story beats name the actor, action, target, and timing;
   validate those references before rendering.
3. Build one oversized isometric world. Join neighboring regions on diamond seams, overlap their scenery, and make
   every camera sample full-bleed. A region must be larger than its square camera viewport.
4. Put the hero on a short route and use a real walk clip at a natural cadence. Keep stop duration fixed by changing
   distance, not by speeding up the walk.
5. Stage one readable story per region. Face actors toward their targets, play attacks once, switch the target at
   contact to a reaction, and hold a death or settled pose. Ambient motion may loop; combat must not.
6. Keep sheet and region selections complementary. Use every required pack once, preserve deterministic order, and
   reject duplicate props across the two tracks.

## Render the deliverables

Capture deterministically from the authoring data. Emit a square per-region track and a matching per-sheet track.
For each track produce all three:

- an H.264 MP4 with `yuv420p` pixels and `faststart` metadata;
- a looping GIF fallback;
- a poster image from a representative story frame.

The consuming client uses pre-rendered media only. It may apply `autoplay`, `loop`, `muted`, and `playsinline` to the
MP4, then fall back to the GIF or poster. It must never run the compositor, a game engine, or canvas rendering to
show the preview.

## Gate the output

Before capture, validate card ids, action names, facings, stable actor ids, story targets, contact timing, pack
coverage, deterministic ordering, and region/sheet non-duplication. Sample the camera at route ends and both sides of
every diamond seam; reject any sample that exposes empty background.

After assembly, validate the media manifest and every per-region and per-sheet file. Confirm square dimensions,
duration, H.264 profile compatibility, `yuv420p`, `moov` before `mdat`, infinite GIF looping, and a present poster.

Load `gm-verify` and inspect start, contact, reaction, seam, and end stills at desktop and phone sizes. Record a
physical iPhone Safari playback check as post-deploy when the issue workspace cannot perform it; never claim it ran.
