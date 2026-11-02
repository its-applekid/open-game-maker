---
topic: four-direction-sheet
aliases: [topdown-facing, sheet-direction, cardinal-facing]
engine: phaser
set: limezu-modern
tokens: ~500
tunables:
  - { name: axisBias, range: [0.05, 0.25], unit: ratio, from: "stable vs reactive direction changes" }
  - { name: idleHoldMs, range: [80, 260], unit: ms, from: "brief movement gaps" }
license: MIT
source: engine-layering-2026-11-01.md section 4.3
---

# Four-direction sheet facing

Use this when a sprite card declares four directions in a set-specific row order. Select the dominant velocity axis,
but keep the previous facing while the two axes are nearly equal so small input noise does not flip rows. Preserve
the last moving facing at rest. The adapter maps the semantic direction to its verified row; this pattern never
assumes that the first row points in a particular direction.

## Pattern

```ts
export const tunableRanges = { axisBias: [0.05, 0.25], idleHoldMs: [80, 260] } as const;
export const tunables = { axisBias: /* pick from the brief range */ 0, idleHoldMs: /* pick from the brief range */ 0 };
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Direction = 'north' | 'east' | 'south' | 'west';

export class FourDirectionFacing {
  facing: Direction = 'south';
  #velocity = { x: 0, y: 0 };
  #idleMs = 0;
  constructor(readonly axisBias: number, readonly idleHoldMs: number) {}
  setVelocity(x: number, y: number): void { this.#velocity = { x, y }; }
  step(deltaMs: number): void {
    const { x, y } = this.#velocity;
    if (x === 0 && y === 0) { this.#idleMs = Math.min(this.idleHoldMs, this.#idleMs + deltaMs); return; }
    this.#idleMs = 0;
    const largest = Math.max(Math.abs(x), Math.abs(y), 1);
    if (Math.abs(Math.abs(x) - Math.abs(y)) / largest < this.axisBias) return;
    this.facing = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'east' : 'west') : (y > 0 ? 'south' : 'north');
  }
}
```

## When to use / when not

Use only with a declared four-direction sheet. Do not guess direction from row position or reset facing when idle.
Eight-direction motion and independent aim need their own feature state rather than an expanded switch here.

## No obvious extras

This card adds no input mapping, movement speed, animation rate, aiming, interaction, combat, or role assignment.

## Test

```ts
const facing = new FourDirectionFacing(fromRange(tunableRanges.axisBias, 0.5), fromRange(tunableRanges.idleHoldMs, 0.5));
facing.setVelocity(-1, 0); advanceTime(facing, 17);
expect(facing.facing).toBe('west');
```
