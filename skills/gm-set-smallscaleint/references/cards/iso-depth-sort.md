---
topic: iso-depth-sort
aliases: [isometric-depth, overlap, footprint]
engine: phaser
set: smallscaleint
tokens: ~520
tunables:
  - { name: footprintOffsetPx, range: [8, 48], unit: px, from: "card footprint and visible base" }
  - { name: layerStride, range: [100, 1000], unit: depth, from: "map layer separation" }
license: MIT
source: engine-layering-2026-11-01.md section 4.1
---

# Isometric footprint depth

Use this when tall isometric pieces overlap while moving through a Tiled map. Sort by the bottom of the card's
footprint rather than the texture edge or object origin. Add a stable layer stride so floor, actor, prop, and roof
groups keep their map order even when two bases share the same projected row. The asset card supplies footprint and
pivot facts; the game supplies the layer role and position.

## Pattern

```ts
export const tunableRanges = { footprintOffsetPx: [8, 48], layerStride: [100, 1000] } as const;
export const tunables = {
  footprintOffsetPx: /* pick from the brief range */ 0,
  layerStride: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Sortable = { id: string; y: number; footprintOffsetPx: number; layer: number; depth: number };

export class IsoDepthSort {
  constructor(readonly items: Sortable[], readonly stride: number) {}
  step(): void {
    const ordered = [...this.items].sort((a, b) => {
      const base = a.y + a.footprintOffsetPx - (b.y + b.footprintOffsetPx);
      return a.layer - b.layer || base || a.id.localeCompare(b.id);
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index]!;
      item.depth = item.layer * this.stride + index;
    }
  }
}
```

## When to use / when not

Use for pieces whose visible shape extends above a ground contact footprint. Keep fixed floor tiles in their tile
layer and sort only sprites that can overlap. Do not use the texture height as an offset, and do not use this ordering
to decide collision or interaction priority.

## No obvious extras

This card adds no movement, camera behavior, interaction, combat, inventory, spawning, or map content.

## Test

```ts
const items = [{ id: 'a', y: 20, footprintOffsetPx: 16, layer: 1, depth: 0 }, { id: 'b', y: 40, footprintOffsetPx: 16, layer: 1, depth: 0 }];
const sorter = new IsoDepthSort(items, fromRange(tunableRanges.layerStride, 0.5)); advanceTime(sorter, 17);
expect(items[1]!.depth).toBeGreaterThan(items[0]!.depth);
```
