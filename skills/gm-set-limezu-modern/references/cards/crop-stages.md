---
topic: crop-stages
aliases: [stage-display, growth-sheet, staged-sprite]
engine: phaser
set: limezu-modern
tokens: ~500
tunables:
  - { name: transitionHoldMs, range: [80, 300], unit: ms, from: "subtle vs readable stage change" }
  - { name: pulseScale, range: [1.01, 1.08], unit: ratio, from: "restrained vs visible feedback" }
license: MIT
source: engine-layering-2026-11-01.md section 4.3
---

# Staged crop display

Use this when an asset card identifies ordered stage frames or regions. Map a game-owned stage index to the verified
frame, clamp it to available stages, and briefly hold a presentation pulse when the index changes. The adapter owns
sheet geometry and frame order. The game owns every rule that advances or reverses the stage, including timing,
resources, interaction, and completion.

## Pattern

```ts
export const tunableRanges = { transitionHoldMs: [80, 300], pulseScale: [1.01, 1.08] } as const;
export const tunables = {
  transitionHoldMs: /* pick from the brief range */ 0,
  pulseScale: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));

export class CropStages {
  frame = 0;
  scale = 1;
  #requested = 0;
  #holdMs = 0;
  constructor(readonly frames: readonly number[], readonly transitionHoldMs: number, readonly pulseScale: number) {}
  show(stage: number): void { this.#requested = Math.max(0, Math.min(this.frames.length - 1, Math.floor(stage))); }
  step(deltaMs: number): void {
    const next = this.frames[this.#requested] ?? this.frames[0] ?? 0;
    if (next !== this.frame) { this.frame = next; this.#holdMs = this.transitionHoldMs; }
    this.#holdMs = Math.max(0, this.#holdMs - deltaMs);
    this.scale = this.#holdMs > 0 ? this.pulseScale : 1;
  }
}
```

## When to use / when not

Use when a card declares an ordered stage sequence. Do not infer stages from file names, add a growth clock, or
decide what a finished stage produces. A sheet with unrelated variants needs explicit variant selection instead.

## No obvious extras

This card adds no growth duration, watering, inventory, economy, interaction action, sound, particles, or rewards.

## Test

```ts
const display = new CropStages([3, 7, 11], fromRange(tunableRanges.transitionHoldMs, 0.5), fromRange(tunableRanges.pulseScale, 0.5));
display.show(2); advanceTime(display, 17);
expect(display).toMatchObject({ frame: 11 });
```
