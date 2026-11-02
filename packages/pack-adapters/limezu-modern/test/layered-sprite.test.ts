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
    const eyes = image(4, 4, 2, (x, y) => y === 1);
    const hair = image(4, 4, 3, (_x, y) => y < 2);
    const out = composeLayers(
      [
        { image: as(hair), order: 3 },
        { image: as(body), order: 0 },
        { image: as(eyes), order: 1 },
      ],
      pixelCanvas,
    );
    expect(out.px).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1]);
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
    const layers = farmerLayers({ Tools: solid(6), Hairstyles: solid(4), Bodies: solid(1), Eyes: solid(2) });
    expect(composeLayers(layers, pixelCanvas).px).toEqual([6]);
    expect(composeLayers(farmerLayers({ Hairstyles: solid(4), Eyes: solid(2) }), pixelCanvas).px).toEqual([4]);
    expect(composeLayers(farmerLayers({ Accessories: solid(5), Hairstyles: solid(4) }), pixelCanvas).px).toEqual([5]);
  });

  it('rejects a piece name the generator does not have', () => {
    expect(() => farmerLayers({ Wings: {} } as never)).toThrow(/Wings/);
  });
});
