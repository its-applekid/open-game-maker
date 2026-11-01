import type { Animation } from '@gltf-transform/core';
import type { Clip } from '@ogm/contracts';

const CANONICAL: Array<[RegExp, NonNullable<Clip['canonical']>]> = [
  [/\b(idle|breath|stand)\b/i, 'idle'],
  [/\bwalk/i, 'walk'],
  [/\b(run|jog)\b/i, 'run'],
  [/\bsprint/i, 'sprint'],
  [/\bjump/i, 'jump'],
  [/\b(fall|airborne)\b/i, 'fall'],
  [/\bland/i, 'land'],
  [/\b(crouch|duck)\b/i, 'crouch'],
  [/\bsit/i, 'sit'],
  [/\b(shoot|fire|bow|ranged)\b/i, 'attack-ranged'],
  [/\b(attack|slash|swing|melee)\b/i, 'attack-melee'],
  [/\b(kick)\b/i, 'attack-kick'],
  [/\b(cast|spell)\b/i, 'cast'],
  [/\b(block|guard)\b/i, 'block'],
  [/\b(hit|hurt|impact)\b/i, 'hit'],
  [/\b(death|dead|die)\b/i, 'die'],
  [/\b(pickup|pick up)\b/i, 'pick-up'],
  [/\b(interact|use)\b/i, 'interact'],
  [/\b(emote|wave|cheer)\b/i, 'emote'],
  [/\b(swim)\b/i, 'swim'],
  [/\b(climb)\b/i, 'climb'],
];

function duration(animation: Animation): number {
  let maximum = 0;
  for (const sampler of animation.listSamplers()) {
    const values = sampler.getInput()?.getArray();
    if (!values) continue;
    for (const value of values) maximum = Math.max(maximum, Number(value));
  }
  return maximum;
}

export function measureClips(animations: Animation[]): Clip[] {
  return animations.map((animation) => {
    const name = animation.getName() || 'Animation';
    const canonical = CANONICAL.find(([pattern]) => pattern.test(name))?.[1];
    return {
      name,
      duration_s: duration(animation),
      ...(canonical ? { canonical, loop: ['idle', 'walk', 'run', 'sprint'].includes(canonical) } : {}),
    };
  });
}
