# AnyKit lessons: what a kit pipeline has that ours does not

- **Checked:** 2026-11-05
- **Sources:** [`apekshik/anykit`](https://github.com/apekshik/anykit) at `main` (MIT), read at
  `agent/PROMPT.md`, `agent/KIT.md`, `agent/kit_builder.py`, `kit/tools/{normalize,compare,present,library}.py`,
  `kit/gen.mjs`, and the retry index in `app.py`; sibling READMEs [`anyscene`](https://github.com/apekshik/anyscene)
  and [`anyshot`](https://github.com/apekshik/anyshot) skimmed for the same harness.
- **Boundary:** reading and local reimplementation only. No fal, no provider key, no paid generation, no cloud
  processing of any pack. AnyKit is credited in each file that carries a technique from it.
- **Why it applies:** AnyKit builds a *set* of props that must read as one world at real scale, and it judges the
  whole set before shipping it. That is the same problem `gm-asset-intake`, `gm-asset-variants`, `gm-set-showcase`
  and `gm-verify` already have, and the thing they judge least well.

## What AnyKit does, and what we had

| Technique | The problem it solves | Did we have it? | Where it belongs here | Adopted |
|---|---|---|---|---|
| One shared style paragraph per set | Ten props from ten prompts read as ten worlds | No. `gm-asset-variants` could recolor one model; nothing described a set once | `gm-asset-variants` (a set's style line is written once, beside the variant specs) | Yes |
| Real-world scale from a looked-up height | Generators invent size: a mug as tall as a fridge | Partly: cards record pack facts, not a per-model height | `skills/gm-3d` (prep step) and `scripts/assets/check_glb.py` (`--height`) | Yes |
| A lineup with a scale bar | Nothing shows whether a set is in proportion | No: our lineups are thumbnail grids at unrelated scales | `check_glb.py --lineup` (to-scale x positions plus the bar), used by `gm-asset-intake` and the showcase skill | Yes |
| Orientation and origin normalization | Models face different ways and float above their origin | No | `skills/gm-3d`: front -Y, bottom-centre origin, rotate mesh data not the object | Yes |
| Triangle and texture budgets with a simplified LOD | Raw output is two million triangles and 4K textures | No | `skills/gm-3d` budget table, `check_glb.py --budget/--texture-cap/--require-lod1` | Yes |
| An independent critic that scores the whole set against the reference | The agent that built a set stops seeing its flaws | Partly: `gm-verify` looks at one game screen, item by item | `set_critic.py` (bar, caps, stall rule) plus the rubric line in `gm-verify` and the showcase skill | Yes |
| A Stop hook that keeps working until every deliverable exists | "Done" claimed with files missing | Partly: the showcase skill lists a completion gate in prose | `set_critic.py missing_deliverables()` and the same gate in the showcase skill | Yes (as a gate, not a hook) |
| Retry-safe work that never redoes a finished item | A rerun pays again for things already on disk | Partly: variants rebuild all; `preprocess_kaykit` re-runs every card | `check_glb.py --jobs` skip rule, stated in `gm-3d` and `gm-asset-variants` | Yes |
| Compare candidates under one light and pick by looking | Two generators, one right pick per item | No generator; the *comparison* habit still applies to variants | `gm-asset-variants` step 4 | Yes |
| Dials (count, variety, detail, wear, wetness, warmth, look) | A customer's explicit setting must beat the reference | Not applicable: we do not generate sets from references | — | No |
| Per-item generator choice, spend log, GPU queue, 2-hour cap guard | Cost control on a hosted pipeline | Not applicable: no hosted pipeline, no spend | — | No |
| Glass/transmissive fix, screen content, brand paint-out by texel raycast | Fixing generator artefacts | Not applicable: our sources are authored packs with a licence, not generated images | — | No |
| Fictional maker on every label | No real brands in generated props | Already covered: our rights rules and pack licences (C3 §5) | — | No |
| Heartbeat and live stage log | A long build looks dead | Already covered by Aiur's `progress`/`progress.status` events | — | No |

## What changed

**`skills/gm-3d`** — the prep step a set needs before a game consumes it: real metres from a looked-up height (dims
for boxy props), bottom-centre origin, front -Y, the mesh data rotated rather than the object, a triangle and texture
budget table with a LOD1 at about a quarter, the `check_glb.py` gate, the to-scale lineup, and the retry-safe rule
that a rebuild never redoes an item whose output is newer than its inputs.

**`scripts/assets/check_glb.py`** (new, with `test_check_glb.py`) — the local gate behind that skill text. It reads
the GLB container directly: no Blender, no browser, no network. Checks metres and origin, triangle budget, texture
cap, a LOD1 at about a quarter of the triangles, returns the dims a manifest needs, lays a set out to scale with a
scale bar, and reports what a batch prep still has to do. AnyKit's `normalize.py` does this inside Blender; ours runs
anywhere Python does, which is the difference that lets it gate CI.

**`scripts/assets/set_critic.py`** (new, with `test_set_critic.py`) — the parts of AnyKit's critic that should not be
re-derived each round: the eight categories, the pass bar (no category below 6, average 7 or more), at most five
fixes most damaging first, a cap at eight rounds that *delivers* rather than looping, a stall rule, and the
deliverable list a set must have before anyone says done. The looking stays with the agent (`gm-verify`): no provider
key, no paid judge.

**`gm-asset-variants`** — one shared style paragraph for a set, the same-light compare sheet with a one-line reason
per pick, the lineup beside the source with a scale bar, and the skip rule for a rebuild.

**`gm-asset-intake`** — a kit-assembly step after unpacking: measured dims and triangle counts in the set manifest, a
to-scale lineup with a scale bar, and no set handed on without one critic round recorded.

**`gm-set-showcase`, `gm-asset-showcase`, `gm-verify`** — judge the set as a set: the eight categories, the bar, the
fixes cap, the round cap, and the deliverable gate, pointing at `set_critic.py` and
`scripts/assets/check_glb.py` rather than restating them.

## Skipped, and why

- **Everything that spends money or needs fal:** generation, spend logs, GPU queues, the 2-hour cap guard. The ticket
  forbids provider keys and paid generation, and this host has no GPU.
- **Generator-artefact fixes** (opaque glass, fake screens, brand paint-out): they repair image-to-3D output. Our
  sources are authored packs with a licence and an original we never touch, so there is nothing to repaint.
- **Dials and per-item generator choice:** no generator is chosen here.
- **A Stop hook of our own:** the harness that keeps an agent working is Aiur's, not a repo script. The reusable part
  is the definition of done, which is now `set_critic.missing_deliverables`.
- **The general (non-Game-Maker) skills:** they live outside this repository. The domain-free parts that would fit
  them - a pass bar, a fixes cap, a deliverable gate - are already provided by the agent harness, so nothing was
  copied out of the repository and no external skill was edited.

## Local verification

- `python3 -I scripts/assets/test_check_glb.py` - 14 tests, OK. Each case builds its own GLB, so the container
  parsing, bounds, texture sizing, LOD1 ratio, skip rule and lineup maths are all exercised.
- `python3 -I scripts/assets/test_set_critic.py` - 10 tests, OK.
- `python3 -I scripts/assets/check_glb.py packages/sdk/test/fixtures/cube.meshopt.glb` - read a real meshopt GLB
  (2 m cube) and failed it for standing off its origin, which is what an unprepared export looks like.
- `make test-py` - passes with a home directory outside the repository; see the PR for the exact command.
- **Not run here:** Blender is installed but cannot start on this host (`liblapack.so.3` missing), and Node is absent,
  so no Blender- or browser-based step of these skills was executed in this workspace.
