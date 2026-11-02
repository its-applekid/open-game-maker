/** A pack fact and how it was measured. */
export interface Fact<T> {
  value: T;
  verified: string;
}

export type Body = 'Rig_Medium' | 'Rig_Large';

const rigs: Fact<{ shared: string; joints: number; unanimated: readonly string[] }> = {
  value: { shared: 'rig:89200673d97d', joints: 23, unanimated: ['rig:a83c5e75e523'] },
  verified:
    'asset-qa/kaykit.md GLB card pass (PR #220, 2026-11-02): all 36 Rig_Medium_*/Rig_Large_* libraries target ' +
    'rig:89200673d97d (23 joints); 63 of 64 characters carry it; Mannequin_Medium alone is rig:a83c5e75e523 ' +
    '(21 joints) and no library targets it',
};

const bodies: Fact<readonly Body[]> = {
  value: ['Rig_Medium', 'Rig_Large'],
  verified:
    'scene root node name of every rigged .glb (2026-11-02): 54 characters and 20 libraries under Rig_Medium, ' +
    '10 characters and 16 libraries under Rig_Large; the joint names are the same, the proportions are not, so a ' +
    'library plays only on characters of its own body',
};

const forward: Fact<{ axis: '+Z'; up: '+Y' }> = {
  value: { axis: '+Z', up: '+Y' },
  verified:
    'Knight.glb bind pose (2026-11-02): upperarm.l sits at +X 0.212 and upperarm.r at -X under a Y-up root, so ' +
    'the body faces +Z; bounds_m on the card reach further in +Z (0.77) than in -Z (0.54)',
};

const scale: Fact<{ unit: 'metre'; normalized: false }> = {
  value: { unit: 'metre', normalized: false },
  verified:
    'cards carry geometry.normalized false (no B11 pass); Knight bounds_m are 2.54 tall, dungeon floors 2 or 4 ' +
    'wide, city-builder road pieces 2 wide: sizes are read from bounds_m, never assumed',
};

const colormapPerPack: Fact<true> = {
  value: true,
  verified:
    'geometry.texture_keys over every KayKit card (2026-11-02): 13 packs use one texture (e.g. ' +
    'dungeon_texture.png); forest-nature, platformer and medieval-hexagon ship one per colour variant; ' +
    'characters and Mystery Monthly entries one per figure',
};

const grid: Fact<'meta.kit.grid_m'> = {
  value: 'meta.kit.grid_m',
  verified:
    'no KayKit card carries a kit block yet (2026-11-02), so the placer reads grid_m from the manifest entry and ' +
    'refuses a piece without one; measured for reference: dungeon floors 4 and 2 wide, walls 4 wide, city roads 2',
};

/** `CLIP_WORDS` from scripts/assets/preprocess_kaykit.py: first entry whose word appears in the name wins. */
const clipWords: Fact<readonly (readonly [string, readonly string[]])[]> = {
  value: [
    ['attack-ranged', ['shoot', 'ranged', 'bow', 'gun']],
    ['attack-kick', ['kick']],
    ['attack-melee', ['attack', 'slash', 'stab', 'punch', 'melee']],
    ['pick-up', ['pickup', 'pick-up', 'pick_up']],
    ['sprint', ['sprint']],
    ['walk', ['walk']],
    ['run', ['run', 'jog']],
    ['jump', ['jump']],
    ['fall', ['fall']],
    ['land', ['land']],
    ['crouch', ['crouch']],
    ['sit', ['sit']],
    ['cast', ['cast', 'spell', 'magic']],
    ['block', ['block', 'guard']],
    ['hit', ['hit', 'hurt', 'damage']],
    ['die', ['die', 'death', 'dead']],
    ['interact', ['interact', 'use']],
    ['emote', ['emote', 'wave', 'cheer']],
    ['hold', ['hold']],
    ['drive', ['drive']],
    ['swim', ['swim']],
    ['climb', ['climb']],
    ['idle', ['idle']],
  ],
  verified: 'ported from preprocess_kaykit.py, the table that wrote canonical and loop on all 374 library clips',
};

/** `LOOP_CLIPS` from the same script: canonical clips that repeat; every other clip plays once and holds. */
const loopClips: Fact<ReadonlySet<string>> = {
  value: new Set(['crouch', 'drive', 'fall', 'hold', 'idle', 'run', 'sit', 'sprint', 'swim', 'walk']),
  verified: 'ported from preprocess_kaykit.py',
};

/** Seconds into a clip where it lands (a foot, a blade). Filled only from looked-at stills; empty until then. */
const contactFrames: Fact<Readonly<Record<string, number>>> = {
  value: {},
  verified: 'no still verified yet',
};

/** Kit pieces that stop a body: their collider is the cuboid of their bounds. */
const solidPieces: Fact<ReadonlySet<string>> = {
  value: new Set(['wall', 'wall-half', 'wall-narrow', 'wall-corner', 'wall-end', 'column', 'fence', 'support']),
  verified:
    'kitPiece vocabulary of asset-card.schema.json; openings (wall-opening, door, gate) and walkable pieces ' +
    '(floor, stairs, road, bridge) get no collider unless the game asks',
};

export const conventions = {
  rigs,
  bodies,
  forward,
  scale,
  colormapPerPack,
  grid,
  clipWords,
  loopClips,
  contactFrames,
  solidPieces,
} as const;

/** `canonical_clip` from preprocess_kaykit.py. */
export function canonicalClip(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clipWords.value.find(([, words]) => words.some((word) => normalized.includes(word)))?.[0] ?? 'other';
}

export function clipLoops(name: string): boolean {
  return loopClips.value.has(canonicalClip(name));
}
