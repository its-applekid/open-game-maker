import { conventions, type Direction4 } from './conventions.js';

const mv = conventions.rpgMakerMv.value;

/** Canonical roles a 4-direction sheet plays, as RPG Maker MV columns; `loop` roles repeat, others hold. */
export const vocabulary = {
  character: {
    idle: { cols: [mv.standCol], loop: true },
    walk: { cols: mv.walkCycle, loop: true },
  },
  /** The MV animal sheets carry only these two; sleep and eat rows in the native sheets are not yet measured. */
  animal: {
    idle: { cols: [mv.standCol], loop: true },
    walk: { cols: mv.walkCycle, loop: true },
  },
  /** Battler stills: role → file-name suffix. */
  battler: conventions.battlerVariants.value,
} as const;

export type Role4 = keyof typeof vocabulary.character;
export type BattlerRole = keyof typeof vocabulary.battler;

export function isRole4(value: string): value is Role4 {
  return Object.hasOwn(vocabulary.character, value);
}

/** Frame index in an MV sheet (3 x 4, row-major) for a role, direction and step of its cycle. */
export function mvFrame(role: Role4, facing: Direction4, step: number): number {
  const { cols } = vocabulary.character[role];
  const col = cols[((step % cols.length) + cols.length) % cols.length]!;
  return mv.rowOrder.indexOf(facing) * mv.cols + col;
}

/** Column of growth stage `n` (0 = first) in a crop strip. */
export function cropStage(n: number): number {
  const { stages } = conventions.crops.value;
  if (!Number.isInteger(n) || n < 0 || n >= stages) throw new RangeError(`crop stage ${n} is outside 0..${stages - 1}`);
  return n;
}
