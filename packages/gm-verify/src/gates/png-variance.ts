import { inflateSync } from 'node:zlib';

const CHANNELS: Partial<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const estimate = a + b - c;
  const da = Math.abs(estimate - a);
  const db = Math.abs(estimate - b);
  const dc = Math.abs(estimate - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

/** Standard deviation of sampled pixel luminance in a non-interlaced 8-bit PNG. */
export function pngStddev(png: Buffer, sampleLimit = 1_000): number {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('screenshot is not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const compressed: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  const channels = CHANNELS[colorType];
  if (!channels || bitDepth !== 8 || interlace !== 0 || width === 0 || height === 0)
    throw new Error(
      `unsupported PNG: ${width}x${height}, depth ${bitDepth}, color ${colorType}, interlace ${interlace}`,
    );

  const packed = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[input++]!;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = packed[input++]!;
      const left = x >= channels ? pixels[row + x - channels]! : 0;
      const up = y > 0 ? pixels[row - stride + x]! : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels]! : 0;
      const predicted =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? paeth(left, up, upperLeft)
                  : Number.NaN;
      if (!Number.isFinite(predicted)) throw new Error(`unsupported PNG row filter ${filter}`);
      pixels[row + x] = (value + predicted) & 0xff;
    }
  }

  const total = width * height;
  const step = Math.max(1, Math.floor(total / sampleLimit));
  const values: number[] = [];
  for (let pixel = 0; pixel < total && values.length < sampleLimit; pixel += step) {
    const index = pixel * channels;
    const gray = colorType === 0 || colorType === 4;
    const red = pixels[index]!;
    const green = gray ? red : pixels[index + 1]!;
    const blue = gray ? red : pixels[index + 2]!;
    values.push(red * 0.2126 + green * 0.7152 + blue * 0.0722);
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
