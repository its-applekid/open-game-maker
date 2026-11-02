import { describe, expect, it } from 'vitest';

import { AUTOTILE_LAYOUTS, NEIGHBOUR_BITS, conventions, paintAutotile, type AutotileLayout } from '../src/index.js';
import { DRAWN } from './fixtures/autotile-oracle.js';

const { N, NE, E, SE, S, SW, W, NW } = NEIGHBOUR_BITS;
const OFFSETS: [number, number, number][] = [
  [N, 0, -1],
  [NE, 1, -1],
  [E, 1, 0],
  [SE, 1, 1],
  [S, 0, 1],
  [SW, -1, 1],
  [W, -1, 0],
  [NW, -1, -1],
];

/** A 3x3 mask: centre set, neighbours from raw (unreduced) bits. */
function around(bits: number): boolean[][] {
  const mask = [0, 1, 2].map(() => [false, false, false]);
  mask[1]![1] = true;
  for (const [bit, dx, dy] of OFFSETS) if (bits & bit) mask[1 + dy]![1 + dx] = true;
  return mask;
}

/** The corner bits a blob tile can show: a corner only reads when both cardinals beside it are terrain. */
function reduce(bits: number): number {
  let out = bits & (N | E | S | W);
  if (bits & NE && bits & N && bits & E) out |= NE;
  if (bits & SE && bits & S && bits & E) out |= SE;
  if (bits & SW && bits & S && bits & W) out |= SW;
  if (bits & NW && bits & N && bits & W) out |= NW;
  return out;
}

const RAW = Array.from({ length: 256 }, (_, bits) => bits);
const CASES = [...new Set(RAW.map(reduce))];

/** The oracle's neighbour names for a cell, as bits. */
function drawnBits(layout: AutotileLayout, cell: number): number | null {
  const names = DRAWN[layout][cell];
  if (names === null || names === undefined) return null;
  return names
    .split(' ')
    .filter(Boolean)
    .reduce((bits, name) => bits | NEIGHBOUR_BITS[name as keyof typeof NEIGHBOUR_BITS], 0);
}

describe('autotile painting', () => {
  it('has exactly 47 distinct blob cases', () => {
    expect(CASES).toHaveLength(47);
  });

  for (const layout of AUTOTILE_LAYOUTS) {
    describe(layout, () => {
      const { blank } = conventions.autotile.value.layouts[layout];

      it('draws each of the 47 cases on its own non-blank cell of the 12x4 block', () => {
        const cells = CASES.map((bits) => paintAutotile(around(bits), layout)[1]![1]!);
        expect(new Set(cells).size).toBe(47);
        for (const cell of cells) {
          expect(cell).toBeGreaterThanOrEqual(0);
          expect(cell).toBeLessThan(48);
          expect(cell).not.toBe(blank);
        }
      });

      it('picks the cell the pack draws for that neighbourhood, for all 256 raw masks', () => {
        for (const bits of RAW) {
          const cell = paintAutotile(around(bits), layout)[1]![1]!;
          expect(drawnBits(layout, cell), `raw mask ${bits}`).toBe(reduce(bits));
        }
      });

      it('names the blank cell the pack leaves empty', () => {
        expect(DRAWN[layout][blank]).toBeNull();
      });

      it('offsets by terrain block and leaves empty cells empty', () => {
        const mask = [
          [true, false],
          [false, false],
        ];
        const [[a, b]] = paintAutotile(mask, layout, 3) as [[number, number]];
        expect(a).toBe(3 * 48 + paintAutotile([[true]], layout)[0]![0]!);
        expect(b).toBe(-1);
      });
    });
  }

  it('GameMaker: full at 1, isolated at 47, missing inner corners count up from 1 (NW 1, NE 2, SE 4, SW 8)', () => {
    const at = (bits: number) => paintAutotile(around(bits), 'gamemaker')[1]![1]!;
    expect(at(255)).toBe(1);
    expect(at(0)).toBe(47);
    const corners = [NW, NE, SE, SW];
    for (let missing = 0; missing < 16; missing += 1) {
      const bits = corners.reduce((acc, corner, i) => (missing & (1 << i) ? acc & ~corner : acc), 255);
      expect(at(bits), `missing corners ${missing}`).toBe(1 + missing);
    }
  });

  it('Godot: full at 33, isolated at 36, blank at column 10 of row 1', () => {
    const at = (bits: number) => paintAutotile(around(bits), 'godot')[1]![1]!;
    expect(at(255)).toBe(33);
    expect(at(0)).toBe(36);
    expect(conventions.autotile.value.layouts.godot.blank).toBe(12 + 10);
  });

  it('rejects a terrain block outside the 14 a sheet holds', () => {
    expect(paintAutotile([[true]], 'godot', 13)[0]![0]).toBe(13 * 48 + 36);
    expect(() => paintAutotile([[true]], 'godot', 14)).toThrow(/14 blocks/);
    expect(() => paintAutotile([[true]], 'godot', -1)).toThrow(RangeError);
  });

  it('treats cells outside the mask as empty', () => {
    expect(paintAutotile([[true]], 'gamemaker')).toEqual([[47]]);
  });
});
