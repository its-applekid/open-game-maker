---
topic: eight-direction-facing
aliases: [facing, direction, sheet-row]
engine: phaser
set: smallscaleint
tokens: ~540
tunables:
  - { name: switchHysteresis, range: [0.08, 0.24], unit: ratio, from: "stable vs reactive facing" }
  - { name: idleHoldMs, range: [80, 240], unit: ms, from: "brief movement gaps" }
license: MIT
source: engine-layering-2026-11-01.md section 4.1
---

# Eight-direction facing

Use this when a sheet declares eight ordered facings. Convert velocity to a compass sector, but keep the previous
sector near a boundary until the direction clears a small hysteresis margin. When velocity reaches zero, retain the
last moving facing for a brief hold rather than selecting a default row. Read the actual row order from adapter
conventions; the calculation returns a semantic direction, never a hard-coded sheet index.

## Pattern

```ts
export const tunableRanges = { switchHysteresis: [0.08, 0.24], idleHoldMs: [80, 240] } as const;
export const tunables = {
  switchHysteresis: /* pick from the brief range */ 0,
  idleHoldMs: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
const directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const;
type Facing = (typeof directions)[number];

export class EightDirectionFacing {
  facing: Facing = 'south';
  #idleMs = 0;
  constructor(readonly hysteresis: number, readonly idleHoldMs: number) {}
  setVelocity(x: number, y: number): void {
    const speed = Math.hypot(x, y);
    if (speed === 0) return;
    this.#idleMs = 0;
    const turn = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
    const candidate = directions[Math.round(turn / (Math.PI / 4)) % directions.length]!;
    const current = directions.indexOf(this.facing) * Math.PI / 4;
    const delta = Math.abs(Math.atan2(Math.sin(turn - current), Math.cos(turn - current)));
    if (candidate === this.facing || delta > Math.PI / 8 + this.hysteresis) this.facing = candidate;
  }
  step(deltaMs: number): void { this.#idleMs = Math.min(this.idleHoldMs, this.#idleMs + deltaMs); }
}
```

## When to use / when not

Use only with a card whose sheet declares eight facings and an adapter row-order table. Do not guess rows from file
order. Four-facing sheets use their own pattern, and a scope that locks aim independently from movement needs two
facing states in game code.

## No obvious extras

This card adds no input mapping, movement speed, aiming, attack selection, animation timing, or role assignment.

## Test

```ts
const facing = new EightDirectionFacing(fromRange(tunableRanges.switchHysteresis, 0.5), fromRange(tunableRanges.idleHoldMs, 0.5));
facing.setVelocity(1, 0); advanceTime(facing, 17);
expect(facing.facing).toBe('east');
```
