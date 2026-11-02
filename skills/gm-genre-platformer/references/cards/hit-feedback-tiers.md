---
topic: hit-feedback-tiers
aliases: [feedback, hit-stop, trauma, shake]
engine: both
tokens: ~520
tunables:
  - { name: maxHitStopMs, range: [80, 150], unit: ms, from: "restrained vs forceful impact" }
  - { name: maxTrauma, range: [0.70, 1.00], unit: ratio, from: "subtle vs forceful motion" }
  - { name: maxFlashMs, range: [32, 80], unit: ms, from: "soft vs crisp response" }
  - { name: traumaDecayPerSecond, range: [1.0, 1.6], unit: ratio/s, from: "lingering vs quick settle" }
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/game-feel (tier and trauma ideas)
---

# Hit-feedback tiers

Use this when the scope calls for proportional impact feedback. Assign each already-scoped event to light, medium, or
heavy, then derive hit stop, camera trauma, and sprite flash from one intensity. Square trauma for camera displacement;
decay the stored value linearly so motion always reaches rest.

## Pattern

```ts
export const tunableRanges = {
  maxHitStopMs: [80, 150], maxTrauma: [0.7, 1], maxFlashMs: [32, 80], traumaDecayPerSecond: [1, 1.6],
} as const;
export const tunables = {
  maxHitStopMs: /* pick from the brief range */ 0, maxTrauma: /* pick from the brief range */ 0,
  maxFlashMs: /* pick from the brief range */ 0, traumaDecayPerSecond: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
export const chooseFeedbackFeel = (intensity: number) => ({
  maxHitStopMs: fromRange(tunableRanges.maxHitStopMs, intensity),
  maxTrauma: fromRange(tunableRanges.maxTrauma, intensity),
  maxFlashMs: fromRange(tunableRanges.maxFlashMs, intensity),
  traumaDecayPerSecond: fromRange(tunableRanges.traumaDecayPerSecond, intensity),
});
const tierScale = { light: 0.2, medium: 0.55, heavy: 1 } as const;

export class HitFeedback {
  readonly state = { trauma: 0, hitStopMs: 0, flashMs: 0 };
  constructor(private readonly feel: ReturnType<typeof chooseFeedbackFeel>) {}
  trigger(tier: keyof typeof tierScale): void {
    const scale = tierScale[tier];
    this.state.trauma = Math.max(this.state.trauma, this.feel.maxTrauma * scale);
    this.state.hitStopMs = this.feel.maxHitStopMs * scale;
    this.state.flashMs = this.feel.maxFlashMs * scale;
  }
  step(deltaMs: number): void {
    this.state.trauma = Math.max(0, this.state.trauma - this.feel.traumaDecayPerSecond * deltaMs / 1000);
    this.state.hitStopMs = Math.max(0, this.state.hitStopMs - deltaMs);
    this.state.flashMs = Math.max(0, this.state.flashMs - deltaMs);
  }
}
```

## When to use / when not

Use only for impacts already named in the scope. Do not use when reduced-motion or reduced-flash preferences disable
the corresponding channel, and do not make routine contact feel equal to a major event.

## No obvious extras

This card adds no damage, health, particles, sound, score, new Hazard, or Pickup behavior.

## Test

```ts
const effects = new HitFeedback(chooseFeedbackFeel(0.5)); effects.trigger('heavy');
advanceTime(effects, 1000);
expect(effects.state.trauma).toBe(0);
```
