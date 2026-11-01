---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/genres/platformer/references/feel-tuning.md
modified: true
---

# Platformer feel tuning (depth)

Deeper detail behind the controller in `SKILL.md`. Snippets are TypeScript against
Phaser 4.2 Arcade Physics; the math is standard kinematics and ports to any engine. Tune by *outcome*
(tiles of height, seconds to apex), then read off the physics values.

## 1. Deriving jump physics

A jump is just projectile motion. Choose the two values a designer can actually feel —
**peak height** `h` and **time to reach the peak** `t` — and solve for the rest. With the
y-axis pointing down (most 2D engines):

```text
gravity        g  = 2h / t²
jump_velocity  v0 = -2h / t          (negative = upward)
peak reached after t seconds; total airtime ≈ 2t (symmetric gravity)
```

Asymmetric gravity makes the fall snappier than the rise without changing peak height:

```ts
export function gravities(g: number, fallMultiplier = 1.8): { rise: number; fall: number } {
  // 1.5–2.0 feels good; airtime shortens and the arc reads as a quick pop up, then a weighty drop.
  return { rise: g, fall: g * fallMultiplier };
}
```

If you instead know the jump velocity and want the height: `h = v0² / (2g)`.

These formulas describe continuous motion. A game integrates in steps, and the usual
"add gravity to velocity, then add velocity to position" update peaks short by about
`v0 · dt / 2`: with a 56 px jump and a 0.35 s apex that is ~2.7 px at 60 Hz and ~5 px at 30 Hz.
Fixed-tick physics keeps the error the same on every machine (tune by eye and accept it). To hit
the designed height exactly, apply half the gravity before the move and half after:

```ts
// For a body you integrate yourself (Arcade body with setAllowGravity(false) and moves=false).
export function stepVertical(state: { y: number; vy: number }, g: number, dt: number): void {
  state.vy += 0.5 * g * dt;
  state.y += state.vy * dt;
  state.vy += 0.5 * g * dt;
}
```

## 2. Full feel knob reference

| Knob | What it changes | Typical range | Notes |
|------|-----------------|---------------|-------|
| Jump height | vertical reach | 2–5 tiles | Keep below the player's *commit* comfort. |
| Time to apex | weight/snappiness | 0.25–0.45 s | Lower = snappier, "tighter". |
| Fall multiplier | floatiness on descent | 1.3–2.2× | The single biggest "feel" lever. |
| Coyote time | post-ledge grace | 0.05–0.15 s | ~3–9 frames at 60 Hz. |
| Jump buffer | pre-land grace | 0.08–0.18 s | Forgive early presses. |
| Variable-jump cut | tap vs hold height | ×0.3–0.6 of vy | Cut only while rising. |
| Apex hang | air control at top | ×0.4–0.6 g near apex | Define apex as `|vy| < hang_threshold`. |
| Max fall speed | terminal velocity | clamp | Prevents tunneling and runaway speed. |
| Ground accel | time to top speed | 0.03–0.12 s | Instant = arcadey; longer = momentum. |
| Air control | steering mid-jump | 0.5–1.0× ground | <1 gives committed arcs. |
| Coyote-after-jump lockout | prevents double jumps | consume timers | Zero both timers on jump. |

## 3. Apex hang and fast-fall

```ts
import Phaser from 'phaser';

const APEX_THRESHOLD = 40; // px/s

export function applyApexAndFastFall(body: Phaser.Physics.Arcade.Body, baseG: number, holdingDown: boolean): void {
  let g = baseG;
  // Reduced gravity near the apex gives a moment of extra air control ("hang time").
  if (Math.abs(body.velocity.y) < APEX_THRESHOLD && !body.onFloor()) g *= 0.5;
  // Optional fast-fall: holding Down past the apex increases downward gravity.
  if (holdingDown && body.velocity.y > 0) g *= 1.5;
  body.setGravityY(g);
}
```

## 4. Corner correction (ceiling and ledge nudging)

When a rising jump clips a corner by a pixel or two, players read it as the game being
"sticky". Nudge them past it instead of stopping the jump dead:

```ts
import Phaser from 'phaser';

// On hitting a ceiling while rising, if only the outer 1–4 px are blocked, shift the body
// sideways into the free space and keep the upward velocity. Test both directions, at the
// position the body is trying to move to this step.
export function cornerCorrect(
  body: Phaser.Physics.Arcade.Body,
  layer: Phaser.Tilemaps.TilemapLayer,
  dt: number,
): void {
  if (!body.blocked.up || body.velocity.y >= 0) return;
  const targetY = body.y + body.velocity.y * dt;
  const freeAt = (x: number): boolean =>
    layer.getTilesWithinWorldXY(x, targetY, body.width, body.height, { isColliding: true }).length === 0;
  for (const offset of [1, 2, 3, 4]) {
    // smallest nudge first
    for (const side of [-1, 1]) {
      if (freeAt(body.x + side * offset)) {
        body.x += side * offset; // keep rising; don't zero velocity.y
        return;
      }
    }
  }
}
```

Only nudge when the blocked part is a corner, never when the player is under a solid ceiling
more than a few pixels wide; the 4 px cap is what enforces that.

The same idea on landing edges (a few px of "ledge grab"/snap) makes platforms feel generous.

## 5. One-way platforms and drop-through

- Mark the platform's collision as one-directional (solid only when the player is above and
  moving down). Arcade exposes this directly — do not hand-roll it
  (`body.checkCollision.down = false` on the platform body; for tile layers, collide only the
  top face of one-way tiles).
- **Drop-through:** when the player holds Down + Jump on a one-way platform, disable that
  collision for ~0.1–0.2 s (or until the player's top passes below the platform), then re-enable.
  In Phaser, return `false` from the player–platform collider's process callback for that window
  rather than disabling the platform body, so other bodies still land on it.

## 6. Moving platforms

- Carry the player: add the platform's per-frame delta to the player's position while standing
  on it, so they ride it instead of sliding off.
- Apply the platform's velocity to the player on jump-off so leaps from a moving platform feel
  physical. Cap the inherited horizontal velocity so it can't fling the player uncontrollably.
- **Check what the engine already does before adding either.** Phaser
  Arcade carries a rider horizontally when the platform is an immovable *dynamic* body that is
  moving (`body.friction`, default `(1, 0)`); a static body does not. Arcade does not add the
  platform's velocity on jump-off; add it (capped) yourself.

## 7. Camera follow

- **Deadzone:** a rectangle the player can move within before the camera reacts; stops jitter.
- **Look-ahead:** offset the camera target in the direction of motion / facing so the player
  sees what's coming. Lerp the offset; don't snap it.
- **Smoothing:** move the camera toward its target with an exponential `lerp(cam, target,
  1 - exp(-k*dt))` rather than a fixed fraction, so it is frame-rate independent.
- **Clamp:** keep the camera rect inside the level bounds so you never show out-of-level space.
- **Vertical care:** lock or slow vertical follow during normal jumps; only follow Y on large
  height changes (falling into a pit, climbing) to avoid bobbing on every hop.

## 8. Teaching and pacing (hand-off to `level-design`)

- Introduce one mechanic in isolation, let the player practice it safely, *then* combine it
  with a known one. Never introduce two new things in the same hazard.
- Place the first instance of any lethal hazard where failure is cheap (near a checkpoint,
  no long re-traversal).
- Keep checkpoint-to-checkpoint segments short early, longer later; respawn must be instant.
