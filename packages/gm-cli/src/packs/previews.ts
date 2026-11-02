import { mkdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

import sharp from 'sharp';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'tga', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'svg']);

export async function writeThumbnail(
  assetsRoot: string,
  file: string,
  sha256: string,
  privateVendor: boolean,
): Promise<string | undefined> {
  if (!IMAGE.has(extname(file).slice(1).toLowerCase())) return undefined;
  const base = privateVendor ? join(assetsRoot, 'private', 'previews') : join(assetsRoot, 'previews');
  const directory = join(base, sha256.slice(0, 2));
  const target = join(directory, `${sha256.slice(0, 16)}-thumb.webp`);
  await mkdir(directory, { recursive: true });
  await sharp(file, { limitInputPixels: 268_402_689 })
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(target);
  return relative(assetsRoot, target).split(sep).join('/');
}
