---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/camera-systems/references/follow-and-framing.md
modified: true
---

# Follow & framing — depth for `camera-systems`

Detail the `camera-systems` body defers here: the smoothing math, a full 2D rig, 3D orbit/first-
person specifics, multi-target framing, cinematic blends, and the per-engine rig mapping.
Snippets target **Phaser 4.2** and **three.js r186** in TypeScript.

## 1. Why `1 - exp(-rate*dt)` (frame-rate-independent smoothing)

A naive `pos = lerp(pos, target, k)` applies `k` *per frame*, so at 144 FPS it smooths far more
per second than at 30 FPS — the feel changes with hardware. Exponential smoothing fixes the rate
*per second*:

```text
t = 1 - exp(-rate * dt)      (rate ≈ 5 floaty .. 12 snappy)
pos = lerp(pos, target, t)   (identical convergence at any frame rate)
```

A critically-damped spring (three's `THREE.MathUtils.damp` for the exponential form, or a hand-rolled spring with `smoothTime`)
gives the same frame-rate independence plus velocity continuity (no overshoot). Prefer the
engine's built-in spring/smoothing before hand-rolling.

## 2. Full 2D rig: deadzone + look-ahead + bounds

Order of operations each frame, after the target moves:

1. Compute target overflow beyond the **deadzone** (box or circle) → move the focus by the
   overflow only.
2. Add **look-ahead**: `focus += dir_of_motion * lookAheadDist`, but **ease the look-ahead offset
   itself** toward its goal so a direction flip doesn't snap the view.
3. **Smooth** the camera toward the focus (section 1).
4. **Clamp** so the *visible rectangle* stays in bounds: clamp camera center to
   `[min + halfView, max - halfView]` per axis (clamp the view, not the center).

```ts
import Phaser from 'phaser';

// Clamp the VIEW, accounting for zoom and viewport size.
export function clampToLevel(
  cam: Phaser.Cameras.Scene2D.Camera,
  center: Phaser.Math.Vector2,
  level: Phaser.Geom.Rectangle,
): Phaser.Math.Vector2 {
  const halfW = cam.width / 2 / cam.zoom;
  const halfH = cam.height / 2 / cam.zoom;
  return new Phaser.Math.Vector2(
    Phaser.Math.Clamp(center.x, level.x + halfW, level.right - halfW),
    Phaser.Math.Clamp(center.y, level.y + halfH, level.bottom - halfH),
  );
}
// If the level is smaller than the view on an axis, center on that axis instead of clamping.
```

Tunables: deadzone `32–64 px`, look-ahead `40–120 px` eased over `0.2–0.4 s`, smoothing
`rate 6–10`.

## 3. 3D third-person orbit

- **Rig:** an invisible pivot at the character's shoulder/head height; yaw on the pivot, pitch on
  a child; the camera sits at `-springLength` on local Z.
- **Collision:** an occlusion ray (`THREE.Raycaster`) casts from pivot to desired
  camera position and shortens to the first hit so the camera never clips through walls.
- **Pitch clamp:** ~`[-80°, +45°]` so the camera can't flip or bury into the floor.
- **Sensitivity & invert:** expose look sensitivity and invert-Y (see `input-systems`).

## 4. First-person look

- Yaw rotates the body (so movement aligns with view); pitch rotates only the camera head.
- Clamp pitch; never let roll accumulate.
- Mouse: capture the cursor (`canvas.requestPointerLock()`) and read `MouseEvent.movementX/Y`,
  which are not scaled by the canvas size.
- Stick: apply a response curve + deadzone (see `input-systems`) and frame-rate-scaled turn rate.

## 5. Multi-target / group framing

- Compute the bounding box of all targets; place the camera at the box center.
- **2D:** set zoom (`cam.setZoom`) so the box (plus padding) fits the viewport; clamp zoom min/max.
- **3D:** dolly the camera back / adjust FOV to fit the box.
- **Split-screen:** one camera per player rendering to a viewport rectangle (Phaser
  `this.cameras.add(x, y, w, h)`; three `renderer.setScissor`/`setViewport`); budget the extra render cost.

## 6. Cinematic blends & transitions

- Blend between gameplay and cutscene cameras over a short time (ease-in-out). In Phaser, `cam.pan()` / `cam.zoomTo()`
  ease the camera, or fade out/in around a cut (`cam.fadeOut`, `cam.fadeIn`); in three.js, tween a
  rig between marker transforms.
- Reset smoothing state on hard cuts/teleports so the camera doesn't slingshot across the map.

## 7. Rig summary

| Need | Phaser 4.2 | three.js r186 |
|------|-----------|---------|
| 2D follow + smoothing + limits | `cam.startFollow` (lerp), `cam.setBounds`, `cam.setDeadzone` | — |
| 3D follow/orbit | — | pivot `Object3D` + `Raycaster` push-in + `PerspectiveCamera` (or `OrbitControls` for tools) |
| Shake | `cam.shake` or an additive offset from `game-feel` | additive offset on the camera position |
| Bounds | `cam.setBounds` / manual clamp | manual clamp |
| Group framing | bounding box + `cam.setZoom` | bounding box + dolly/FOV |
