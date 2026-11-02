---
topic: autotile-mask
aliases: [autotile, neighbor-mask, tile-variant]
engine: phaser
set: limezu-modern
tokens: ~510
tunables:
  - { name: diagonalThreshold, range: [0.25, 0.75], unit: ratio, from: "sparse vs connected corner variants" }
license: MIT
source: engine-layering-2026-11-01.md section 4.3
---

# Autotile neighbor mask

Use this when a tileset convention maps neighboring occupancy to a variant index. Build a four-bit cardinal mask in
a fixed adapter order, then add diagonal detail only when both adjacent cardinals connect. Keep the lookup table in
adapter convention data because its indices describe the set. The game or map author chooses occupied cells; the
mask only selects how an already-chosen terrain cell is presented.

## Pattern

```ts
export const tunableRanges = { diagonalThreshold: [0.25, 0.75] } as const;
export const tunables = { diagonalThreshold: /* pick from the brief range */ 0 };
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Cell = { x: number; y: number };
const key = ({ x, y }: Cell) => `${x}:${y}`;

export class AutotileMask {
  mask = 0;
  variant = 0;
  constructor(readonly cell: Cell, readonly occupied: ReadonlySet<string>,
    readonly variants: readonly number[], readonly diagonalThreshold: number) {}
  step(): void {
    const has = (x: number, y: number) => this.occupied.has(key({ x, y }));
    const north = has(this.cell.x, this.cell.y - 1);
    const east = has(this.cell.x + 1, this.cell.y);
    const south = has(this.cell.x, this.cell.y + 1);
    const west = has(this.cell.x - 1, this.cell.y);
    this.mask = Number(north) | Number(east) << 1 | Number(south) << 2 | Number(west) << 3;
    const diagonalCount = Number(north && east && has(this.cell.x + 1, this.cell.y - 1)) +
      Number(east && south && has(this.cell.x + 1, this.cell.y + 1)) +
      Number(south && west && has(this.cell.x - 1, this.cell.y + 1)) +
      Number(west && north && has(this.cell.x - 1, this.cell.y - 1));
    const detail = diagonalCount / 4 >= this.diagonalThreshold ? 16 : 0;
    this.variant = this.variants[this.mask + detail] ?? this.variants[this.mask] ?? 0;
  }
}
```

## When to use / when not

Use with a verified variant table for the chosen set. Do not infer index order from an image, alter map occupancy,
or treat a visual connection as collision. Animated terrain and transitions between categories need separate tables.

## No obvious extras

This card adds no map generation, terrain choice, collision, movement cost, interaction, animation, or level content.

## Test

```ts
const cells = new Set(['0:0', '1:0']); const mask = new AutotileMask({ x: 0, y: 0 }, cells, Array.from({ length: 32 }, (_, index) => index), 0.5);
advanceTime(mask, 17);
expect(mask.mask).toBe(2);
```
