---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/genres/platformer/SKILL.md
modified: true
name: platformer
description: >
  Build a 2D platformer: run/jump control with coyote time, jump buffering, and variable jump
  height, plus tiled levels and hazards. Use for a platformer or Mario/Celeste-like, or tuning jump feel.
---

# Platformer

A playbook for 2D platformers — the run/jump controller "feel", level structure, hazards,
and goals. This is a **compositional** skill: it wires an engine movement skill, a tilemap
skill, and design skills into a working game. It does **not** re-teach physics or tilemaps;
it tells you what to build and how to make jumping feel good.

## When to use

- Use when building a side-scrolling or single-screen platformer, a "Mario-like" /
  "Celeste-like", or any game whose core verb is **jump between surfaces**.
- Use when a jump feels floaty, unresponsive, or "unfair" and you need feel fixes
  (coyote time, jump buffering, variable height, corner correction).

**When *not* to use:** top-down movement with no gravity → use the engine movement skill
directly. 3D first-person traversal → a three.js controller (`threejs-interaction`). Grid/turn
movement → a grid movement pattern. For the raw Arcade body API, use `phaser-arcade-physics`.

## Core loop

**Observe a gap/hazard → commit to a jump or move → land safely (or die) → reach the next
checkpoint/goal.** A platformer lives or dies on the *moment-to-moment* feel of that single
jump, repeated thousands of times. Tighten the controller first; everything else is content.

## Must-have systems

1. **Run/jump controller** — horizontal accel/decel, gravity, jump, with the feel aids below.
2. **Solid + one-way collision** — ground, walls, and "jump-through" platforms.
3. **Level geometry** — a tilemap or hand-placed colliders; the playable space.
4. **Hazards + death/respawn** — spikes, pits, enemies; reset to the last checkpoint.
5. **Checkpoints / level goal** — progress markers and a win condition (flag, door, exit).
6. **Camera** — follows the player with a deadzone and look-ahead, clamped to level bounds.
7. **Juice** — landing dust, squash/stretch, hit-stop, sound. Cheap, huge feel payoff.

## Design knobs (make the jump feel right)

Tune these by **outcome** (height in tiles, time to apex in seconds), not by raw numbers.

| Knob | Effect | Sane starting point |
|------|--------|---------------------|
| Max jump height | reach | 3–4 tiles |
| Time to apex | "weight"/snappiness | 0.30–0.40 s |
| Fall gravity multiplier | snappy, non-floaty fall | 1.5–2.0× rise gravity |
| Coyote time | jump just after leaving a ledge | 0.08–0.12 s (~5–7 frames @60) |
| Jump buffer | press just before landing still jumps | 0.10–0.15 s |
| Variable jump cut | tap = short hop, hold = full | cut upward velocity ×0.4–0.5 on release |
| Apex hang | brief float at the top for air control | reduce gravity ×0.5 near `|vy|`<threshold |
| Ground accel / friction | responsiveness vs. ice | reach top speed in 0.05–0.1 s |
| Corner correction | nudge past a ledge clipped by 1–2 px | nudge up to ~4 px sideways |

Derive gravity and jump velocity from the *feel* values rather than guessing — see Pattern 1.

## Patterns

### 1. Solve jump physics from height + time (not magic numbers)

```ts
// jump-physics.ts — pick the FEEL you want, then derive the physics. y-axis points DOWN (Phaser's default).
// From kinematics: h = (g * t^2) / 2  and  v0 = g * t.
const TILE = 16;
const JUMP_HEIGHT = 3.5 * TILE; // how high, in pixels
const TIME_TO_APEX = 0.35; // seconds to reach the top

export const gravity = (2 * JUMP_HEIGHT) / TIME_TO_APEX ** 2; // rising gravity, px/s²
export const jumpVelocity = -(2 * JUMP_HEIGHT) / TIME_TO_APEX; // negative = upward
export const fallGravity = gravity * 1.8; // heavier on the way down → less floaty
```

### 2. Coyote time + jump buffer + variable height (the feel core)

```ts
import Phaser from 'phaser';
import { fallGravity, gravity, jumpVelocity } from './jump-physics'; // Pattern 1

// Arcade world gravity is 0 in the game config; this scene applies its own per-body gravity.
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
const MAX_FALL_SPEED = 900;

export class PlayScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private coyoteTimer = 0;
  private bufferTimer = 0;

  create(): void {
    this.player = this.physics.add.sprite(64, 64, 'player');
    this.player.body.setMaxVelocityY(MAX_FALL_SPEED);
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000; // seconds since last frame
    const body = this.player.body;

    // Timers count DOWN; refresh coyote while grounded, buffer on a fresh press.
    if (body.onFloor()) this.coyoteTimer = COYOTE_TIME;
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) this.bufferTimer = JUMP_BUFFER;
    this.coyoteTimer -= dt;
    this.bufferTimer -= dt;

    // A jump is allowed if we pressed recently AND were grounded recently.
    if (this.bufferTimer > 0 && this.coyoteTimer > 0) {
      body.setVelocityY(jumpVelocity);
      this.bufferTimer = 0;
      this.coyoteTimer = 0; // consume both so we can't double-jump
    }

    // Variable height: releasing jump early while still rising cuts the arc short.
    if (Phaser.Input.Keyboard.JustUp(this.jumpKey) && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * 0.45);
    }

    // Asymmetric gravity: snappier fall than rise; setMaxVelocityY clamps terminal speed.
    body.setGravityY(body.velocity.y > 0 ? fallGravity : gravity);
  }
}
```

### 3. One-way platforms

Solid from above, pass-through from below. Use the engine's flag rather than collision math:
Phaser Arcade `platform.body.checkCollision.down = false` (plus `left`/`right` for thin
ledges); for tilemap layers, set the tiles' collision faces so only the top collides. Let the
player **drop through** by ignoring that platform for ~0.1–0.2 s when they hold
Down + Jump (refs §5).

## Pitfalls / failure modes

- **Per-frame movement not scaled by `dt`** → speed changes with frame rate. Every velocity
  integration and timer must use `dt`. (See `physics-tuning`.)
- **Jump height differs between machines** → the jump runs on a variable render `dt`. Simple
  per-step integration lands a few percent short of the designed height, by a different amount
  at each frame rate. Keep Arcade's fixed physics step (`arcade.fixedStep`, on by default, at
  `arcade.fps`) so the body integrates the same everywhere, or use the half-step update in refs §1.
- **Player is flung off or doubles speed leaving a moving platform** → platform velocity added
  twice. Arcade already carries a rider through `body.friction` on an immovable moving body;
  don't add the platform's motion again in script (refs §6).
- **Floaty jumps** → symmetric gravity. Make fall gravity heavier than rise gravity.
- **"The jump didn't register"** → no input buffering. Buffer presses for ~0.1 s before landing.
- **"I fell off and couldn't jump"** → no coyote time. Allow a jump for ~0.1 s after leaving ground.
- **Sticking to walls / catching on tile seams** → use a single box collider, not
  per-tile colliders, and add corner correction.
- **Tunneling through floors at high speed** → clamp max velocity / smaller fixed
  timestep for fast bodies (see `physics-tuning`).
- **Camera snaps and induces nausea** → smooth/lerp the follow, add a deadzone, clamp to bounds.
- **Difficulty wall from bad teaching** → introduce one mechanic per area before combining them.

## Composition (build it from these skills)

- **Controller body:** `phaser-arcade-physics` (an Arcade sprite with a dynamic body) and the
  vendored Phaser `physics-arcade` reference.
- **Levels:** the vendored Phaser `tilemaps` skill for geometry; `level-design` for layout,
  pacing, and teaching order.
- **Feel/physics:** `physics-tuning` for timestep, CCD, and stability.
- **Input:** `input-systems` for buffering, rebinding, and gamepad support.
- **Polish:** `audio-design` for SFX/music; `game-feel` and Phaser tweens for squash/stretch.
- **Process:** `prototype-fast` to greybox the controller before building content.

## References

- For jump math derivation, a full feel-tuning table, corner correction, moving/one-way
  platforms, and camera follow, read `references/feel-tuning.md`.
