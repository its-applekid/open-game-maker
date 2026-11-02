/** Canonical roles → this set's action names, most usual first. Humanoid and animal names share the roles. */
export const vocabulary = {
  idle: ['Idle', 'Idle2'],
  walk: ['Walk'],
  run: ['Run'],
  'attack.melee.1': ['Melee', 'Attack1'],
  'attack.melee.2': ['Melee2', 'Attack2'],
  'attack.melee.3': ['MeleeSpin', 'Attack3'],
  'attack.run': ['MeleeRun'],
  cast: ['CastSpell'],
  hit: ['TakeDamage'],
  die: ['Die'],
  'block.start': ['ShieldBlockStart'],
  'block.hold': ['ShieldBlockMid'],
  dodge: ['Rolling'],
  'crouch.idle': ['CrouchIdle'],
  'crouch.run': ['CrouchRun'],
  'strafe.left': ['StrafeLeft'],
  'strafe.right': ['StrafeRight'],
  'special.1': ['Special1'],
  'special.2': ['Special2'],
  turn: ['180Turn'],
  sheathe: ['UnSheathSword'],
  taunt: ['Taunt'],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof vocabulary;

/** Roles that repeat; every other role plays once and holds its last frame. */
export const LOOP_ROLES: ReadonlySet<Role> = new Set<Role>([
  'idle',
  'walk',
  'run',
  'crouch.idle',
  'crouch.run',
  'strafe.left',
  'strafe.right',
  'block.hold',
]);

export function isRole(name: string): name is Role {
  return Object.hasOwn(vocabulary, name);
}

/** The role a set action name plays, if any (case-insensitive: cards store names lower-cased). */
export function roleOf(action: string): Role | undefined {
  const wanted = action.toLowerCase();
  return (Object.keys(vocabulary) as Role[]).find((role) =>
    vocabulary[role].some((name) => name.toLowerCase() === wanted),
  );
}

export function loops(action: string): boolean {
  const role = isRole(action) ? action : roleOf(action);
  return role !== undefined && LOOP_ROLES.has(role);
}
