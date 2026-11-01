---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/physics-tuning/references/timestep-and-ccd.md
modified: true
---

# Fixed timestep, interpolation, CCD, and stability

The root cause of most physics problems is the relationship between a **fixed**
simulation step and a **variable** render frame. Get the loop right and most
"jitter" and "frame-rate dependence" complaints disappear.

## Why a fixed timestep

Numerical integration and collision resolution are sensitive to step size. With a
variable `dt`, the same scene behaves differently at 30 vs 144 FPS — springs gain
energy, fast objects tunnel more, stacks settle differently. A **constant** `dt`
makes the simulation consistent and far more reproducible.

## The accumulator loop (engine-neutral)

Engines implement this for you; understanding it explains the settings.

```ts
const PHYSICS_HZ = 60;
const FIXED_DT = 1 / PHYSICS_HZ;
const MAX_STEPS = 5;           // cap to avoid the "spiral of death" after a hitch
let accumulator = 0;

interface State { x: number; y: number }
let prevState: State = { x: 0, y: 0 };
let currState: State = { x: 0, y: 0 };

function physicsStep(dt: number): void {
  currState = { x: currState.x + 120 * dt, y: currState.y };   // ALL simulation uses the constant dt
}
function interpolate(a: State, b: State, alpha: number): State {
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}
function render(_s: State): void {}

function frame(renderDt: number): void {
  accumulator += Math.min(renderDt, FIXED_DT * MAX_STEPS);   // clamp giant dt spikes
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    prevState = currState;           // for interpolation
    physicsStep(FIXED_DT);
    accumulator -= FIXED_DT;
    steps += 1;
  }
  const alpha = accumulator / FIXED_DT;   // leftover fraction toward the next tick
  render(interpolate(prevState, currState, alpha));
}
```

- Running 0, 1, or several physics steps per frame is normal and correct.
- Clamping `renderDt` (and `MAX_STEPS`) prevents a slow frame from requesting
  dozens of steps, which would make the game slower still — the "spiral of death".
- The price of the clamp: when rendering falls below `PHYSICS_HZ / MAX_STEPS`
  FPS, the game runs in slow motion. Phaser Arcade runs this loop internally at
  `physics.arcade.fps` with `fixedStep: true`; the game loop's `fps.smoothStep`
  (default on) smooths delta spikes before they reach it.

## Render interpolation

The render frame almost never lands exactly on a physics tick, so drawing the raw
physics transform stutters. Interpolate the *visual* between the previous and
current physics states by `alpha`:

```text
visual_pos = lerp(prev_pos, curr_pos, alpha)
visual_rot = slerp(prev_rot, curr_rot, alpha)   # rotations: spherical lerp
```

This adds up to one physics step of latency but removes stutter. Phaser Arcade
and Matter do not interpolate for you: record the body state in the `worldstep`
handler and lerp a separate display object in `update()` (three.js: lerp the
mesh, `Quaternion.slerp` for rotation). After a teleport, reset the history
(set `prevState = currState`) or the object visibly slides from its old position.

## Substepping

For very fast bodies or stiff joints, sub-divide each physics step into N
substeps (smaller `dt`) for accuracy, at CPU cost. Many engines expose a max
substep / solver substep count. Raise it when fast or stiff systems misbehave;
lower it to save CPU.

## Continuous collision detection (CCD)

Discrete collision tests positions once per step; a body moving more than its own
thickness per step can pass through a thin collider entirely (tunneling). CCD
sweeps the body along its motion and catches the first contact.

- Enable CCD only on bodies that need it (small + fast: bullets, balls); it costs
  more than discrete checks.
- Modes vary: sweep against static geometry only, or against dynamic bodies too
  (more expensive). Use the cheapest mode that fixes your case. Phaser Arcade and
  Matter have no CCD, so the complementary fixes below are the tools there;
  speculative modes in other engines can cause "ghost collisions".
- Complementary fixes: cap maximum velocity so
  `speed / PHYSICS_HZ < thinnest_collider`; thicken thin walls; raise PHYSICS_HZ.
  For bullets, a ray or shape cast along the frame's motion is often simpler
  than a fast rigid body.

## Solver iterations and stability

The constraint solver runs a fixed number of iterations per step; more iterations
= stiffer, more stable stacks and joints, at CPU cost.

- **Exploding/penetrating stacks**: raise solver (position/velocity) iterations.
  Where the knob lives: Phaser Matter world config `positionIterations`
  (default 6), `velocityIterations` (default 4) and `constraintIterations`.
  Arcade has no solver iterations; it separates each pair once per step.
- **Extreme mass ratios** (a feather resting under a boulder) are inherently
  unstable — keep ratios within ~1:10 where you can.
- **Jittery resting contacts**: enable a small contact offset / allowed
  penetration, and let bodies sleep.

## Sleeping

Bodies at rest should **sleep** (stop being simulated) until disturbed. This
saves CPU and stops micro-jitter on resting objects. Tune the linear/angular
sleep thresholds and time-to-sleep; ensure gameplay-critical bodies wake on the
right events (collisions, force application).

## Stability checklist

- Physics in the fixed step; rendering interpolated.
- `renderDt` and step count clamped against hitches.
- Fast/small bodies speed-capped or ray-cast; physics rate high enough.
- Mass ratios modest; per-body gravity/drag tuned for feel, not mass.
- Solver iterations high enough for your stacks/joints.
- Sleeping enabled with sane thresholds.
- Collision layer/mask matrix verified in both directions.
- Tested at low and high frame rates and under CPU load.
