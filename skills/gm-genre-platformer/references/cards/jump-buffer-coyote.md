---
topic: jump-buffer-coyote
aliases: [jump, coyote, buffer]
engine: phaser
tokens: ~650
tunables:
  - { name: jumpBufferMs, range: [100, 150], unit: ms, from: "snappy vs forgiving input" }
  - { name: coyoteMs, range: [80, 120], unit: ms, from: "strict vs forgiving ledges" }
  - { name: apexSeconds, range: [0.30, 0.40], unit: s, from: "weighty vs floaty arc" }
  - { name: jumpHeightPx, range: [48, 112], unit: px, from: "scope geometry" }
  - { name: fallGravityMultiplier, range: [1.5, 2.0], unit: ratio, from: "floaty vs weighty fall" }
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/genres/platformer (ideas and ranges)
---

# Jump buffer and coyote window

Use this when the scope asks for a responsive jump whose forgiveness follows the brief. The controller remembers a
press before landing and keeps a short grace window after the Player leaves a surface. Derive gravity and launch speed
from height and time to apex; do not guess independent physics constants.

## Pattern

```ts
import type { ActionFrame } from '@ogm/contracts';

export const tunableRanges = {
  jumpBufferMs: [100, 150], coyoteMs: [80, 120], apexSeconds: [0.3, 0.4],
  jumpHeightPx: [48, 112], fallGravityMultiplier: [1.5, 2],
} as const;
export const tunables = {
  jumpBufferMs: /* pick from the brief range */ 0, coyoteMs: /* pick from the brief range */ 0,
  apexSeconds: /* pick from the brief range */ 0, jumpHeightPx: /* pick from the brief range */ 0,
  fallGravityMultiplier: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
export const chooseJumpFeel = (weight: number, forgiveness: number) => ({
  jumpBufferMs: fromRange(tunableRanges.jumpBufferMs, forgiveness),
  coyoteMs: fromRange(tunableRanges.coyoteMs, forgiveness),
  apexSeconds: fromRange(tunableRanges.apexSeconds, 1 - weight),
  jumpHeightPx: fromRange(tunableRanges.jumpHeightPx, 0.5),
  fallGravityMultiplier: fromRange(tunableRanges.fallGravityMultiplier, weight),
});

export class JumpController {
  readonly body = { vy: 0 };
  #coyote = 0; #buffer = 0; #grounded = false; #jumpPressed = false;
  constructor(private readonly feel: ReturnType<typeof chooseJumpFeel>) {}
  input(frame: ActionFrame, grounded: boolean): void {
    this.#grounded = grounded; this.#jumpPressed = frame.actions.jump === true;
  }
  step(deltaMs: number): void {
    this.#coyote = this.#grounded ? this.feel.coyoteMs : Math.max(0, this.#coyote - deltaMs);
    this.#buffer = this.#jumpPressed ? this.feel.jumpBufferMs : Math.max(0, this.#buffer - deltaMs);
    if (this.#buffer > 0 && this.#coyote > 0) {
      this.body.vy = -(2 * this.feel.jumpHeightPx) / this.feel.apexSeconds;
      this.#buffer = 0; this.#coyote = 0; this.#grounded = false;
    }
    const riseGravity = (2 * this.feel.jumpHeightPx) / this.feel.apexSeconds ** 2;
    this.body.vy += riseGravity * (this.body.vy > 0 ? this.feel.fallGravityMultiplier : 1) * deltaMs / 1000;
    this.#jumpPressed = false;
  }
}
```

## When to use / when not

Use for real-time platforming where a missed edge press should still feel fair. Do not use for turn-based movement,
automatic jumping, or a scope that explicitly asks for exact frame-perfect timing.

## No obvious extras

This card adds no double jump, wall jump, dash, score, lives, Hazard, or Pickup. Those require scope approval.

## Test

```ts
const player = new JumpController(chooseJumpFeel(0.35, 0.65));
player.input({ playerIndex: 0, tick: 0, source: 'keyboard', actions: { jump: true } }, true); advanceTime(player, 17);
expect(player.body.vy).toBeLessThan(0);
```
