import sharp from 'sharp';

import { atomicWebp } from './sheet.js';

export type SpriteSheetOptions = {
  width?: number;
  height?: number;
  pixelArt?: boolean;
};

export async function spriteSheet(
  png: string,
  out: string,
  options: SpriteSheetOptions = {},
): Promise<{ out: string }> {
  const image = sharp(png);
  if (options.width !== undefined || options.height !== undefined) {
    image.resize(options.width, options.height, {
      fit: 'contain',
      kernel: options.pixelArt ? sharp.kernel.nearest : sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  await atomicWebp(image, out);
  return { out };
}
