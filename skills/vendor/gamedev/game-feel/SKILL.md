---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/game-feel/SKILL.md
modified: true
name: game-feel
description: >
  Add "juice" and game feel that makes actions satisfying — screen shake, hit-stop/freeze
  frames, tweened/eased motion, squash & stretch, knockback, and layered audio-visual
  feedback — as engine-neutral techniques that pair with the detected engine's tween,
  particle, and camera APIs. Use when the user mentions game feel, juice, "make it feel
  good/punchy", screen shake, hit stop, screen freeze, easing, squash and stretch, impact
  frames, or feedback/polish on hits, jumps, pickups, and deaths.
---

# Game feel (juice)

The difference between a mechanic that *works* and one that feels *good* is feedback: the
layered, slightly-exaggerated response an action provokes. This skill covers the engine-
neutral techniques — screen shake, hit-stop, easing, squash & stretch, knockback, and stacked
feedback — and tells you how to apply them without burying the underlying simulation. It
**adds polish on top of** an existing mechanic; it does not implement the mechanic.

## When to use

- Use when an action (hit, jump, dash, pickup, death, button press) is mechanically correct
  but feels weak, weightless, or unsatisfying, and you want it to feel responsive and punchy.
- Use to add screen shake, hit-stop/freeze frames, eased motion, squash & stretch, knockback,
  flashes, or to layer multiple feedback channels onto one event.
- Use to decide *how much* juice is enough and where it crosses into noise.

**When *not* to use:** for the raw controller math (jump height, coyote time) use the
`platformer` genre and `phaser-arcade-physics`. For camera *follow/deadzone/orbit* framing
use `camera-systems` (this skill only triggers the shake). For mixing, ducking, and adaptive
music use `audio-design`. For shader-based dissolves/flashes use the vendored Phaser
`filters-and-postfx` skill. For the concrete tween/particle APIs, use the vendored Phaser `tweens`
and `particles` skills.

## Core principle: feedback is layered and exaggerated

One satisfying hit is usually **5–8 tiny responses firing together** within ~100 ms: a sound,
a particle burst, a brief hit-stop, a flash, a knockback, a small screen shake, and a number
popping up. Each is cheap; stacked, they read as "impact". Two rules keep it from becoming a
mess: **(1)** exaggerate *briefly* and return to rest (juice is transient, not a new resting
state); **(2)** scale juice to event importance — a footstep is not a boss death.

## Core workflow

1. **Confirm the event hooks exist.** Juice attaches to discrete events: `on_hit`, `on_land`,
   `on_pickup`, `on_death`, `on_fire`. If the mechanic doesn't emit these, add them first.
2. **Pick feedback channels per event** from the menu (sound, particles, shake, hit-stop,
   flash, knockback, tween, number pop). Start with 2–3; add until it reads, then stop.
3. **Make motion eased, not linear.** Route scale/position/UI changes through a tween with an
   ease (overshoot for "pop", ease-out for "settle"). Linear motion feels robotic.
4. **Reserve hit-stop and shake for impact.** They are the strongest, most abusable tools —
   short durations, scaled to importance, and never on routine actions.
5. **Keep feedback off the critical simulation.** Shake moves the *camera/visual*, not the
   body; hit-stop uses time scale or a real-time pause, not a gameplay-logic stall.
6. **Tune by importance tiers.** Define small/medium/large feedback presets and assign events
   to a tier, so the whole game's juice stays consistent and proportional.
7. **Verify by playing and watching.** Run `gm run` and read the sheet; trigger the event
   repeatedly and confirm the feedback fires, returns to rest, and is not nauseating or input-blocking. Report what you observed
   (does shake decay? does input still register during hit-stop?).

## Patterns

### 1. Screen shake by decaying "trauma" (smooth, not a random jitter)

```ts
import Phaser from 'phaser';

// Store trauma 0..1; shake = trauma^2 so small hits barely move, big hits punch.
// Drives the following camera's offset (startFollow) and rotation, never the player body. Decays every frame.
export class TraumaShake {
  trauma = 0;
  private t = 0;

  constructor(
    private cam: Phaser.Cameras.Scene2D.Camera,
    private decay = 1.2, // trauma lost per second
    private maxOffset = new Phaser.Math.Vector2(12, 8),
    private maxRoll = 0.1, // radians
  ) {}

  addTrauma(amount: number): void {
    this.trauma = Phaser.Math.Clamp(this.trauma + amount, 0, 1); // hits ADD; they don't reset
  }

  update(dt: number): void {
    if (this.trauma <= 0) return;
    this.trauma = Math.max(this.trauma - this.decay * dt, 0);
    const shake = this.trauma * this.trauma; // quadratic: gentle low, sharp high
    this.t += dt * 30;
    // Smooth pseudo-random via summed sines, NOT Math.random each frame (that buzzes).
    this.cam.setFollowOffset(this.maxOffset.x * shake * Math.sin(this.t * 1.7), this.maxOffset.y * shake * Math.sin(this.t * 2.3));
    this.cam.setRotation(this.maxRoll * shake * Math.sin(this.t * 1.1));
  }
}
// For a quick one-off with no trauma model, Phaser's cam.shake(durationMs, intensity) is fine — see camera-systems.
```

### 2. Hit-stop / freeze frame (sell impact by briefly stopping time)

```ts
import Phaser from 'phaser';

// Pause physics and animations, then restore after a delay on the scene clock (which keeps running).
let hitStopId = 0;

export function hitStop(scene: Phaser.Scene, durationMs = 80): void {
  const myId = ++hitStopId;
  scene.physics.pause();
  scene.anims.pauseAll();
  scene.time.delayedCall(durationMs, () => {
    if (myId !== hitStopId) return; // a newer hit-stop owns the restore; don't cut it short
    scene.physics.resume();
    scene.anims.resumeAll();
  });
}
// RIGHT: the restore timer runs on a clock you did not freeze.
// WRONG: setting this.time.timeScale = 0 and waiting on this.time — the timer never fires.
```

For a slow-motion hit instead of a full stop, raise `scene.physics.world.timeScale` (in Arcade,
**higher is slower**: 2 = half speed) and lower `scene.tweens.timeScale`, then restore both.

### 3. Squash & stretch + overshoot via an eased tween (the "pop")

```ts
import Phaser from 'phaser';

// Conserve volume: stretch one axis, squash the other, then spring back with overshoot.
export function pop(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): void {
  sprite.setScale(1.3, 0.7); // instant squash on the event
  scene.tweens.add({
    targets: sprite,
    scaleX: 1,
    scaleY: 1,
    duration: 180,
    ease: 'Back.easeOut', // BACK = overshoots past 1, settles
  });
}
// RIGHT: ease back (Back/Elastic) for life. WRONG: ease: 'Linear' → mechanical, dead.
```

### 4. A feedback bundle scaled by importance (keep juice proportional)

```ts
import Phaser from 'phaser';

type Tier = 'small' | 'medium' | 'large';
const TIERS: Record<Tier, { sfx: string; trauma: number; stopMs: number; particles: number; flashMs: number }> = {
  small: { sfx: 'tick', trauma: 0.15, stopMs: 0, particles: 0, flashMs: 0 },
  medium: { sfx: 'hit', trauma: 0.4, stopMs: 50, particles: 6, flashMs: 0 },
  large: { sfx: 'boom', trauma: 0.8, stopMs: 120, particles: 30, flashMs: 60 },
};

// One call per event; the tier decides intensity so the whole game stays consistent.
export function feedback(
  scene: Phaser.Scene,
  at: Phaser.Math.Vector2,
  tier: Tier,
  fx: { shake: { addTrauma(n: number): void }; sparks: Phaser.GameObjects.Particles.ParticleEmitter; hitStop(ms: number): void },
): void {
  const p = TIERS[tier];
  scene.sound.play(p.sfx);
  fx.shake.addTrauma(p.trauma);
  if (p.stopMs) fx.hitStop(p.stopMs);
  if (p.particles) fx.sparks.explode(p.particles, at.x, at.y);
  if (p.flashMs) scene.cameras.main.flash(p.flashMs, 255, 255, 255);
}
```

## Pitfalls

- **Shaking the player/body instead of the camera offset** desyncs collision and aim. Shake
  the camera (or a visual pivot), never the simulated transform.
- **Random offset every frame** buzzes like static. Drive shake from sampled noise/sin and a
  decaying trauma value so it's smooth and self-ending.
- **Hit-stop restored by a timer on the frozen clock** never resumes (at time scale 0 the timer
  never advances). Restore on a clock you did not freeze (the scene clock while only physics and
  animations are paused, or `window.setTimeout`).
- **Hit-stop on every frame of a held attack** locks the game. Trigger it once per impact.
- **Overlapping hit-stops** (two hits 30 ms apart) let the first timer restore time scale in
  the middle of the second freeze. Let only the newest call restore it, as above.
- **Linear tweens everywhere** feel robotic. Ease almost everything; reserve overshoot
  (`Back`/`Elastic`) for "pop" and ease-out for "settle".
- **Permanent exaggeration** (scale never returns, shake never decays) becomes the new normal
  and stops reading as feedback. Juice must return to rest.
- **Over-juicing routine actions** (full shake + hit-stop on every footstep) causes nausea and
  hides real impacts. Scale to importance; add a "reduce screen shake"/"reduce flashing"
  accessibility option.
- **Feedback that blocks input** (long freeze, un-cancelable animation) hurts responsiveness.
  Keep juice short and let input buffer through it.

## References

- For the trauma-shake math, easing-curve cheat sheet (which ease for pop vs settle), knockback
  + flash + number-pop recipes, importance-tier presets, and Phaser tween/particle bindings,
  read `references/feedback-recipes.md`.

## Related skills

- `camera-systems` — owns camera follow/deadzone/orbit; this skill only feeds it shake trauma.
- Vendored Phaser `tweens`, `particles`, `cameras` — concrete tween/particle/camera APIs juice rides on.
- `audio-design` — the sound layer of every feedback bundle; ducking and SFX variation.
- `physics-tuning` — knockback forces and the timestep juice must not destabilize.
- `platformer` — a genre whose moment-to-moment feel this elevates.
