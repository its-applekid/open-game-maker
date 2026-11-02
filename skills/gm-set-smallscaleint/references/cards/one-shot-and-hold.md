---
topic: one-shot-and-hold
aliases: [terminal-pose, sequence-hold, one-shot]
engine: both
set: smallscaleint
tokens: ~470
tunables:
  - { name: holdMs, range: [80, 400], unit: ms, from: "brief readability after completion" }
  - { name: fallbackFps, range: [6, 14], unit: fps, from: "card timing unavailable" }
license: MIT
source: engine-layering-2026-11-01.md section 4.1
---

# One shot and terminal hold

Use this when adapter vocabulary marks a sequence as non-looping and its final frame or pose must remain visible.
Advance frames once, clamp at the final index, hold for a brief readable interval, then report completion to the
game. The game decides what completion means. Prefer card timing; use the fallback range only when measured timing
is absent and record the choice as a tunable rather than a pack fact.

## Pattern

```ts
export const tunableRanges = { holdMs: [80, 400], fallbackFps: [6, 14] } as const;
export const tunables = { holdMs: /* pick from the brief range */ 0, fallbackFps: /* pick from the brief range */ 0 };
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));

export class OneShotAndHold {
  frame = 0;
  completed = false;
  #elapsed = 0;
  #holdElapsed = 0;
  constructor(readonly frameCount: number, readonly fps: number, readonly holdMs: number) {}
  step(deltaMs: number): void {
    if (this.completed) return;
    if (this.frame < this.frameCount - 1) {
      this.#elapsed += deltaMs;
      const frameMs = 1000 / this.fps;
      while (this.#elapsed >= frameMs && this.frame < this.frameCount - 1) {
        this.#elapsed -= frameMs;
        this.frame += 1;
      }
      return;
    }
    this.#holdElapsed += deltaMs;
    this.completed = this.#holdElapsed >= this.holdMs;
  }
}
```

## When to use / when not

Use for sequences whose adapter vocabulary identifies a terminal pose. Do not invent one for a looping sequence,
restart it automatically, or attach game effects here. An interruption rule belongs to the feature using the binding.

## No obvious extras

This card adds no damage, state transition, input lock, sound, particles, scoring, or follow-up sequence.

## Test

```ts
const sequence = new OneShotAndHold(3, fromRange(tunableRanges.fallbackFps, 0.5), fromRange(tunableRanges.holdMs, 0.5));
advanceTime(sequence, 1000);
expect(sequence).toMatchObject({ frame: 2, completed: true });
```
