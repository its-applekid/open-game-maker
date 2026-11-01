import sharp from 'sharp';
import type { Image, Look } from '@ogm/contracts';

export type ImageMeasurement = { image: Image; look: Look };

function hex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export async function measureImage(file: string): Promise<ImageMeasurement> {
  const input = sharp(file, { limitInputPixels: 268_402_689 });
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`${file}: image dimensions are unavailable`);
  const { data, info } = await input
    .clone()
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colours = new Map<string, { count: number; red: number; green: number; blue: number }>();
  let luminance = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const key = `${red},${green},${blue}`;
    const existing = colours.get(key);
    colours.set(key, existing ? { ...existing, count: existing.count + 1 } : { count: 1, red, green, blue });
    luminance += (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  }
  const palette = [...colours.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        hex(left.red, left.green, left.blue).localeCompare(hex(right.red, right.green, right.blue)),
    )
    .slice(0, 5)
    .map(({ red, green, blue }) => hex(red, green, blue));
  const pixelArt = metadata.isPalette || (colours.size <= 64 && Math.max(metadata.width, metadata.height) <= 512);
  return {
    image: {
      width_px: metadata.width,
      height_px: metadata.height,
      has_alpha: metadata.hasAlpha,
      indexed_colors: metadata.isPalette ? colours.size : null,
      pixel_art: pixelArt,
    },
    look: { palette_hex: palette as Look['palette_hex'], mean_luminance: luminance / (data.length / info.channels) },
  };
}
