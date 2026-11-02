---
topic: clip-retarget
aliases: [retarget, shared-rig, animation-clip]
engine: three
set: kaykit
tokens: ~540
tunables:
  - { name: crossFadeSeconds, range: [0.12, 0.36], unit: s, from: "crisp vs smooth transitions" }
  - { name: playbackRate, range: [0.75, 1.25], unit: ratio, from: "measured clip and game pacing" }
license: MIT
source: engine-layering-2026-11-01.md section 4.2
---

# Shared-rig clip retarget

Use this when an asset card and adapter convention confirm that a mesh and clip library share a rig id. Match tracks
by verified joint name, clone the clip before changing playback, and report any missing track instead of silently
binding by array position. Cross-fade belongs to the binding; which canonical action plays and when belongs to the
game. Cache the validated mapping by source and target rig ids, not by asset file name.

## Pattern

```ts
export const tunableRanges = { crossFadeSeconds: [0.12, 0.36], playbackRate: [0.75, 1.25] } as const;
export const tunables = {
  crossFadeSeconds: /* pick from the brief range */ 0,
  playbackRate: /* pick from the brief range */ 0,
};
export const fromRange = (range: readonly [number, number], amount: number) =>
  range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, amount));
type Track = { joint: string; values: readonly number[] };
type Clip = { rigId: string; name: string; tracks: readonly Track[]; duration: number };

export class ClipRetarget {
  readonly output: Clip;
  elapsed = 0;
  constructor(source: Clip, targetRigId: string, targetJoints: readonly string[], readonly playbackRate: number) {
    if (source.rigId !== targetRigId) throw new Error(`rig mismatch: ${source.rigId} != ${targetRigId}`);
    const joints = new Set(targetJoints);
    const missing = source.tracks.filter((track) => !joints.has(track.joint)).map((track) => track.joint);
    if (missing.length > 0) throw new Error(`missing joints: ${missing.join(', ')}`);
    this.output = { ...source, rigId: targetRigId,
      tracks: source.tracks.map((track) => ({ ...track, values: [...track.values] })) };
  }
  step(deltaMs: number): void {
    this.elapsed = Math.min(this.output.duration, this.elapsed + deltaMs / 1000 * this.playbackRate);
  }
}
```

## When to use / when not

Use only after exact rig-id verification. A similar hierarchy, compatible silhouette, or matching joint count is not
enough. Do not use this pattern to scale bones, infer missing tracks, choose actions, or decide loop behavior.

## No obvious extras

This card adds no state machine, movement, combat, root motion, sound, camera, role assignment, or clip vocabulary.

## Test

```ts
const clip = new ClipRetarget({ rigId: 'shared', name: 'walk', duration: 1, tracks: [{ joint: 'root', values: [0, 1] }] }, 'shared', ['root'], fromRange(tunableRanges.playbackRate, 0.5));
advanceTime(clip, 250);
expect(clip.elapsed).toBeGreaterThan(0);
```
