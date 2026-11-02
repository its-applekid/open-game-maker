/** A pack fact and how it was established. */
export interface Fact<T> {
  value: T;
  verified: { how: string; date: string };
}

function fact<T>(value: T, how: string, date = '2026-11-02'): Fact<T> {
  return { value, verified: { how, date } };
}

export const SCALES = [16, 32, 48] as const;
export type Scale = (typeof SCALES)[number];

export const DIRECTIONS4 = ['down', 'left', 'right', 'up'] as const;
export type Direction4 = (typeof DIRECTIONS4)[number];

export const AUTOTILE_LAYOUTS = ['gamemaker', 'godot'] as const;
export type AutotileLayout = (typeof AUTOTILE_LAYOUTS)[number];

/**
 * Neighbour bits of a blob mask: a cell's 8 neighbours, clockwise from north. A corner bit only counts when both
 * cardinals beside it are set, which leaves the 47 masks the two layouts draw.
 */
export const NEIGHBOUR_BITS = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

const AUTOTILE_HOW =
  'alpha coverage of each cell edge, corner and centre in every 12x4 block with transparency of ' +
  'Autotiles_<layout>_<px>.png at 16, 32 and 48 px (limezu-modern-farm 1.3); each of the 47 masks appears once';

export const conventions = {
  packs: fact(
    [
      'limezu-modern-farm',
      'limezu-modern-interiors',
      'limezu-modern-exteriors',
      'limezu-modern-user-interface',
      'limezu-fantasy-battlers',
      'limezu-fungus-cave',
    ] as const,
    'pack directory names of the limezu-modern set on the host',
  ),
  scales: fact(SCALES, 'farm 1.3 ships 16x16/, 32x32/ and 48x48/ folders, each hand-drawn'),
  /** A game draws every map and sprite of this set at one scale, recorded as `scale` in `gm.lock.json`. */
  oneScalePerGame: fact(
    true,
    'research engine-layering 2026-11-01 §4.3: mixing scales reads as a mistake',
    '2026-11-01',
  ),
  rpgMakerMv: fact(
    {
      cols: 3,
      rows: 4,
      rowOrder: DIRECTIONS4,
      /** Columns played for a walk cycle; the middle column is the standing pose. */
      walkCycle: [0, 1, 2, 1],
      standCol: 1,
    } as const,
    'RPG_Maker_MV/**/!$*.png: 81 single-character sheets divide into 3x4 frames; rows 1 and 2 are mirror images ' +
      'of each other (mean pixel difference < 1.2) in 79 of 81, so they are left and right',
  ),
  autotile: fact(
    {
      blockCols: 12,
      blockRows: 4,
      /** Cells per terrain block in the sheet (12 x 4); terrains are stacked top to bottom. */
      blockCells: 48,
      blocksPerSheet: 14,
      layouts: {
        gamemaker: {
          blank: 0,
          // prettier-ignore
          index: {
            0: 47, 1: 45, 4: 44, 5: 42, 7: 41, 16: 43, 17: 33, 20: 36, 21: 20, 23: 19, 28: 35, 29: 18, 31: 17,
            64: 46, 65: 40, 68: 34, 69: 32, 71: 30, 80: 38, 81: 28, 84: 24, 85: 16, 87: 14, 92: 23, 93: 12, 95: 10,
            112: 37, 113: 27, 116: 22, 117: 8, 119: 6, 124: 21, 125: 4, 127: 2, 193: 39, 197: 31, 199: 29, 209: 26,
            213: 15, 215: 13, 221: 11, 223: 9, 241: 25, 245: 7, 247: 5, 253: 3, 255: 1,
          } as Readonly<Record<number, number>>,
        },
        godot: {
          blank: 22,
          // prettier-ignore
          index: {
            0: 36, 1: 24, 4: 37, 5: 25, 7: 44, 16: 0, 17: 12, 20: 1, 21: 13, 23: 28, 28: 8, 29: 16, 31: 20,
            64: 39, 65: 27, 68: 38, 69: 26, 71: 41, 80: 3, 81: 15, 84: 2, 85: 14, 87: 7, 92: 5, 93: 43, 95: 32,
            112: 11, 113: 19, 116: 6, 117: 40, 119: 21, 124: 10, 125: 9, 127: 17, 193: 47, 197: 42, 199: 45, 209: 31,
            213: 4, 215: 46, 221: 34, 223: 29, 241: 35, 245: 23, 247: 30, 253: 18, 255: 33,
          } as Readonly<Record<number, number>>,
        },
      },
    } as const,
    AUTOTILE_HOW,
  ),
  /** Frames per animated sheet, the same at every scale. Every `*_Shake` tree sheet has `shake` frames. */
  animatedFrames: fact(
    {
      shake: 3,
      byName: {
        Barn_Door: 16,
        Barn_2_Door: 16,
        Cheese_Machine: 31,
        Farm_House_Door: 14,
        Farm_House_2_Door: 14,
        Silo_Door: 14,
        Small_Stable_Door: 14,
        Wooden_Gate: 14,
        Stable_Gate: 12,
        Stable_Gate_Light_Brown: 12,
        Stone_Oven_Door: 8,
        Stone_Oven_Smoke: 8,
        Stone_Oven_Smoke_Effect: 8,
        Well: 16,
        Wooden_Crate_1: 20,
        Wooden_Crate_2: 20,
        Sprinkler: 49,
        Sprinkler_No_Water: 49,
        Sprinkler_Water_Effect: 49,
        Modern_Farm_vfx_Falling_Leaf: 15,
        Modern_Farm_vfx_Falling_Leaves: 18,
        Modern_Farm_vfx_Falling_Leaves_2: 18,
        Modern_Farm_vfx_Falling_Leaves_3: 18,
        Modern_Farm_vfx_Falling_Leaves_Brown: 18,
        Modern_Farm_vfx_Falling_Leaves_Yellow: 18,
        Modern_Farm_vfx_Rare_Crop_Glitter: 8,
      } as Readonly<Record<string, number>>,
    } as const,
    'frame count of every Animated_gifs_<px>/*.gif at 16, 32 and 48 px; equal across scales',
  ),
  crops: fact(
    { stages: 7, order: 'left-to-right' } as const,
    'Crops_Growth_<px>/*_Growth_Stages_<px>.png: 19 crops, width = 7 x scale, every column drawn, at 16, 32 and 48',
  ),
  iconSizes: fact([16, 24, 32] as const, 'Icons/Icons_{16x16,24x24,32x32}: 70 single icons each; 24 and 32 hand-made'),
  farmerPieces: fact(
    {
      /** Frame size in scale units: one tile wide, two tall. */
      frame: { w: 1, h: 2 },
      cols: 56,
      rows: 11,
      layers: ['Bodies', 'Eyes', 'Outfits', 'Hairstyles', 'Accessories', 'Tools'] as const,
    } as const,
    'Farmer_Generator_Pieces/Character Pieces/*/<px>: 80 sheets per scale, 56 x 11 frames of px x 2px ' +
      '(Body_1 at 16 px is twice as wide). Layer order bottom to top: overlapping pixels counted per pair ' +
      '(hair/accessory 43,812, body/eyes 287, eyes/hair 5); the order itself is the generator folder order, ' +
      'not yet confirmed against a still. Tools/<px> sheets have their own grid (Tool_Axe 1920x144 at 16 px) ' +
      "and draw over the character at the caller's offset",
  ),
  battlerVariants: fact(
    { colour: '', alternate: 'b', greyscale: 'bw', silhouette: 's' } as const,
    'Fantasy Battlers/Original size: 31 battlers x 4 file suffixes with identical alpha; s is one colour, bw is ' +
      'grey only, b has two more colours than the base',
  ),
} as const;

export function isScale(value: unknown): value is Scale {
  return SCALES.includes(value as Scale);
}
