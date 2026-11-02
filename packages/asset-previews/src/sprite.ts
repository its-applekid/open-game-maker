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
  const width = options.width ?? 512;
  const height = options.height ?? 512;
  await atomicWebp(
    sharp(png).resize(width, height, {
      fit: 'contain',
      kernel: options.pixelArt ? sharp.kernel.nearest : sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }),
    out,
  );
  return { out };
}
