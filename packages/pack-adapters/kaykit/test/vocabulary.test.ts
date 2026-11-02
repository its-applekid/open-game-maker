import { describe, expect, it } from 'vitest';

import { canonicalClip, clipLoops, conventions } from '../src/conventions.js';
import { roleOf, vocabulary } from '../src/vocabulary.js';

/** Clip names of the KayKit libraries (asset-qa/kaykit.md, GLB card pass), so a typo in the vocabulary fails here. */
const LIBRARY_CLIPS = new Set(
  [
    'Melee_1H_Slash Melee_1H_Stab Melee_2H_Attack Melee_Block Melee_Blocking Dodge_Forward Death_A Hit_A Idle_A',
    'Idle_B Running_A Walking_A Melee_1H_Attack_Chop Melee_1H_Attack_Slice_Diagonal Melee_1H_Attack_Stab',
    'Ranged_Magic_Shoot Ranged_Magic_Spellcasting Death_B Hit_B Crouching Running_Strafe_Left Running_Strafe_Right',
    'Sneaking Running_B Walking_B Walking_C Skeletons_Taunt Jump_Start Interact T-Pose',
  ]
    .join(' ')
    .split(' '),
);

/** The SmallScaleInt adapter's role keys (#183): both sets answer the same roles. */
const SHARED_ROLES = [
  'idle',
  'walk',
  'run',
  'attack.melee.1',
  'attack.melee.2',
  'attack.melee.3',
  'attack.run',
  'cast',
  'hit',
  'die',
  'block.start',
  'block.hold',
  'dodge',
  'crouch.idle',
  'crouch.run',
  'strafe.left',
  'strafe.right',
  'special.1',
  'special.2',
  'turn',
  'sheathe',
  'taunt',
];

describe('vocabulary', () => {
  it('answers the same roles as the other set adapters', () => {
    expect(Object.keys(vocabulary)).toEqual(SHARED_ROLES);
  });

  it('names only clips the libraries ship', () => {
    const named = Object.values(vocabulary).flat();
    expect(named.filter((clip) => !LIBRARY_CLIPS.has(clip))).toEqual([]);
  });

  it('maps a clip name back to its role', () => {
    expect(roleOf('Melee_1H_Stab')).toBe('attack.melee.3');
    expect(roleOf('Jump_Start')).toBeUndefined();
  });
});

describe('ported clip table', () => {
  it('classes clips the way the card pipeline did', () => {
    expect(
      [
        'Idle_A',
        'Walking_C',
        'Running_Strafe_Left',
        'Sit_Chair_Idle',
        'Hit_A',
        'Death_A_Pose',
        'Melee_1H_Attack_Chop',
        'Ranged_Bow_Draw',
        'T-Pose',
      ].map((clip) => [canonicalClip(clip), clipLoops(clip)]),
    ).toEqual([
      ['idle', true],
      ['walk', true],
      ['run', true],
      ['sit', true],
      ['hit', false],
      ['die', false],
      ['attack-melee', false],
      ['attack-ranged', false],
      ['other', false],
    ]);
  });
});

describe('clip table parity', () => {
  it('matches CLIP_WORDS and LOOP_CLIPS in the card pipeline it was ported from', async () => {
    const { readFileSync } = await import('node:fs');
    const python = readFileSync(new URL('../../../../scripts/assets/preprocess_kaykit.py', import.meta.url), 'utf8');
    const words = python.match(/^CLIP_WORDS = \(\n([\s\S]*?)\n\)/m)![1]!;
    const rows = [...words.matchAll(/\("([^"]+)", \(([^)]*)\)\)/g)].map(([, canonical, list]) => [
      canonical,
      [...list!.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
    ]);
    const loops = [...python.match(/^LOOP_CLIPS = \{([^}]*)\}/m)![1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

    expect(rows).toEqual(conventions.clipWords.value.map(([canonical, list]) => [canonical, [...list]]));
    expect(loops.sort()).toEqual([...conventions.loopClips.value].sort());
  });
});
