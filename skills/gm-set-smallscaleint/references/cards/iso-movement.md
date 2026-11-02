---
topic: iso-movement
aliases: [isometric-movement, diamond-grid, projected-motion]
engine: phaser
set: smallscaleint
tokens: ~520
tunables:
  - { name: speedPxPerSecond, range: [72, 180], unit: px/s, from: "deliberate vs brisk traversal" }
  - { name: accelerationPxPerSecond2, range: [360, 1200], unit: px/s2, from: "soft vs immediate response" }
license: MIT
source: engine-layering-2026-11-01.md section 4.1
---

# Isometric movement projection

Use this when the scope asks for free movement over a two-to-one isometric projection. Normalize input before
projecting it so diagonals do not move faster. Transform logical map axes into screen axes, approach the requested
velocity with a tunable acceleration, and leave wall resolution to the adapter binding. The game chooses which input
actions provide the logical vector and whether facing follows movement.

## Pattern

```ts
export const tunableRanges = { speedPxPerSecond: [72, 180], accelerationPxPerSecond2: [360, 1200] } as const;
export const tunables = {
  speedPxPerSecond: /* pick from the brief range */ 0,
  accelerationPxPerSecond2: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);

export class IsoMovement {
  readonly state = { x: 0, y: 0, vx: 0, vy: 0 };
  #input = { x: 0, y: 0 };
  constructor(readonly speed: number, readonly acceleration: number) {}
  input(x: number, y: number): void {
    const length = Math.max(1, Math.hypot(x, y));
    this.#input = { x: x / length, y: y / length };
  }
  step(deltaMs: number): void {
    const targetX = (this.#input.x - this.#input.y) * this.speed;
    const targetY = (this.#input.x + this.#input.y) * this.speed * 0.5;
    const amount = this.acceleration * deltaMs / 1000;
    this.state.vx = approach(this.state.vx, targetX, amount);
    this.state.vy = approach(this.state.vy, targetY, amount);
    this.state.x += this.state.vx * deltaMs / 1000;
    this.state.y += this.state.vy * deltaMs / 1000;
  }
}
```

## When to use / when not

Use for continuous movement in an isometric view. Grid-step movement, path following, and turn-based motion need
different feature code. Do not couple the transform to a particular sheet row or input device.

## No obvious extras

This card adds no input bindings, collision, facing, camera, stamina, pathfinding, combat, or destination logic.

## Test

```ts
const motion = new IsoMovement(fromRange(tunableRanges.speedPxPerSecond, 0.5), fromRange(tunableRanges.accelerationPxPerSecond2, 0.5));
motion.input(1, 0); advanceTime(motion, 100);
expect(motion.state.x).toBeGreaterThan(motion.state.y);
```
