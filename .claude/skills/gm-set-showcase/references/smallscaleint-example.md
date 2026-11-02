# SmallScaleInt worked example

SmallScaleInt established the reusable showcase grammar:

- six 7.5-second story stops on one reorderable sequence;
- a square camera following a hero at a natural 153 px/s walk cadence;
- one 15-frame walk cycle per 191 px at 12 sprite frames/s on a 24 fps output;
- 2:1 isometric ground filled beyond the camera on 45-degree diamond seams;
- a paired sheet whose cast differs from the region and rotates clockwise through `E,SE,S,SW,W,NW,N,NE`;
- H.264/yuv420p/faststart masters, looping GIF fallbacks, stills, and a timeline for visual QA.

The useful lesson is the relationship between those choices, not the numbers themselves. Measure the new set's walk
cycle, direction order, cells, and scale from its cards. Keep one shared sheet tempo, but do not force SmallScaleInt's
15-frame cadence onto a four-direction or three-frame set.

The original implementation also caught three plan defects worth preserving as checks: repeated props across regions,
the same character on a region and its paired sheet under different pack names, and pack inventory that was never shown.
This skill's checker makes all three failures explicit.

For story authoring, treat an action and reaction as one beat. A monster swing in empty air is not enough. Put the gate,
crate, character, or other target in the region; name its reaction in `story`; and choose QA frames that show before,
contact, and after.
