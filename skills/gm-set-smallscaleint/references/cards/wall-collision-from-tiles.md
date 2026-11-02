---
topic: wall-collision-from-tiles
aliases: [tile-collision, wall-layer, footprint-collision]
engine: phaser
set: smallscaleint
tokens: ~500
tunables:
  - { name: insetPx, range: [2, 12], unit: px, from: "loose vs close footprint fit" }
  - { name: skinPx, range: [1, 4], unit: px, from: "stable edge separation" }
license: MIT
source: engine-layering-2026-11-01.md section 4.1
---

# Wall collision from tile categories

Use this when a Tiled map marks wall cells or edges and the moving piece has a card footprint. Build collision from
named tile categories, not from the visible height of an isometric piece. Project the footprint into map space,
shrink it by a chosen inset, and resolve the shortest separating axis. A skin keeps repeated steps from re-entering
the same boundary. Roof and decoration layers never become solid just because they overlap visually.

## Pattern

```ts
export const tunableRanges = { insetPx: [2, 12], skinPx: [1, 4] } as const;
export const tunables = { insetPx: /* pick from the brief range */ 0, skinPx: /* pick from the brief range */ 0 };
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Rect = { x: number; y: number; width: number; height: number };

export class TileWallResolver {
  readonly body: Rect;
  constructor(body: Rect, readonly walls: readonly Rect[], readonly inset: number, readonly skin: number) {
    this.body = { ...body };
  }
  move(dx: number, dy: number): void { this.body.x += dx; this.body.y += dy; }
  step(): void {
    const insetBody = { x: this.body.x + this.inset, y: this.body.y + this.inset,
      width: this.body.width - this.inset * 2, height: this.body.height - this.inset * 2 };
    for (const wall of this.walls) {
      const overlapX = Math.min(insetBody.x + insetBody.width, wall.x + wall.width) - Math.max(insetBody.x, wall.x);
      const overlapY = Math.min(insetBody.y + insetBody.height, wall.y + wall.height) - Math.max(insetBody.y, wall.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX < overlapY) this.body.x -= overlapX + this.skin;
      else this.body.y -= overlapY + this.skin;
    }
  }
}
```

## When to use / when not

Use when tile metadata names solid categories and the card supplies a footprint. Do not make every non-empty tile
solid, and do not use this discrete resolver for a body fast enough to cross a full cell in one simulation step.

## No obvious extras

This card adds no movement model, damage, doors, pathfinding, triggers, camera response, or map layout.

## Test

```ts
const actor = new TileWallResolver({ x: 0, y: 0, width: 24, height: 24 }, [{ x: 20, y: 0, width: 24, height: 24 }], 2, 1);
actor.move(8, 0); advanceTime(actor, 17);
expect(actor.body.x).toBeLessThan(8);
```
