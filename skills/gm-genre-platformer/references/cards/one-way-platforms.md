---
topic: one-way-platforms
aliases: [one-way, platform, drop-through]
engine: phaser
tokens: ~560
tunables:
  - { name: reentryMs, range: [100, 200], unit: ms, from: "quick vs deliberate drop-through" }
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/genres/platformer (one-way behavior)
---

# One-way platforms

Use this for a surface that catches a falling Player from above, allows upward travel from below, and temporarily
ignores contact after a deliberate down-plus-jump input. Compare the previous bottom edge with the surface top so a
fast fall cannot re-enter from the wrong side. In Phaser, keep the same rule in the Arcade collision process callback.

## Pattern

```ts
import type { ActionFrame } from '@ogm/contracts';

export const tunableRanges = { reentryMs: [100, 200] } as const;
export const tunables = { reentryMs: /* pick from the brief range */ 0 };
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Body = { y: number; vy: number; height: number; grounded: boolean };

export class OneWayResolver {
  #previousBottom: number; #ignoreMs = 0; #dropPressed = false;
  constructor(readonly body: Body, readonly platformY: number, readonly reentryMs: number) {
    this.#previousBottom = body.y + body.height;
  }
  input(frame: ActionFrame): void {
    this.#dropPressed = frame.actions.down === true && frame.actions.jump === true;
  }
  step(deltaMs: number): void {
    if (this.#dropPressed) {
      this.#ignoreMs = this.reentryMs; this.body.grounded = false;
      this.body.y += 2; this.body.vy = Math.max(this.body.vy, 60);
    }
    const previousBottom = this.#previousBottom;
    this.body.y += this.body.vy * deltaMs / 1000;
    const bottom = this.body.y + this.body.height;
    this.#ignoreMs = Math.max(0, this.#ignoreMs - deltaMs);
    if (this.#ignoreMs === 0 && this.body.vy >= 0 && previousBottom <= this.platformY && bottom >= this.platformY) {
      this.body.y = this.platformY - this.body.height; this.body.vy = 0; this.body.grounded = true;
    }
    this.#previousBottom = this.body.y + this.body.height; this.#dropPressed = false;
  }
}
```

## When to use / when not

Use only when the scope calls for jump-through or drop-through surfaces. Do not use for solid ground, walls, moving
surfaces, or a high-speed body that needs continuous collision detection.

## No obvious extras

This card adds no moving platform, crumble timer, spring, score, Hazard, or Pickup.

## Test

```ts
const player = new OneWayResolver({ y: 80, vy: 300, height: 16, grounded: false }, 100, fromRange(tunableRanges.reentryMs, 0.5));
player.input({ playerIndex: 0, tick: 0, source: 'keyboard', actions: {} }); advanceTime(player, 34);
expect(player.body).toMatchObject({ y: 84, vy: 0, grounded: true });
```
