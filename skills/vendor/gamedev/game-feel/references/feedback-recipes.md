---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/game-feel/references/feedback-recipes.md
modified: true
---

# Feedback recipes — depth for `game-feel`

Detail the `game-feel` body defers here: the shake math, easing cheat sheet, the rest of the
feedback menu (knockback, flash, number pop, freeze), importance-tier presets, and the
Phaser bindings for tweens and particles. All snippets target **Phaser 4.2** in TypeScript.

## 1. The trauma model (why shake feels good)

Track a single `trauma` value in `[0, 1]`. Events **add** trauma; it **decays** linearly each
frame. The actual shake amount is `trauma^2` (or `trauma^3`) so:

- small/frequent events barely nudge the screen (low trauma, squared → tiny),
- big events punch hard (high trauma, squared → near full),
- shake **always ends** on its own because trauma decays to 0.

Offset and rotation are `max * shake * noise(t)`. Sample a noise function or summed sines
across time — never a fresh `Math.random()` per frame, which produces a harsh buzz instead of a shake.

```ts
// 1D value-noise-ish sampler without a library: layered sines at incommensurate rates.
export function shakeAxis(seed: number, t: number): number {
  return 0.6 * Math.sin(t * 11 + seed) + 0.4 * Math.sin(t * 23 + seed * 2);
}
```

Tunable starting points: `maxOffset = (8..16, 6..10) px`, `maxRoll = 0.05..0.12 rad`,
`decay = 1.0..1.5` trauma/sec, per-hit trauma `0.15` (light) → `0.8` (heavy).

## 2. Easing cheat sheet — which curve for which job

| Goal | Ease | Phaser `ease` | Notes |
|------|------|---------------|-------|
| UI/element "pop" in | overshoot | `'Back.easeOut'` | shoots past target, settles back |
| Bouncy, lively land | bounce/elastic | `'Elastic.easeOut'`/`'Bounce.easeOut'` | use sparingly; reads as cartoonish |
| Settle / decelerate | ease-out | `'Cubic.easeOut'`/`'Quad.easeOut'` | the default for "comes to rest" |
| Anticipation / wind-up | ease-in | `'Cubic.easeIn'` | slow start before a fast action |
| Smooth A→B both ends | ease-in-out | `'Sine.easeInOut'` | camera moves, menu slides |

In three.js there is no built-in tween; ease by hand in the render loop with the same curves
(`THREE.MathUtils.damp` for spring-like follow). Keep the *curve choice* the same regardless of tool.

```ts
import * as THREE from 'three';

// An eased scale "pop" driven from the render loop (no external deps).
export function easeOutBack(k: number): number {
  // 0 -> 1, peaks ~10% past 1
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const m = k - 1;
  return 1 + c3 * m * m * m + c1 * m * m;
}

export function popStep(obj: THREE.Object3D, elapsed: number, dur = 0.18): void {
  const squash = new THREE.Vector3(1.3, 0.7, 1); // squash on the event
  const k = Math.min(elapsed / dur, 1);
  // Unclamped lerp, so the overshoot past (1, 1, 1) survives.
  obj.scale.copy(squash).lerp(new THREE.Vector3(1, 1, 1), easeOutBack(k));
}
```

## 3. The rest of the feedback menu

- **Flash:** tint the sprite/material white for 1–3 frames on hit (Phaser `sprite.setTintFill(0xffffff)` then `clearTint()`),
  then tween back. Cheap, hugely legible.
- **Knockback:** apply an impulse away from the hit normal, clamped and short; let
  `physics-tuning` own stability. Pair with brief control lockout, not a long one.
- **Number/text pop:** spawn a damage number that rises, fades, and eases out; randomize the
  horizontal drift so stacked hits fan out.
- **Particles:** a short burst at the contact point (sparks, dust, debris). Reuse one
  emitter and call `explode(count, x, y)` — do not create and destroy an emitter per hit.
- **Freeze frame:** the hit-stop in the body; scale duration to importance (0.04 s light →
  0.15 s heavy). Optionally freeze only the attacker+target, not the whole world.
- **Anticipation & follow-through:** a tiny wind-up before a big action and a settle after read
  as weight; this is animation, not code (the vendored Phaser `animations` skill).
- **Chromatic/vignette/zoom punch:** post-process nudges for big moments; keep brief.

## 4. Importance tiers (keep the whole game proportional)

Define three presets and assign every juicy event to one. This is what stops a game from
feeling either dead (under-juiced) or exhausting (everything maxed).

| Tier | Trauma | Hit-stop | Particles | Extra | Example events |
|------|:------:|:--------:|:---------:|-------|----------------|
| small | 0.10–0.20 | none | 0–4 | tick SFX | footstep, UI hover, coin |
| medium | 0.30–0.50 | 0.04–0.06 s | 6–12 | flash | normal hit, jump-land, pickup |
| large | 0.70–1.00 | 0.10–0.15 s | 20–40 | flash + zoom + number | crit, boss hit, death, explosion |

## 5. Accessibility (ship these toggles)

- **Reduce screen shake** (scale trauma output by a 0–100% setting, default ~60–80%).
- **Reduce/disable flashing** (photosensitivity) — replace white flashes with a static tint.
  Even with flashing on, keep any large-area flash at or under three flashes in any one-second
  window ([WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
  general flash threshold; [Xbox Accessibility Guideline 118](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/118),
  Photosensitivity).
- **Reduce camera motion** — cut shake roll and zoom punches.

These pair with `game-ui-ux` (settings menu) and `input-systems` (accessibility section).

## 6. Binding summary

- **Phaser 4.2:** `this.tweens.add({ targets, …, ease: 'Back.easeOut' })`; one emitter +
  `explode()`; `this.physics.pause()` / `this.anims.pauseAll()` for hit-stop; shake via
  `cam.shake()` or a trauma-driven `setFollowOffset`/`setRotation`; flash via `cam.flash()`.
- **three.js r186:** eases in the `renderer.setAnimationLoop` callback; shake as an additive
  offset on the camera position (see `camera-systems`).
