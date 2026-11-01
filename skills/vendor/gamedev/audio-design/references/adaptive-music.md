---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/audio-design/references/adaptive-music.md
modified: true
---

# Adaptive (dynamic) music

Adaptive music changes with gameplay instead of looping one track. Two techniques
dominate, and they combine:

- **Vertical layering (re-orchestration)** — several stems (drums, bass, melody,
  tension pad) play in sync; you fade layers in/out to change intensity without
  changing the underlying loop. Seamless because all layers share the same
  timeline.
- **Horizontal re-sequencing** — the track is split into segments (intro, loop A,
  loop B, combat, outro); you switch which segment plays next, transitioning at
  musical boundaries (bar/phrase) so the change lands on beat.

## Vertical layering

All layers are the same length and start together; only their volumes change.

```ts
import Phaser from 'phaser';

// Keep N stem sounds in sync (same start), and fade volumes by intensity.
export class LayeredMusic {
  private layers: Record<'base' | 'drums' | 'tension', Phaser.Sound.WebAudioSound>;

  constructor(
    private scene: Phaser.Scene,
    sound: Phaser.Sound.WebAudioSoundManager,
  ) {
    const add = (key: string) => sound.add(key, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
    this.layers = { base: add('music-base'), drums: add('music-drums'), tension: add('music-tension') };
  }

  start(): void {
    for (const s of Object.values(this.layers)) s.play(); // all begin together -> stay aligned
    this.layers.base.setVolume(1);
  }

  setIntensity(level: number): void {
    // 0 calm .. 2 combat
    this.fade(this.layers.drums, level >= 1 ? 1 : 0);
    this.fade(this.layers.tension, level >= 2 ? 1 : 0);
  }

  private fade(s: Phaser.Sound.WebAudioSound, volume: number, ms = 800): void {
    this.scene.tweens.add({ targets: s, volume, duration: ms });
  }
}
```

Tips: author stems at the same BPM/length and bounce them aligned. Fades of
~0.5–1.5 s feel musical; instant cuts feel mechanical. Because layers never
restart, intensity can change any time without losing sync.

Separate `play()` calls in the same frame start within a few milliseconds of each other. When
the stems must stay sample-aligned, decode them and start every `AudioBufferSourceNode` with the
same `start(when)` time on the audio clock.

## Horizontal re-sequencing

Switch segments at safe musical points so transitions don't sound abrupt.

```ts
// Request a section change; apply it only at the next bar boundary.
const BPM = 120;
const BEATS_PER_BAR = 4;
const SEC_PER_BAR = (60 / BPM) * BEATS_PER_BAR;

export class SectionSwitcher {
  private pending: string | null = null;
  private lastBar = -1;

  constructor(
    private songTime: () => number, // see the beat-sync pattern in SKILL.md
    private crossfadeTo: (section: string, seconds: number) => void,
  ) {}

  request(section: string): void {
    this.pending = section; // don't switch mid-bar; queue it
  }

  update(): void {
    // call from the scene's update()
    const bar = Math.floor(this.songTime() / SEC_PER_BAR);
    if (bar === this.lastBar) return;
    this.lastBar = bar;
    if (this.pending) {
      this.crossfadeTo(this.pending, 0.2); // short crossfade across the seam
      this.pending = null;
    }
  }
}
```

`update()` only sees the boundary on the first frame after it, so this switch lands up to one
frame late. To land exactly on the bar, compute the next boundary's audio-clock time and
schedule the next segment's `AudioBufferSourceNode.start(when)` and the old one's `stop(when)`
there.

Transition strategies, roughly increasing in polish:

- **Immediate crossfade** — quick volume blend; fine for low-stakes changes.
- **Quantized switch** — wait for the next beat/bar/phrase, then switch. The
  default for music that should stay "in time".
- **Transition segments** — short bridge clips written to connect A→B musically.
- **Stingers** — one-shot musical accents layered over the bed for events (boss
  appears, secret found) without altering the loop.

## Mapping gameplay to intensity

Drive the music from a small, smoothed intensity value rather than raw events:

```ts
// Combine signals into 0..1, smooth it, then map to layers/sections with hysteresis.
let intensity = 0;

export function intensityFromState(enemiesNear: number, playerHp01: number, dt: number): number {
  const raw = Math.min(Math.max(enemiesNear / 5, 0), 1) * (1 - 0.4 * playerHp01);
  // Frame-rate-independent smoothing; a fixed lerp(…, 0.05) per frame would settle
  // twice as fast at 120 FPS as at 60.
  intensity += (raw - intensity) * (1 - Math.exp(-3 * dt));
  return intensity;
}

// Hysteresis: require crossing different thresholds up vs down so the music
// doesn't oscillate when intensity hovers at a boundary.
export function levelFromIntensity(i: number, current: number): number {
  if (current < 1 && i > 0.6) return 1;
  if (current >= 1 && i < 0.4) return 0;
  return current;
}
```

## Practical notes

- **Drive timing from the audio clock**, not frame delta, and account for output
  latency when scheduling.
- **Loop points** must be sample-accurate; gaps or clicks betray the seam. Author
  loops to bar boundaries and test the wrap.
- **Middleware** (FMOD, Wwise) implements layering, quantized transitions, and
  parameter-driven intensity natively — reach for it when the music system grows
  beyond a handful of stems/segments.
- **Budget**: many simultaneous stems cost voices and memory. Stream long music;
  keep stem counts modest on low-end targets.
