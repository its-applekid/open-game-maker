---
topic: wander-flee
aliases: [ambient-motion, steering, flee]
engine: both
set: smallscaleint
tokens: ~540
tunables:
  - { name: wanderRadiusPx, range: [48, 160], unit: px, from: "tight vs broad roaming" }
  - { name: fleeRadiusPx, range: [72, 220], unit: px, from: "late vs early response" }
  - { name: rethinkMs, range: [400, 1400], unit: ms, from: "restless vs calm steering" }
license: MIT
source: engine-layering-2026-11-01.md section 4.1
---

# Wander and flee steering

Use this only when the scope names ambient wandering or fleeing. Keep the home point and threat position in game
state; this card supplies a bounded steering vector. Wander picks a deterministic target inside a radius at fixed
intervals. Flee overrides that target while a threat is inside its radius, then returns to wandering without adding
memory, needs, or a behavior tree. Inject the sample sequence so replay and tests remain deterministic.

## Pattern

```ts
export const tunableRanges = { wanderRadiusPx: [48, 160], fleeRadiusPx: [72, 220], rethinkMs: [400, 1400] } as const;
export const tunables = {
  wanderRadiusPx: /* pick from the brief range */ 0,
  fleeRadiusPx: /* pick from the brief range */ 0,
  rethinkMs: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Point = { x: number; y: number };

export class WanderFlee {
  readonly direction = { x: 0, y: 0 };
  threat: Point | null = null;
  #elapsed = Infinity;
  #sample = 0;
  constructor(readonly position: Point, readonly home: Point, readonly wanderRadius: number,
    readonly fleeRadius: number, readonly rethinkMs: number, readonly samples: readonly number[]) {}
  step(deltaMs: number): void {
    this.#elapsed += deltaMs;
    const threatDx = this.threat ? this.position.x - this.threat.x : 0;
    const threatDy = this.threat ? this.position.y - this.threat.y : 0;
    const threatDistance = Math.hypot(threatDx, threatDy);
    if (this.threat && threatDistance > 0 && threatDistance < this.fleeRadius) {
      this.direction.x = threatDx / threatDistance; this.direction.y = threatDy / threatDistance; return;
    }
    if (this.#elapsed < this.rethinkMs) return;
    this.#elapsed = 0;
    const angle = (this.samples[this.#sample++ % this.samples.length] ?? 0) * Math.PI * 2;
    const target = { x: this.home.x + Math.cos(angle) * this.wanderRadius,
      y: this.home.y + Math.sin(angle) * this.wanderRadius };
    const length = Math.max(1, Math.hypot(target.x - this.position.x, target.y - this.position.y));
    this.direction.x = (target.x - this.position.x) / length;
    this.direction.y = (target.y - this.position.y) / length;
  }
}
```

## When to use / when not

Use only for the named behavior and tune ranges against the game scale. Do not infer a threat role, spawn actors,
choose speed, or attach rewards. Navigation around walls stays with the map and feature layer.

## No obvious extras

This card adds no health, combat, awareness memory, flocking, schedule, dialogue, spawning, or pathfinding.

## Test

```ts
const steering = new WanderFlee({ x: 10, y: 0 }, { x: 0, y: 0 }, 80, 100, 500, [0.25]); steering.threat = { x: 0, y: 0 };
advanceTime(steering, 17);
expect(steering.direction.x).toBeGreaterThan(0);
```
