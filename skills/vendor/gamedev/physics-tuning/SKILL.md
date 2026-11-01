---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/physics-tuning/SKILL.md
modified: true
name: physics-tuning
description: >
  Tune game physics for stable, good-feeling motion — fixed vs variable
  timestep, render interpolation, mass/gravity/drag, continuous collision
  detection (CCD) to stop tunneling, fixing jitter, and collision layers/masks.
  Engine-neutral. Use when the user mentions physics feel, jitter, tunneling,
  fixed timestep, FixedUpdate, CCD, bouncing/unstable physics, or collision layers.
---

# Physics tuning

Most "bad physics" is not a bug in the engine — it's a mismatch between the
**fixed-timestep simulation** and the **variable-rate render loop**, or untuned
mass/drag/CCD/layer settings. This skill covers the engine-neutral knobs that
make physics stable and responsive; pair it with `phaser-arcade-physics` (or the
vendored Phaser `physics-arcade` / `physics-matter` skills) for the concrete APIs.

## When to use

- Use when motion jitters, objects pass through walls (tunneling), stacks
  explode, or movement feels floaty/sticky/laggy.
- Use to decide what goes in the fixed (physics) step vs the render frame, and
  how to interpolate between them.
- Use to tune gravity, mass, drag, restitution, solver iterations, sleeping, and
  collision layers/masks.

**When *not* to use:** for an engine's exact bodies and collision callbacks, use
`phaser-arcade-physics` or the vendored Phaser physics skills. For *movement
decisions* (when to jump, AI steering) use `input-systems`. For
platformer jump-feel specifics like coyote time/jump buffering, that's input/
controller territory — see `input-systems` and the `platformer` genre.

## Core workflow

1. **Run physics on a fixed timestep.** Simulate at a constant rate (e.g. 50–60
   Hz). A fixed `dt` makes the simulation deterministic-ish and stable; a
   variable `dt` makes integration and collisions inconsistent. Phaser Arcade
   steps at `physics.arcade.fps` (default 60) with `fixedStep: true` by default.
2. **Put physics work in the physics callback**, not the render frame. Apply
   forces/velocities and read collisions in the fixed step (Arcade's
   `worldstep` event, which passes that step's `dt`).
3. **Interpolate rendering between physics ticks.** The render frame rate ≠ the
   physics rate, so smoothly interpolate visuals toward the latest physics
   state (Arcade has no built-in interpolation; hand-roll it on a display
   object that follows the body) to remove visible stutter.
4. **Tune the body, not the scene.** Set mass for relative weight, drag for
   damping, per-body gravity, and bounce/friction on the body.
5. **Stop tunneling** on small/fast bodies: cap maximum velocity, raise the
   physics rate, or ray-cast fast projectiles (Arcade has no CCD).
6. **Stabilize stacks/joints** with more solver iterations (Matter), sane mass
   ratios, and sleeping for resting bodies.
7. **Verify by feel and stress test.** Play at low and high frame rates; throw
   fast objects at thin walls; stack and shove bodies. Report what you observed.

## Patterns

### 1. Fixed timestep for simulation, render interpolation for smoothness

```ts
import Phaser from 'phaser';

class PlayScene extends Phaser.Scene {
  player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  visual!: Phaser.GameObjects.Sprite;
  prev = new Phaser.Math.Vector2();
  curr = new Phaser.Math.Vector2();
  stepMs = 1000 / 60;
  sinceStep = 0;

  create(): void {
    this.player = this.physics.add.sprite(100, 100, 'player').setVisible(false);
    this.visual = this.add.sprite(100, 100, 'player');
    // Physics callback: runs at the FIXED rate. Use its dt for all integration.
    this.physics.world.on('worldstep', (dt: number) => {
      this.player.body.velocity.x += 30 * dt;                  // integrate with the FIXED dt
      this.prev.copy(this.curr);
      this.curr.set(this.player.body.x, this.player.body.y);   // record for interpolation
      this.sinceStep = 0;
    });
  }

  // Render frame: runs as fast as the display. Interpolate between physics states.
  update(_time: number, frameMs: number): void {
    this.sinceStep += frameMs;
    const alpha = Math.min(this.sinceStep / this.stepMs, 1);   // 0..1 within the tick
    this.visual.setPosition(
      Phaser.Math.Linear(this.prev.x, this.curr.x, alpha) + this.player.body.halfWidth,
      Phaser.Math.Linear(this.prev.y, this.curr.y, alpha) + this.player.body.halfHeight,
    );
  }
}
// RIGHT: integrate in the fixed step, render via interpolation.
// WRONG: applying forces in update() with the frame delta — speed and collisions
// then depend on frame rate and jitter under load.
```

Arcade's step rate is the `physics.arcade.fps` config value (or
`this.physics.world.setFPS(hz)` at run time). Matter steps once per game frame
unless you configure `runner`. Interpolate only the objects whose stutter shows.

### 2. Stop tunneling: speed cap + physics rate

```ts
import Phaser from 'phaser';

// Fast, small bodies skip past thin colliders between ticks. Arcade has no CCD, so:
const PHYSICS_HZ = 120;
const MAX_SPEED = 900;                       // px/s
function guardTunneling(scene: Phaser.Scene, bullet: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody): void {
  scene.physics.world.setFPS(PHYSICS_HZ);    // smaller step, shorter distance per tick
  bullet.body.setMaxSpeed(MAX_SPEED);        // cap so one step can't cross a wall
}
// Rule of thumb: max_distance_per_step (= MAX_SPEED / PHYSICS_HZ) should be < the
// thinnest wall. For bullets, test a Phaser.Geom.Line against walls instead.
```

### 3. Body tuning: mass, drag, gravity, bounce

```ts
import Phaser from 'phaser';

// Mass is RELATIVE weight in collisions; it does NOT change fall speed (gravity
// accelerates all masses equally). Use drag and per-body gravity to shape feel.
function tuneCrate(crate: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody): void {
  crate.body.setMass(2);                     // heavier pushes lighter in collisions
  crate.body.setDamping(true).setDrag(0.5);  // damping drag: velocity *= 0.5 per second
  crate.body.setGravityY(300);               // added to the world gravity for this body only
  crate.body.setBounce(0.2);                 // restitution 0..1
  crate.body.setFriction(0.8, 0);            // how much a riding body moves with this one
}
// Matter bodies: setBounce, setFriction, setFrictionAir, setMass, setIgnoreGravity.
```

### 4. Collision layers and masks (who collides with whom)

```ts
import Phaser from 'phaser';

// A body is ON its category and COLLIDES WITH the categories in its mask. Both
// sides of a pair must agree for them to interact.
function setupLayers(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, pickup: Phaser.Physics.Arcade.Sprite): void {
  const LAYER = {
    world: scene.physics.nextCategory(),
    player: scene.physics.nextCategory(),
    enemy: scene.physics.nextCategory(),
    pickup: scene.physics.nextCategory(),
  };
  player.setCollisionCategory(LAYER.player);
  player.setCollidesWith([LAYER.world, LAYER.enemy, LAYER.pickup]);   // player detects world+enemies+pickups
  pickup.setCollisionCategory(LAYER.pickup);
  pickup.setCollidesWith([LAYER.player]);                             // pickup only reacts to player
}
// Matter: setCollisionCategory / setCollidesWith on the body, categories from
// this.matter.world.nextCategory(). Keep a named table, not magic numbers.
```

## Pitfalls

- **Applying forces/movement in the render frame** (`update()`) makes
  behavior frame-rate dependent — faster PCs run faster, and collisions get
  flaky. Do simulation in the fixed step.
- **Visible jitter** even with a fixed step usually means no render
  interpolation: the physics rate and display rate beat against each other.
  Interpolate the visual.
- **Tunneling** through thin walls: discrete collision misses fast movers. Cap
  speed, thicken walls, raise the physics rate, or ray-cast.
- **Expecting heavier objects to fall faster.** Gravity is acceleration; mass
  affects collision response, not fall speed. Use per-body gravity/drag for feel.
- **Exploding stacks / jittery joints** (Matter): mass ratios too extreme, or too
  few solver iterations. Keep mass ratios modest and raise iteration counts.
- **Bodies that never rest** burn CPU and twitch. Enable Matter sleeping
  (`enableSleeping: true`, `setSleepThreshold`) for resting objects.
- **One-directional layer setup**: A's mask includes B but B's mask excludes A.
  Detection/collision can need both sides; verify the full matrix.
- **Huge `dt` spikes** (tab switches, load hitches) blow up integration. Arcade
  only runs whole fixed steps, but cap the game loop delta (`fps.smoothStep`,
  the default, smooths spikes) so a stall doesn't launch everything.
- **Teleports smear across the screen** with hand-rolled interpolation: the
  renderer blends from the old position. After `body.reset(x, y)`, set the
  previous state equal to the current one.
- **Feel changes after raising the physics rate**: Arcade damping applies
  `drag ^ dt` per step and is rate-independent, but linear drag and any
  per-step velocity edits you wrote are not. Re-tune after changing `fps`.

## References

- `references/timestep-and-ccd.md` — the fixed-timestep accumulator loop,
  interpolation math, substepping, CCD modes, solver/iteration tuning, sleeping,
  and a stability checklist.

## Related skills

- `phaser-arcade-physics` — concrete bodies, colliders, and callbacks.
- `input-systems` — responsive controls, jump buffering, coyote time.
- `platformer` — the genre whose feel depends most on this tuning.
