# ZzFX preset starting points

These original presets target the SDK's ZzFX 1.4-compatible parameter order. ZzFX is MIT-licensed; keep the game’s
chosen arrays beside its cue ids and tune them against the full mix.

```json
{
  "confirm": [0.35, 0.01, 880, 0.005, 0.03, 0.05, 0, 1.2],
  "pickup": [0.5, 0.03, 660, 0.01, 0.06, 0.12, 1, 1.4, 90, 0, 420, 0.04],
  "jump": [0.35, 0.02, 260, 0.01, 0.05, 0.08, 1, 1.2, 160],
  "impact": [0.55, 0.05, 110, 0.005, 0.02, 0.12, 3, 1.4, -70, 0, 0, 0, 0, 0.35],
  "explosion": [0.7, 0.08, 75, 0.01, 0.12, 0.4, 4, 1.6, -25, 0, 0, 0, 0, 0.8],
  "powerUp": [0.45, 0.02, 440, 0.01, 0.15, 0.25, 0, 1, 120, 0, 240, 0.08, 0.12]
}
```

Parameter positions follow ZzFX: volume, randomness, frequency, attack, sustain, release, shape, shape curve, slide,
delta slide, pitch jump, pitch-jump time, repeat time, noise, modulation, bit crush, delay, sustain volume, decay,
tremolo, filter. Omitted trailing values use SDK defaults.
