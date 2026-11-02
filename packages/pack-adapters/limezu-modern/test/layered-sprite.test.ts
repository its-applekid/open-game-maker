import { describe, expect, it } from 'vitest';

import { composeLayers, farmerLayers, type Canvas2D, type LayeredSpriteLayer } from '../src/index.js';

/**
 * A pixel canvas: each generated layer image is a grid of ids (0 = transparent); drawing copies non-zero ids over
 * what is there, as source-over does for opaque pixels.
 */
interface Pixels {
  width: number;
  height: number;
  px: number[];
}

function image(width: number, height: number, id: number, covers: (x: number, y: number) => boolean): Pixels {
  const px = Array.from({ length: width * height }, (_, i) => (covers(i % width, Math.floor(i / width)) ? id : 0));
  return { width, height, px };
}

function pixelCanvas(width: number, height: number): Canvas2D & Pixels {
  const canvas = {
    width,
    height,
    px: Array<number>(width * height).fill(0),
    smoothing: true,
    getContext: () => ({
      set imageSmoothingEnabled(value: boolean) {
        canvas.smoothing = value;
      },
      get imageSmoothingEnabled() {
        return canvas.smoothing;
      },
      drawImage: (source: unknown, dx: number, dy: number) => {
        const img = source as Pixels;
        for (let y = 0; y < img.height; y += 1) {
          for (let x = 0; x < img.width; x += 1) {
            const id = img.px[y * img.width + x]!;
            if (id) canvas.px[(y + dy) * width + x + dx] = id;
          }
        }
      },
    }),
  };
  return canvas as unknown as Canvas2D & Pixels;
}

const as = (p: Pixels) => p as unknown as LayeredSpriteLayer['image'];

describe('composeLayers', () => {
  it('draws lower orders first so higher layers cover them, whatever the array order', () => {
    const body = image(4, 4, 1, () => true);
    const eyes = image(4, 4, 2, (_x, y) => y === 1 || y === 2);
    const hair = image(4, 4, 3, (_x, y) => y < 2);
    const out = composeLayers(
      [
        { image: as(hair), order: 3 },
        { image: as(body), order: 0 },
        { image: as(eyes), order: 1 },
      ],
      pixelCanvas,
    );
    expect(out.px).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
    expect((out as unknown as { smoothing: boolean }).smoothing).toBe(false);
  });

  it('sizes the sheet to the largest layer and its offset', () => {
    const out = composeLayers(
      [
        { image: as(image(4, 2, 1, () => true)), order: 0 },
        { image: as(image(2, 2, 2, () => true)), order: 1, dx: 3, dy: 1 },
      ],
      pixelCanvas,
    );
    expect([out.width, out.height]).toEqual([5, 3]);
    expect(out.px[1 * 5 + 4]).toBe(2);
  });
});

describe('composeLayers offsets', () => {
  it('rejects a negative offset instead of cropping the layer', () => {
    const layer = { image: as(image(2, 2, 1, () => true)), order: 0 };
    expect(() => composeLayers([layer, { ...layer, dx: -1 }], pixelCanvas)).toThrow(/zero or positive/);
    expect(() => composeLayers([{ ...layer, dy: -1 }], pixelCanvas)).toThrow(RangeError);
  });
});

describe('farmerLayers', () => {
  it('stacks farmer pieces body < eyes < outfit < hair < accessory < tool', () => {
    const solid = (id: number) => as(image(1, 1, id, () => true));
    const stack = ['Bodies', 'Eyes', 'Outfits', 'Hairstyles', 'Accessories', 'Tools'] as const;
    for (let i = 1; i < stack.length; i += 1) {
      const [lower, upper] = [stack[i - 1]!, stack[i]!];
      /* the upper piece first in the record, so only the order can put it on top */
      const layers = farmerLayers({ [upper]: solid(i + 1), [lower]: solid(i) });
      expect(composeLayers(layers, pixelCanvas).px, `${upper} over ${lower}`).toEqual([i + 1]);
    }
  });

  it('composes a whole farmer as the verified still: hat over hair, hair over outfit, tool over outfit and hat', () => {
    /*
     * A 4x8 character frame placed one tile in and flush with the top of a 12x12 tool frame, as the pack lays
     * tools out. Ids: 1 body, 2 eyes, 3 outfit, 4 hair, 5 hat, 6 tool. The record lists the pieces top layer
     * first, so only the convention's order can produce this picture.
     */
    const piece = (id: number, covers: (x: number, y: number) => boolean) => as(image(4, 8, id, covers));
    const layers = farmerLayers({
      Tools: as(image(12, 12, 6, (x, y) => (y === 6 && x >= 4 && x <= 8) || (y === 1 && x === 7))),
      Accessories: piece(5, (_x, y) => y <= 1),
      Hairstyles: piece(4, (x, y) => y <= 2 || (x === 0 && y <= 5)),
      Outfits: piece(3, (_x, y) => y >= 5),
      Eyes: piece(2, (x, y) => y === 3 && x <= 1),
      Bodies: piece(1, (_x, y) => y >= 1),
    }).map((layer) => (layer.image.width === 12 ? layer : { ...layer, dx: 4 }));
    const out = composeLayers(layers, pixelCanvas);
    const rows = Array.from({ length: out.height }, (_, y) =>
      out.px
        .slice(y * out.width, (y + 1) * out.width)
        .map((id) => (id ? String(id) : '.'))
        .join(''),
    );
    expect(rows).toEqual([
      '....5555....',
      '....5556....',
      '....4444....',
      '....4211....',
      '....4111....',
      '....4333....',
      '....66666...',
      '....3333....',
      '............',
      '............',
      '............',
      '............',
    ]);
  });

  it('rejects a piece name the generator does not have', () => {
    expect(() => farmerLayers({ Wings: {} } as never)).toThrow(/Wings/);
  });
});
