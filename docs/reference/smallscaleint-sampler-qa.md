# SmallScaleInt sampler QA

The sampler at `games/samplers/smallscaleint` is the repeatable quality gate for the private SmallScaleInt style set.
It produces six four-second clips and one 24-second hard-cut trailer at 1440x900 and 60 fps. Licensed source media,
captures, and the final trailer remain in ignored `assets-local/` paths and are never published from the repository.

## Pipeline findings

| Finding | Resolution |
| --- | --- |
| The verifier only exposed a phone-safe 30 fps encode, so it could not produce the requested native 3x/60 fps evidence. | `gm run` now accepts `--record-fps` and `--record-native`. Native recording renders every requested frame through the deterministic hook and encodes exactly 60 frames per second; the default clip is unchanged. |
| Full-page screenshot capture was too slow under SwiftShader, and a MediaRecorder canvas stream dropped 3 to 4 of every 48 frames, which silently sped up and froze the end of each clip. | Native recording reads each frame back from the game canvas as PNG in bounded chunks and refuses a short chunk, so every clip holds exactly 240 frames with no padded tail. |
| The verifier's `drawCalls` budget reads the SDK's cumulative render count since boot, so 240 native renders exceed the 250-call mobile budget and the run reports `fail` although every frame is correct. | Left unchanged here because it affects every game's report; a follow-up ticket corrects the measurement. The clips are judged by frame count and visual inspection. |
| Deterministic capture records video only, but the trailer requires game SFX and no music. | The game and trailer builder share `src/trailer-cues.json`; post-processing mixes only the verified `move-a`, `hurt-a`, and `coin-a` game SFX. |
| Private licensed files cannot be checked in or attached to public GitHub records. | `prepare-assets.mjs` verifies card ids and source SHA-256 values before copying the 25 required files into ignored `public/assets-local/`; every output stays under ignored `assets-local/`. |
| The Orc 04 combined sequences are catalogued as a prop and do not expose sheet geometry, although the files are 15-column, eight-direction character sheets. | The sampler declares that geometry locally. Asset preprocessing should classify combined character sheets and emit their frame/direction metadata so future games do not need this override. |
| The Animals Mega Pack mixes frame sizes: the bison sheets use 96 px frames while the alpacha and wolf use 64 px, and the cards do not say so. A 64 px declaration made the bison flicker in and out of the creatures beat. | The sampler declares 96 px bison frames and rescales them to match; it now refuses to start when a sheet's width is not its column count times its frame width. Card preprocessing should record frame size per sheet. |
| Earlier SmallScaleInt cards had inconsistent direction order, frame rate, and shadow-sheet grouping. | The current cards expose `E, SE, S, SW, W, NW, N, NE`, 12 fps animation metadata, and grouped shadow variants; no sampler workaround is required. |

## Visual acceptance

The final pass checks every clip at its opening, action beat, and closing frame for missing textures, blank frames,
cropping, unreadable scale, and abrupt intra-scene jumps. It also checks the assembled trailer metadata and confirms
that the six clips appear once in the required order. Listening and physical-device checks are manual acceptance
steps; automated checks do not claim that they were performed.

The local acceptance render produced six 1440x900 H.264 clips with exactly 240 frames and 4.00 seconds per clip. The
assembled H.264/AAC trailer contains 1,440 frames at 60 fps and runs 24.00 seconds. A half-second-interval contact sheet
showed all six beats in order, with their state changes visible, every actor present in every sample, no blank or
missing-texture frames, no text, stable ground anchors, and no cropping at the logical-canvas edge. The last 30 frames
of every clip are distinct, so no clip ends on a padded freeze. The private contact sheet and media remain ignored
beside the trailer.
