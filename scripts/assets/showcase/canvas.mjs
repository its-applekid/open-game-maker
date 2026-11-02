const decodedFiles = new Map();
const frameCache = new Map();

async function decoded(library, file) {
  let decodedFile = decodedFiles.get(file);
  if (decodedFile) return decodedFile;
  const sharp = await library.sharp();
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  decodedFile = { data, width: info.width, height: info.height };
  decodedFiles.set(file, decodedFile);
  if (decodedFiles.size > 12) decodedFiles.delete(decodedFiles.keys().next().value);
  return decodedFile;
}

async function sourceRegion(library, source) {
  const image = await decoded(library, source.file);
  if (!source.crop) return image;
  const { left, top, width, height } = source.crop;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const start = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(start, start + width * 4), y * width * 4);
  }
  return { data, width, height };
}

export async function spriteFrame(library, spec, index, scale = 1, resolvedAsset) {
  const resolved = resolvedAsset ?? (await library.resolve(spec));
  const source = resolved.frame(((index % resolved.n) + resolved.n) % resolved.n);
  const cropKey = source.crop ? Object.values(source.crop).join(",") : "";
  const key = `${source.file}|${cropKey}|${scale}`;
  let cached = frameCache.get(key);
  if (cached) return cached;

  const image = await sourceRegion(library, source);
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) {
    cached = { data: new Uint8Array(0), width: 0, height: 0, offsetX: 0, offsetY: 0 };
    frameCache.set(key, cached);
    return cached;
  }

  const sourceWidth = right - left + 1;
  const sourceHeight = bottom - top + 1;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = top + Math.floor(y / scale);
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (sourceY * image.width + left + Math.floor(x / scale)) * 4;
      const destinationIndex = (y * width + x) * 4;
      data.set(image.data.subarray(sourceIndex, sourceIndex + 4), destinationIndex);
    }
  }
  cached = {
    data,
    width,
    height,
    offsetX: left * scale,
    offsetY: top * scale,
    frameWidth: image.width * scale,
    frameHeight: image.height * scale,
  };
  frameCache.set(key, cached);
  return cached;
}

export function canvas(width, height, color = "#24252a") {
  const data = new Uint8Array(width * height * 4);
  const rgb = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = rgb[0];
    data[index * 4 + 1] = rgb[1];
    data[index * 4 + 2] = rgb[2];
    data[index * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function blit(destination, source, left, top) {
  const roundedLeft = Math.round(left);
  const roundedTop = Math.round(top);
  const x0 = Math.max(0, roundedLeft);
  const y0 = Math.max(0, roundedTop);
  const x1 = Math.min(destination.width, roundedLeft + source.width);
  const y1 = Math.min(destination.height, roundedTop + source.height);
  for (let y = y0; y < y1; y += 1) {
    let sourceIndex = ((y - roundedTop) * source.width + x0 - roundedLeft) * 4;
    let destinationIndex = (y * destination.width + x0) * 4;
    for (let x = x0; x < x1; x += 1) {
      const alpha = source.data[sourceIndex + 3];
      if (alpha === 255) {
        destination.data.set(source.data.subarray(sourceIndex, sourceIndex + 3), destinationIndex);
      } else if (alpha > 0) {
        const inverse = 255 - alpha;
        for (let channel = 0; channel < 3; channel += 1) {
          destination.data[destinationIndex + channel] =
            (source.data[sourceIndex + channel] * alpha +
              destination.data[destinationIndex + channel] * inverse +
              127) /
            255;
        }
      }
      sourceIndex += 4;
      destinationIndex += 4;
    }
  }
}
