import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canonicalClip, clipLoops, conventions } from '../src/conventions.js';
import { roleOf, vocabulary } from '../src/vocabulary.js';

interface ClipCard {
  id: string;
  anim: { target_rig_id: string; clips: { name: string; canonical: string; loop: boolean }[] };
}

/**
 * The KayKit clip-library cards (asset-qa/kaykit.md GLB card pass: 36 libraries, 374 clips), trimmed to their clips,
 * so the tables are checked against every clip the packs ship rather than a hand-typed list.
 *
 * Regenerate (byte-identical) from the repo root after a catalog rebuild:
 *   jq '{source: "anim cards of the KayKit packs in the asset catalog (index/cards.index.json, kind anim), trimmed to id, rig and clips",
 *     cards: [.cards[] | select(.kind == "anim" and (.id | startswith("t1:kaykit-")))
 *       | {id, anim: {target_rig_id: .anim.target_rig_id, clips: [.anim.clips[] | {name, canonical, loop}]}}]}' \
 *     assets-local/index/cards.index.json > packages/pack-adapters/kaykit/test/fixtures/clip-cards.json
 */
const { cards } = JSON.parse(readFileSync(new URL('./fixtures/clip-cards.json', import.meta.url), 'utf8')) as {
  cards: ClipCard[];
};
const CATALOG_CLIPS = cards.flatMap((card) => card.anim.clips);
const LIBRARY_CLIPS = new Set(CATALOG_CLIPS.map((clip) => clip.name));

/** Catalog clips with neither a canonical word nor a role, each group with why it stays unmapped. */
const UNMAPPED: Record<string, readonly string[]> = {
  'bind pose every library ships, not an action': ['T-Pose'],
  'tool and work loops; the game names what they do': [
    'Chop',
    'Chopping',
    'Dig',
    'Digging',
    'Hammer',
    'Hammering',
    'Lockpick',
    'Lockpicking',
    'Pickaxe',
    'Pickaxing',
    'Saw',
    'Sawing',
    'Work_A',
    'Work_B',
    'Work_C',
    'Working_A',
    'Working_B',
    'Working_C',
  ],
  'fishing beats with no shared role': [
    'Fishing_Bite',
    'Fishing_Catch',
    'Fishing_Reeling',
    'Fishing_Struggling',
    'Fishing_Tug',
  ],
  'dodge directions besides forward; the roles have one dodge': [
    'Dodge_Backward',
    'Dodge_Backwards',
    'Dodge_Left',
    'Dodge_Right',
  ],
  'spawn and skeleton story beats a game triggers by name': [
    'Spawn_Air',
    'Spawn_Ground',
    'Skeletons_Awaken_Floor',
    'Skeletons_Awaken_Floor_Long',
    'Skeletons_Awaken_Standing',
    'Skeletons_Inactive_Floor_Pose',
    'Skeletons_Inactive_Standing_Pose',
    'Skeletons_Spawn_Ground',
    'Skeletons_Taunt_Longer',
  ],
  'marked experimental by KayKit': ['EXPERIMENTAL_Large_Transform', 'EXPERIMENTAL_Medium_Transform'],
  'emotes and exercises CLIP_WORDS has no word for (it matches wave, not Waving)': ['Flexing', 'Push_Ups', 'Waving'],
  'ground moves with no word: lying and crawling': ['Crawling', 'Lie_Down', 'Lie_StandUp'],
  'a throw; CLIP_WORDS has no throw word': ['Throw'],
};

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

  it('maps every catalog clip to a canonical word or a role, or names why not', () => {
    const allowed = new Set(Object.values(UNMAPPED).flat());
    const unmapped = [...LIBRARY_CLIPS].filter((clip) => canonicalClip(clip) === 'other' && roleOf(clip) === undefined);
    expect(unmapped.filter((clip) => !allowed.has(clip))).toEqual([]);
    expect([...allowed].filter((clip) => !unmapped.includes(clip))).toEqual([]);
  });

  it('maps a clip name back to its role', () => {
    expect(roleOf('Melee_1H_Stab')).toBe('attack.melee.3');
    expect(roleOf('Jump_Start')).toBeUndefined();
  });
});

describe('ported clip table', () => {
  it('reads the 36 libraries and 374 clips the card pass counted', () => {
    expect([cards.length, CATALOG_CLIPS.length]).toEqual([36, 374]);
  });

  it('classes every catalog clip the way its card does', () => {
    const differs = CATALOG_CLIPS.filter(
      (clip) => canonicalClip(clip.name) !== clip.canonical || clipLoops(clip.name) !== clip.loop,
    );
    expect(differs).toEqual([]);
  });

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
