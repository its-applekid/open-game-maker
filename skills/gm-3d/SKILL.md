---
name: gm-3d
description: Author and verify rights-cleared 3D assets offline with Blender, then use Three.js at runtime.
---

# Game Maker 3D

Use Blender for offline mesh, material, rig, animation, GLB, still, and turntable work. Load the relevant
`vendor/threejs` skill for runtime scenes, loading, lighting, cameras, or performance. Do not rebuild offline authoring
inside Three.js or put game rules in a Blender script.

## Author deterministically

Start with installed asset cards or procedural geometry. Record asset provenance before opening a source file, and
keep paid-pack sources and derivatives under ignored `assets-local/`; never upload them. A script must create or open
an exact input, set units and transforms, name important objects, set an explicit renderer and camera, and write to an
explicit local path.

Run scripts headlessly as `blender --background --python-exit-code 1 --python scene.py`; the error-code option must
precede the script option or Blender can still exit zero after a Python exception. Seed randomness, avoid GUI
state, and fail on missing inputs. Apply only the transforms the runtime contract requires. For GLB, inspect scale,
axes, material slots, textures, animation names, and triangle count before the game consumes it.

Blender MCP is optional operator tooling. Document the upstream server when an operator wants an interactive session,
but do not install its add-on, edit MCP configuration, open a local control socket, or make a build depend on it.

## Gate the output

Render diagnostic angles with a neutral world and explicit lights. For a turntable, keep the object fixed and move the
camera or an empty by a known angle per frame. Encode locally through FFmpeg, then require H.264, `yuv420p`, expected
duration and dimensions, and top-level `moov` before `mdat`. Load `gm-verify` and inspect silhouette, normals,
materials, clipping, scale cues, and at least three angles.

## Worked example

The local example procedurally builds a bevelled cube with a ring and three colored axis markers, renders a short
Workbench turntable, and writes `assets-local/sets/examples/gm-3d/turntable.mp4`. It contains no downloaded asset; its Blender
source, frames, and MP4 remain ignored local evidence.
