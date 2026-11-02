---
topic: deadzone-camera
aliases: [camera, follow, deadzone]
engine: phaser
tokens: ~500
tunables:
  - { name: deadzoneWidth, range: [96, 192], unit: px, from: "steady vs reactive framing" }
  - { name: deadzoneHeight, range: [64, 128], unit: px, from: "stable jumps vs close tracking" }
  - { name: followLerp, range: [0.08, 0.20], unit: ratio, from: "soft vs immediate follow" }
license: MIT
source: phaserjs/phaser@f84916099a9fac952679fc71a978fea2e60eafcb skills/cameras (deadzone and lerp ideas)
---

# Deadzone camera

Use this when the Player should move inside a stable view before the camera follows. The target can wander inside a
centered rectangle without moving the view; crossing an edge eases the view only far enough to contain the target.
Clamp the resulting position to level bounds in the engine adapter.

## Pattern

```ts
export const tunableRanges = {
  deadzoneWidth: [96, 192], deadzoneHeight: [64, 128], followLerp: [0.08, 0.2],
} as const;
export const tunables = {
  deadzoneWidth: /* pick from the brief range */ 0,
  deadzoneHeight: /* pick from the brief range */ 0,
  followLerp: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
export const chooseCameraFeel = (steadiness: number) => ({
  deadzoneWidth: fromRange(tunableRanges.deadzoneWidth, steadiness),
  deadzoneHeight: fromRange(tunableRanges.deadzoneHeight, steadiness),
  followLerp: fromRange(tunableRanges.followLerp, 1 - steadiness),
});

export class DeadzoneCamera {
  readonly state = { x: 0, y: 0 };
  readonly #target = { x: 0, y: 0 };
  constructor(private readonly feel: ReturnType<typeof chooseCameraFeel>) {}
  moveTarget(x: number, y: number): void { this.#target.x = x; this.#target.y = y; }
  step(): void {
    const axes = [['x', this.feel.deadzoneWidth], ['y', this.feel.deadzoneHeight]] as const;
    for (const [axis, size] of axes) {
      const delta = this.#target[axis] - this.state[axis];
      if (Math.abs(delta) <= size / 2) continue;
      const edge = this.#target[axis] - Math.sign(delta) * size / 2;
      this.state[axis] += (edge - this.state[axis]) * this.feel.followLerp;
    }
  }
}
```

## When to use / when not

Use for a side view where frequent small Player motion should not shake the composition. Do not use when the scope
asks for a fixed room view or when exact target centering is part of the mechanic.

## No obvious extras

This card adds no look-ahead, zoom punch, room transition, minimap, Hazard, or Pickup.

## Test

```ts
const view = new DeadzoneCamera(chooseCameraFeel(0.7));
view.moveTarget(1, 1); advanceTime(view, 17);
expect(view.state).toEqual({ x: 0, y: 0 });
```
