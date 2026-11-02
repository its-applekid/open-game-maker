/**
 * Canonical roles → this set's clip names, most usual first; Rig_Large names follow the Rig_Medium ones. The role
 * keys are the SmallScaleInt adapter's, so a game written against roles swaps sets at lineup time. A role with no
 * KayKit clip maps to nothing and is refused when played.
 */
export const vocabulary = {
  idle: ['Idle_A', 'Idle_B'],
  walk: ['Walking_A', 'Walking_B', 'Walking_C'],
  run: ['Running_A', 'Running_B'],
  'attack.melee.1': ['Melee_1H_Attack_Chop', 'Melee_1H_Slash'],
  'attack.melee.2': ['Melee_1H_Attack_Slice_Diagonal', 'Melee_2H_Attack'],
  'attack.melee.3': ['Melee_1H_Attack_Stab', 'Melee_1H_Stab'],
  'attack.run': [],
  cast: ['Ranged_Magic_Spellcasting', 'Ranged_Magic_Shoot'],
  hit: ['Hit_A', 'Hit_B'],
  die: ['Death_A', 'Death_B'],
  'block.start': ['Melee_Block'],
  'block.hold': ['Melee_Blocking'],
  dodge: ['Dodge_Forward'],
  'crouch.idle': ['Crouching'],
  'crouch.run': ['Sneaking'],
  'strafe.left': ['Running_Strafe_Left'],
  'strafe.right': ['Running_Strafe_Right'],
  'special.1': [],
  'special.2': [],
  turn: [],
  sheathe: [],
  taunt: ['Skeletons_Taunt'],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof vocabulary;

export function isRole(name: string): name is Role {
  return Object.hasOwn(vocabulary, name);
}

/** The role a clip name plays, if any. */
export function roleOf(clip: string): Role | undefined {
  return (Object.keys(vocabulary) as Role[]).find((role) => (vocabulary[role] as readonly string[]).includes(clip));
}
