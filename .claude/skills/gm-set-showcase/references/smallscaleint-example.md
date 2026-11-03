# SmallScaleInt worked example

SmallScaleInt v6 established the continuous showcase grammar and its repair established the preservation gates:

- eight accepted story stops in one compact cyclic world;
- a square camera following one hero at one slower projected-pixel walk speed, with every interval within 2%;
- stop start times derived from route distance and recorded in the media manifest;
- 2:1 isometric ground filled beyond the camera on 45-degree diamond seams;
- accepted v5 region composition normalized intact, with ordered terrain cells and opaque underlays instead of a sparse
  re-authoring on one grass tile;
- one synchronized sheet track whose active stop contains exactly 24 sprites, differs from the world, and rotates
  clockwise through `E,SE,S,SW,W,NW,N,NE`;
- one region master and one sheet master with H.264/yuv420p/faststart MP4, GIF/poster fallbacks, per-stop posters, and a
  text-free 1 fps timeline for visual QA.

The useful lesson is the relationship between those choices, not the numbers themselves. Measure the new set's walk
cycle, direction order, cells, and scale from its cards. Keep one shared sheet tempo, but do not force SmallScaleInt's
source cadence onto a four-direction or three-frame set.

Earlier versions caught defects worth preserving as checks: accidental duplicate placements (while intentional source
reuse remains valid), the same character in the
world and paired sheet under different pack names, missing pack coverage, independently rendered clips that only looked
continuous after concatenation, and direction-dependent speed drift. The checker makes those failures explicit before
encoding.

The route preflight checks every closed segment against runner-expanded footprints before encoding. Frame QA then checks
that no later-drawn sprite covers the hero. Rain and snow fall down-screen with deterministic wind drift. Building
close-ups verify coherent shells rather than scattered wall, roof, and door parts.

For story authoring, treat an action and reaction as one beat. A monster swing in empty air is not enough. Put the gate,
crate, character, or other target in the region; name its reaction in `story`; and choose QA frames that show before,
contact, and after.

The review page loads the shared region and sheet videos once. Scene controls seek both tracks to a manifest start time;
they do not swap in a per-scene clip. All names and descriptions remain HTML/manifest metadata, never rendered pixels.
