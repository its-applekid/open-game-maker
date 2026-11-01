---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/camera-systems/SKILL.md
modified: true
name: camera-systems
description: >
  Build game cameras that feel good — 2D follow with a deadzone, look-ahead, smoothing, and
  level-bounds clamping; 3D third-person orbit with collision and first-person look; plus
  multi-target framing and a shake hook. Engine-neutral techniques that pair with the engine's
  camera: Phaser 4 cameras in 2D, a three.js r186 PerspectiveCamera in 3D. Use when the user
  mentions camera follow, follow camera, deadzone, look-ahead, camera smoothing, camera bounds/
  limits, third-person camera, orbit camera, first-person look, or camera jitter.
---

# Camera systems

The camera is the player's window; bad camera work makes a good game feel awful. This skill
covers the engine-neutral camera techniques — smooth follow, deadzones, look-ahead, bounds
clamping, third-person orbit with collision, first-person look, and multi-target framing — and
maps them onto Phaser's 2D cameras and three.js cameras.

## When to use

- Use when a 2D camera should follow the player smoothly, stay inside the level, lead the
  player's motion, or ignore small movements (deadzone).
- Use when building a 3D third-person orbit camera (mouse/stick look, collision push-in) or a
  first-person look controller, or framing multiple targets at once.
- Use to fix camera jitter, snapping, motion sickness, or a camera that shows past the level edge.

**When *not* to use:** for the *magnitude and trigger* of screen shake and impact juice, use
`game-feel` (this skill exposes the shake offset hook it drives). For the engine's concrete
camera node/component setup, use the vendored Phaser `cameras` skill or `threejs-fundamentals`. For player movement itself use
`phaser-arcade-physics`. For
performance of many cameras/render targets, see `performance-optimization`.

## Core workflow

1. **Decide what the camera serves.** Platformer (lead the jump, see hazards), top-down (center
   with deadzone), third-person (orbit + collision), first-person (look only). The genre sets the
   rules.
2. **Follow smoothly and frame-rate independently.** Move the camera toward the target with
   exponential smoothing or a critically-damped spring, not a fixed `lerp(a, b, 0.1)` — that 0.1 is
   per-frame and changes with frame rate.
3. **Add a deadzone** so tiny target movements don't nudge the camera; it only follows once the
   target leaves a box/zone. Stops nausea in twitchy games.
4. **Lead the action with look-ahead** by offsetting the camera target in the direction of
   motion or facing, eased in/out so it doesn't whip.
5. **Clamp to level bounds** so the camera never shows outside the playable area; combine with
   smoothing so it eases to a stop at the edge.
6. **For 3D, separate look from collision.** Orbit via yaw/pitch on a rig; use a spring arm /
   ray to pull the camera in when geometry blocks it; clamp pitch.
7. **Update the camera after the target moves.** Follow in the late/post step (after movement and
   physics resolve) to avoid a one-frame lag jitter.
8. **Verify by moving the target at low and high frame rates**, into corners and walls, and at
   the level edges; confirm no jitter, no peeking past bounds, smooth stops. Report what you saw.

## Patterns

### 1. Phaser 2D built-in follow: smoothing + bounds (don't hand-roll first)

```ts
import Phaser from 'phaser';

// Phaser 4.2 Camera. Engine-provided lerp + hard bounds + deadzone.
export function setupFollow(scene: Phaser.Scene, player: Phaser.GameObjects.Sprite, levelW: number, levelH: number): void {
  const cam = scene.cameras.main;
  cam.startFollow(player, true, 0.1, 0.1); // roundPixels, lerpX, lerpY (higher = snappier)
  cam.setBounds(0, 0, levelW, levelH); // clamp the VIEW to the level rect (pixels)
  cam.setDeadzone(96, 64); // built-in deadzone box, in pixels
}
```

Phaser's follow lerp is applied per frame, so it is frame-rate dependent; for a feel that must
match at 30 and 144 FPS, hand-roll the follow (Pattern 2).

### 2. Frame-rate-independent smooth follow (when you hand-roll it)

```ts
import Phaser from 'phaser';

// RIGHT: exponential smoothing — same feel at any FPS. `rate` ~ 5..12.
export function follow(cam: Phaser.Cameras.Scene2D.Camera, target: Phaser.Math.Vector2, rate: number, dt: number): void {
  const t = 1 - Math.exp(-rate * dt); // converges correctly regardless of dt
  const cx = cam.scrollX + cam.width / 2;
  const cy = cam.scrollY + cam.height / 2;
  cam.centerOn(Phaser.Math.Linear(cx, target.x, t), Phaser.Math.Linear(cy, target.y, t));
}
// WRONG: Phaser.Math.Linear(cx, target.x, 0.1) every frame
//        → faster smoothing at higher FPS; different feel on every machine.
```

### 3. Deadzone + look-ahead (lead the player, ignore jitter)

```ts
import Phaser from 'phaser';

// Camera only chases once the target leaves the deadzone box, then aims AHEAD of motion.
export class FocusRig {
  private focus = new Phaser.Math.Vector2();

  constructor(
    private deadzone = new Phaser.Math.Vector2(48, 32), // half extents
    private lookAheadDist = 80,
  ) {}

  target(pos: Phaser.Math.Vector2, velocity: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const dx = pos.x - this.focus.x;
    const dy = pos.y - this.focus.y;
    // Only move the focus by the overflow beyond the deadzone (per axis).
    this.focus.x += Math.max(Math.abs(dx) - this.deadzone.x, 0) * Math.sign(dx);
    this.focus.y += Math.max(Math.abs(dy) - this.deadzone.y, 0) * Math.sign(dy);
    const lead = velocity.clone().normalize().scale(this.lookAheadDist); // aim ahead of travel
    return this.focus.clone().add(lead);
  }
}
```

### 4. 3D third-person orbit with collision push-in

```ts
import * as THREE from 'three';

// Yaw/pitch a pivot; a raycast pulls the camera in when geometry blocks it.
export class OrbitRig {
  readonly pivot = new THREE.Object3D();
  private yaw = 0;
  private pitch = 0;
  private ray = new THREE.Raycaster();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private armLength = 5,
    private sensitivity = 0.0025,
  ) {
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === null) return; // captured mouse only
      // movementX/Y are raw device deltas, independent of canvas size.
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * this.sensitivity,
        THREE.MathUtils.degToRad(-80),
        THREE.MathUtils.degToRad(45),
      ); // clamp pitch!
    });
  }

  update(colliders: THREE.Object3D[]): void {
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.pivot.updateMatrixWorld();
    const origin = this.pivot.getWorldPosition(new THREE.Vector3());
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.pivot.quaternion);
    this.ray.set(origin, back);
    this.ray.far = this.armLength;
    const hit = this.ray.intersectObjects(colliders, true)[0];
    const len = hit ? hit.distance - 0.2 : this.armLength; // RIGHT: push in. WRONG: clip through walls.
    this.camera.position.copy(origin).addScaledVector(back, len);
    this.camera.lookAt(origin);
  }
}
```

### 5. Screen shake hook (owned trigger lives in `game-feel`)

```ts
import Phaser from 'phaser';

// Expose an additive offset the game-feel trauma model writes to; follow + shake compose.
export const shakeOffset = new Phaser.Math.Vector2(); // set each frame by game-feel (trauma^2 * noise)

export function applyCamera(cam: Phaser.Cameras.Scene2D.Camera, finalFocus: Phaser.Math.Vector2): void {
  cam.centerOn(finalFocus.x + shakeOffset.x, finalFocus.y + shakeOffset.y); // shake rides ON TOP of smooth follow
}
// For a quick one-off impact, Phaser's built-in cam.shake(durationMs, intensity) is enough.
```

## Pitfalls

- **`lerp(pos, target, const)` per frame** is frame-rate dependent — floatier at 30 FPS, snappier
  at 144. Use `1 - exp(-rate*dt)` or a critically-damped spring.
- **Following in the normal update before the target has moved** yields a one-frame lag jitter.
  Follow in the scene's `postupdate` event / after movement and physics resolve.
- **No bounds clamp** lets the camera show black past the level edge. Clamp focus to the level
  rect (account for the viewport half-size so the *view*, not the center, stays inside).
- **No deadzone in twitchy games** makes the camera twitch with every micro-movement → nausea.
- **Unclamped pitch** in third/first-person flips the camera over the top. Clamp pitch (about
  -80° to +45° for an orbit, ±80° for first-person).
- **Mouse-look sensitivity that changes with window size**: deltas computed from pointer
  positions in game units scale with the canvas; read `movementX/Y` under pointer lock.
- **Camera clipping through walls** in 3D — use a spring arm / occlusion ray to pull in.
- **Snapping on teleport/respawn** is jarring; either hard-cut intentionally (and reset
  smoothing) or fast-ease. Don't let a huge smoothing distance whip across the level.
- **Shake driving the follow target** instead of an additive offset makes follow fight shake.
  Compose: smooth follow first, add shake offset last.
- **Per-axis vs radial deadzone confusion** — a box deadzone feels different from a circular one;
  pick deliberately.

## References

- For the exponential-smoothing/spring derivation, a complete deadzone+look-ahead+bounds 2D rig,
  3D spring-arm/orbit details, first-person look, multi-target/group framing and split-screen,
  cinematic camera blends, and the Phaser / three.js mapping, read
  `references/follow-and-framing.md`.

## Related skills

- `game-feel` — owns screen-shake trauma/triggers; this skill exposes the offset it writes.
- `phaser-arcade-physics`, `threejs-scene-setup` — the player/world the camera frames; camera setup.
- `physics-tuning` — interpolate camera follow with the physics step to kill jitter.
- `platformer` — a genre whose camera rules this skill implements.
