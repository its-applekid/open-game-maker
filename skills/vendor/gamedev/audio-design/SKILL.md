---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/audio-design/SKILL.md
modified: true
name: audio-design
description: >
  Implement game audio practice — bus/mixer architecture and gain in decibels,
  ducking (sidechain), adaptive/dynamic music via layering and re-sequencing,
  SFX variation, and beat synchronization. Engine-neutral. Use when the user
  mentions audio mixing, audio buses, adaptive/dynamic music, ducking, SFX
  variation, music layers, or syncing gameplay to the beat.
---

# Audio design

Game audio is a **mixing graph plus a music system**. Route every sound through a
small set of buses so you can balance and process groups; make music *react* to
play through layering and re-sequencing rather than looping one track. This skill
teaches the portable practice; bind it to Phaser's Web Audio sound manager (`this.sound`) and
the browser's Web Audio graph for concrete APIs.

## When to use

- Use to design a bus/mixer layout, set group volumes, and apply effects (reverb,
  compression, EQ) to groups of sounds.
- Use to duck music/ambience under dialogue or impacts (sidechain).
- Use to build adaptive music that responds to combat/exploration intensity.
- Use to add SFX variation (pitch/sample randomization) and sync events to a beat.

**When *not* to use:** for the engine's concrete audio nodes/streams, use
the vendored Phaser `audio-and-sound` skill. Loading/streaming and asset import are
engine concerns. For UI sliders that drive bus volume, see the engine UI skill.

## Core workflow

1. **Lay out buses, not per-sound volume.** A typical tree: `Master ← {Music,
   SFX, Ambience, UI, Voice}`. Everything plays into a bus; the player's settings
   sliders map to bus volumes. Never set hundreds of clip volumes by hand.
2. **Work in decibels, not linear.** Perceived loudness is logarithmic. Volume
   controls and automation should operate in dB; convert only at the edges.
3. **Leave headroom and hit a loudness target.** Keep true peaks at or below -1 dBTP and
   measure integrated loudness over a representative play session with an ITU-R BS.1770 meter.
   Sony's ASWG-R001 recommendation, the usual reference, is -24 LUFS (±2) for console/PC
   played on TVs and speakers and -18 LUFS (±2) for handheld/mobile. Music-streaming targets
   such as -14 LUFS are not game targets.
4. **Duck competing sources** with a sidechain compressor (or volume automation):
   when voice/important SFX plays, the music bus dips, then recovers.
5. **Make music adaptive** via *vertical* layering (stems faded in/out) and/or
   *horizontal* re-sequencing (swap segments at musical boundaries). See the
   reference.
6. **Vary repeated SFX** with small random pitch/volume offsets and sample pools
   so footsteps and hits don't sound robotic.
7. **Verify on real output.** Run `gm run` and read the sheet, then check that the
   mix balances, ducking is audible but not pumping, and music transitions land
   on the beat — never assume from meters alone.

## Patterns

Snippets are TypeScript on Phaser 4.2's `WebAudioSoundManager`; Phaser has no mixer, so the buses
are plain Web Audio `GainNode`s in the manager's `AudioContext`.

### 1. Bus routing and slider-to-gain mapping

```ts
import Phaser from 'phaser';

export type BusName = 'music' | 'sfx' | 'ambience' | 'ui' | 'voice';

// Build Master <- {Music, SFX, ...} once; control GROUPS, not individual clips.
export function createBuses(sound: Phaser.Sound.WebAudioSoundManager): Record<BusName, GainNode> {
  const ctx = sound.context;
  const make = (): GainNode => {
    const g = ctx.createGain();
    g.connect(sound.destination); // Phaser's master mute/volume chain
    return g;
  };
  return { music: make(), sfx: make(), ambience: make(), ui: make(), voice: make() };
}

// Re-route one Phaser sound from the master into a bus.
export function route(s: Phaser.Sound.WebAudioSound, bus: GainNode): void {
  s.volumeNode.disconnect();
  s.volumeNode.connect(bus);
}

// Map a 0..1 settings slider to bus gain. Squaring the slider first spreads the
// audible change over the whole travel; a raw linear-amplitude slider puts most of
// the change in the bottom fifth.
export function setBusVolume(bus: GainNode, slider01: number): void {
  const gain = Phaser.Math.Clamp(slider01, 0, 1);
  bus.gain.value = gain * gain; // 0 is true silence; gain² ≈ 40·log10(gain) dB
}
// WRONG: treating slider01 as dB: "0.5" is +0.5 dB (no audible change) and 0 is 0 dB (full volume).
```

A Phaser sound you never re-route plays straight into the master, so no category slider
affects it: route every sound (or wrap `this.sound.add` in a helper that routes).

### 2. Ducking via sidechain (music dips under voice)

A compressor on the music bus, keyed by the voice bus, lowers the music while dialogue plays and
releases afterwards. Starting values: threshold about -30 dB on the voice signal, ratio 4:1 to
8:1, attack as fast as the effect allows (up to ~10 ms), release 300-500 ms.

```ts
// Web Audio's DynamicsCompressorNode has no sidechain input, so duck with gain automation on a
// dedicated "musicDuck" node between the Music bus and Master. Ducking then never overwrites the
// player's Music slider.
export function createDuck(ctx: AudioContext, musicBus: GainNode, master: AudioNode): GainNode {
  const duck = ctx.createGain();
  musicBus.disconnect();
  musicBus.connect(duck);
  duck.connect(master);
  return duck;
}

export function duckMusic(ctx: AudioContext, duck: GainNode, active: boolean): void {
  const now = ctx.currentTime;
  const target = active ? 10 ** (-12 / 20) : 1; // -12 dB while voice plays
  duck.gain.cancelScheduledValues(now);
  duck.gain.setValueAtTime(duck.gain.value, now);
  duck.gain.setTargetAtTime(target, now, active ? 0.01 : 0.12); // fast attack, ~400 ms release
}
// Call duckMusic(ctx, duck, true) on the voice line's 'play' event and false on its 'complete'.
```

For level-driven ducking (dip only while the voice is actually loud), read the voice bus
through an `AnalyserNode` each frame and feed its RMS into `duckMusic`.

### 3. SFX variation (kill the "machine gun" repeat)

```ts
import Phaser from 'phaser';

// Pick a take that differs from the last, and randomize pitch and volume on every play.
export class SfxPool {
  private last = -1;

  constructor(
    private sound: Phaser.Sound.BaseSoundManager,
    private keys: string[],
  ) {}

  play(): void {
    let i = Phaser.Math.Between(0, this.keys.length - 1);
    if (this.keys.length > 1 && i === this.last) i = (i + 1) % this.keys.length; // no immediate repeats
    this.last = i;
    this.sound.play(this.keys[i], {
      detune: Phaser.Math.Between(-100, 100), // up to +/-1 semitone (100 cents)
      volume: 10 ** (Phaser.Math.FloatBetween(-2, 2) / 20), // up to +/-2 dB
    });
  }
}
```

`this.sound.play` creates a sound that is removed when it completes, so one-shots don't leak;
cap overlapping steps by skipping a play while `this.sound.getAllPlaying()` already holds too many.

### 4. Beat-synced events (quantize to the music grid)

```ts
import Phaser from 'phaser';

// Schedule gameplay/visuals on musical time, not frame time, so they land on beat.
const BPM = 120;
const SECONDS_PER_BEAT = 60 / BPM;

export class BeatClock {
  private startedAt = 0;

  constructor(private ctx: AudioContext) {}

  start(music: Phaser.Sound.WebAudioSound): void {
    music.play();
    this.startedAt = this.ctx.currentTime; // the audio clock, not the frame clock
  }

  // What the player HEARS now: audio-clock time since start, minus output latency.
  songTime(): number {
    return this.ctx.currentTime - this.startedAt - (this.ctx.outputLatency || this.ctx.baseLatency);
  }

  currentBeat(): number {
    return Math.floor(this.songTime() / SECONDS_PER_BEAT);
  }

  // Quantize an action to the NEXT beat boundary instead of firing immediately.
  timeUntilNextBeat(): number {
    return SECONDS_PER_BEAT - (this.songTime() % SECONDS_PER_BEAT);
  }
}
```

For sample-accurate starts, schedule on the audio clock (`AudioBufferSourceNode.start(when)`)
rather than on a frame.

## Pitfalls

- **Treating slider values as dB.** Map `0..1` to gain (`GainNode.gain`), and convert
  dB with `10 ** (dB / 20)`. A raw linear-amplitude
  slider sounds almost unchanged over most of its travel and drops off at the
  bottom; squaring (or cubing) the slider before conversion evens it out.
- **Per-clip volume instead of buses** makes a global balance pass impossible and
  bloats save/settings. Mix on buses.
- **Sources that bypass the mix.** A Phaser sound left on the manager's master
  destination ignores the category sliders. Route everything.
- **Clipping the master.** Summed sounds exceed 0 dBFS and distort. Leave
  headroom; put a limiter on Master as a safety net, not as the mixer.
- **Pumping ducking**: too-fast release or too-high ratio makes music audibly
  breathe. Lengthen release; lower ratio.
- **Ducking that fights the volume slider.** Automating the Music bus back to 1
  overwrites the player's setting. Duck a separate node.
- **Looping a single music track** for the whole game feels flat. Use layers or
  segments that respond to state (see the reference).
- **Beat sync off frame time.** `delta` drifts; read the **audio clock**
  (`AudioContext.currentTime`) and subtract output latency.
- **Unbounded sounds**: calling `this.sound.add` per shot without `destroy()` leaks.
  Use `this.sound.play` for one-shots, destroy on `complete`, or pool them.

## References

- `references/adaptive-music.md` — vertical layering vs horizontal re-sequencing,
  transition timing (bars/quantize), stingers, intensity mapping, and crossfades.

## Related skills

- Vendored Phaser `audio-and-sound` — the Phaser sound manager, markers, and audio sprites.
- `input-systems` — trigger audio from input actions.
- `physics-tuning` — collision events that drive impact SFX.
- `platformer` — a genre whose feel leans on audio feedback.
