---
topic: kit-snap
aliases: [modular-kit, grid-snap, placement]
engine: three
set: kaykit
tokens: ~510
tunables:
  - { name: rotationStepDegrees, range: [15, 90], unit: degrees, from: "freeform vs orthogonal kit" }
  - { name: surfaceToleranceM, range: [0.01, 0.08], unit: m, from: "tight vs forgiving placement" }
license: MIT
source: engine-layering-2026-11-01.md section 4.2
---

# Modular kit snapping

Use this when a kit card declares `grid_m` and a piece is placed into a modular layout. Snap translation in kit-local
space, quantize yaw by a chosen step, then transform back to world space. Check connector height within a small
tolerance before accepting the result. The card supplies grid size and bounds; the game or editor supplies which
piece is selected and whether the placement is allowed.

## Pattern

```ts
export const tunableRanges = { rotationStepDegrees: [15, 90], surfaceToleranceM: [0.01, 0.08] } as const;
export const tunables = {
  rotationStepDegrees: /* pick from the brief range */ 0,
  surfaceToleranceM: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Placement = { x: number; y: number; z: number; yawDegrees: number; valid: boolean };

export class KitSnap {
  readonly placement: Placement = { x: 0, y: 0, z: 0, yawDegrees: 0, valid: false };
  #request: Placement = { ...this.placement };
  constructor(readonly gridM: number, readonly rotationStep: number, readonly toleranceM: number) {}
  request(x: number, y: number, z: number, yawDegrees: number): void {
    this.#request = { x, y, z, yawDegrees, valid: false };
  }
  step(): void {
    const snap = (value: number) => Math.round(value / this.gridM) * this.gridM;
    this.placement.x = snap(this.#request.x);
    this.placement.z = snap(this.#request.z);
    this.placement.y = snap(this.#request.y);
    this.placement.yawDegrees = Math.round(this.#request.yawDegrees / this.rotationStep) * this.rotationStep;
    this.placement.valid = Math.abs(this.#request.y - this.placement.y) <= this.toleranceM;
  }
}
```

## When to use / when not

Use for pieces from one verified modular kit. Do not force unrelated geometry onto the kit grid, infer a grid from
bounds, or accept a floating connector because its horizontal axes align. Collision and editor undo stay elsewhere.

## No obvious extras

This card adds no level layout, piece inventory, purchase rule, collision body, navigation, camera, or persistence.

## Test

```ts
const snap = new KitSnap(1, fromRange(tunableRanges.rotationStepDegrees, 0.5), fromRange(tunableRanges.surfaceToleranceM, 0.5));
snap.request(1.1, 0.01, 2.1, 44); advanceTime(snap, 17);
expect(snap.placement).toMatchObject({ x: 1, z: 2, valid: true });
```
