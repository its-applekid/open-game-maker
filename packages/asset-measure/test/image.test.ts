import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { measureImage } from '../src/index.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('measureImage', () => {
  it('measures alpha and recognizes a small limited-palette image as pixel art', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asset-measure-image-'));
    temporary.push(dir);
    const file = join(dir, 'tiles16.png');
    const pixels = Buffer.alloc(32 * 16 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      const light = (index / 4) % 2 === 0;
      pixels.set(light ? [255, 255, 255, 255] : [0, 0, 0, 0], index);
    }
    await sharp(pixels, { raw: { width: 32, height: 16, channels: 4 } }).png({ palette: true }).toFile(file);

    const measured = await measureImage(file);
    expect(measured.image).toMatchObject({ width_px: 32, height_px: 16, has_alpha: true, pixel_art: true });
    expect(measured.look.palette_hex).toHaveLength(2);
    expect(measured.look.palette_hex).toContain('#ffffff');
  });
});
