---
topic: contact-frame
aliases: [interaction-frame, clip-event, timed-contact]
engine: three
set: kaykit
tokens: ~500
tunables:
  - { name: eventWindowFrames, range: [1, 3], unit: frames, from: "precise vs forgiving sampling" }
  - { name: fallbackContactRatio, range: [0.35, 0.75], unit: ratio, from: "verified observation when frame data is absent" }
license: MIT
source: engine-layering-2026-11-01.md section 4.2
---

# Verified contact frame

Use this when adapter convention data names the frame at which a one-shot clip visually makes contact. Convert the
frame to normalized clip time and emit one capability event while playback crosses a small window. The binding only
reports contact; game feature code decides whether that means an interaction, effect, or nothing. If verified frame
data is absent, choose a visible ratio from the range and keep it as a game tunable, never adapter convention data.

## Pattern

```ts
export const tunableRanges = { eventWindowFrames: [1, 3], fallbackContactRatio: [0.35, 0.75] } as const;
export const tunables = {
  eventWindowFrames: /* pick from the brief range */ 0,
  fallbackContactRatio: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));

export class ContactFrame {
  contacted = false;
  elapsed = 0;
  #emitted = false;
  constructor(readonly durationMs: number, readonly frameCount: number, readonly frame: number,
    readonly windowFrames: number) {}
  restart(): void { this.elapsed = 0; this.contacted = false; this.#emitted = false; }
  step(deltaMs: number): void {
    const previous = this.elapsed;
    this.elapsed = Math.min(this.durationMs, this.elapsed + deltaMs);
    const frameMs = this.durationMs / this.frameCount;
    const start = Math.max(0, this.frame - this.windowFrames / 2) * frameMs;
    const end = Math.min(this.frameCount, this.frame + this.windowFrames / 2) * frameMs;
    this.contacted = !this.#emitted && previous <= end && this.elapsed >= start;
    if (this.contacted) this.#emitted = true;
  }
}
```

## When to use / when not

Use only with measured contact data or an explicit game tunable. Do not derive contact from clip name, assume the
middle frame, or execute gameplay inside this binding. Continuous actions need a duration interval instead.

## No obvious extras

This card adds no target selection, damage, resource change, sound, particles, input action, cooldown, or combo.

## Test

```ts
const contact = new ContactFrame(1000, 10, 5, fromRange(tunableRanges.eventWindowFrames, 0.5));
advanceTime(contact, 550);
expect(contact.contacted).toBe(true);
```
