import { blit, spriteFrame } from "./canvas.mjs";

const sortedLayerPositions = new WeakMap();
const flushSurfaceFrames = new WeakMap();

function finitePair(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function issue(code, path, detail) {
  return { code, path, detail };
}

export function groundReferences(ground) {
  const layers = Array.isArray(ground?.layers) ? ground.layers : [];
  return [
    ground?.ref,
    ...layers.map((layer) => layer?.ref),
  ].filter(Boolean);
}

export function validContinuousGround(ground) {
  const layers = Array.isArray(ground?.layers) ? ground.layers : [];
  return ["area", "layers"].includes(ground?.fill) &&
    finitePair(ground?.size) &&
    ground.size.every((value) => value > 0) &&
    (ground.fill === "area" ? Boolean(ground.ref) : layers.length > 0);
}

export function validateGroundLayers(ground, path) {
  const issues = [];
  if (ground?.surface !== undefined && ground.surface !== "flush") {
    issues.push(issue("ground.surface", `${path}.surface`, "ground surface must be flush"));
  }
  if (ground?.underlay !== undefined && !/^#[0-9a-f]{6}$/iu.test(ground.underlay)) {
    issues.push(issue("ground.underlay", `${path}.underlay`, "underlay must be a six-digit hex color"));
  }
  if (ground?.bounds_offset !== undefined && !finitePair(ground.bounds_offset)) {
    issues.push(issue("ground.bounds_offset", `${path}.bounds_offset`, "bounds offset must be a finite [x, y] pair"));
  }
  if (ground?.layers === undefined) {
    if (ground?.fill === "layers") {
      issues.push(issue("ground.layers", `${path}.layers`, "layer-only ground needs a non-empty layer array"));
    }
    return issues;
  }
  if (!Array.isArray(ground.layers) || ground.layers.length === 0) {
    issues.push(issue("ground.layers", `${path}.layers`, "ground layers must be a non-empty array"));
    return issues;
  }
  if (!finitePair(ground.grid?.cell) || ground.grid.cell.some((value) => value <= 0)) {
    issues.push(issue("ground.grid", `${path}.grid.cell`, "layered ground needs a positive [width, height] cell"));
  }
  if (!finitePair(ground.grid?.origin)) {
    issues.push(issue("ground.grid", `${path}.grid.origin`, "layered ground needs a finite [x, y] origin"));
  }
  for (const [index, layer] of ground.layers.entries()) {
    const layerPath = `${path}.layers[${index}]`;
    if (!layer?.ref) issues.push(issue("ground.ref", `${layerPath}.ref`, "ground layers need an asset reference"));
    if (!Array.isArray(layer?.cells) || layer.cells.length === 0 || !layer.cells.every(finitePair)) {
      issues.push(issue("ground.cells", `${layerPath}.cells`, "ground layer cells must be finite [x, y] pairs"));
    }
    if (layer?.scale !== undefined && (!(layer.scale > 0) || !Number.isFinite(layer.scale))) {
      issues.push(issue("ground.scale", `${layerPath}.scale`, "ground layer scale must be positive"));
    }
    if (layer?.surface !== undefined && layer.surface !== "flush") {
      issues.push(issue("ground.surface", `${layerPath}.surface`, "ground layer surface must be flush"));
    }
  }
  return issues;
}

function flushSurface(tile, surface, projection) {
  if (surface !== "flush" || projection !== "isometric") return tile;
  const cached = flushSurfaceFrames.get(tile);
  if (cached) return cached;
  const height = Math.min(tile.height, Math.ceil(tile.width / 2));
  const data = new Uint8Array(tile.width * height * 4);
  const halfWidth = tile.width / 2;
  const halfHeight = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      const inside = Math.abs(x + 0.5 - halfWidth) / halfWidth +
          Math.abs(y + 0.5 - halfHeight) / halfHeight <= 1;
      if (!inside) continue;
      const index = (y * tile.width + x) * 4;
      data.set(tile.data.subarray(index, index + 4), index);
    }
  }
  const frame = {
    ...tile,
    data,
    height,
    frameHeight: Math.min(tile.frameHeight ?? height, height),
  };
  flushSurfaceFrames.set(tile, frame);
  return frame;
}

export async function groundTileFrame(library, spec, scale, projection) {
  return flushSurface(
    await spriteFrame(library, spec, 0, scale),
    spec.surface,
    projection,
  );
}

function paintRect(target, color, clip) {
  const rgb = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const left = Math.max(0, Math.floor(clip?.left ?? 0));
  const top = Math.max(0, Math.floor(clip?.top ?? 0));
  const right = Math.min(target.width, Math.ceil(clip?.right ?? target.width));
  const bottom = Math.min(target.height, Math.ceil(clip?.bottom ?? target.height));
  if (left >= right || top >= bottom) return;
  const row = new Uint8Array((right - left) * 4);
  const pixel = [...rgb, 255];
  for (let x = 0; x < right - left; x += 1) {
    row.set(pixel, x * 4);
  }
  for (let y = top; y < bottom; y += 1) {
    target.data.set(row, (y * target.width + left) * 4);
  }
}

async function drawFill(target, library, ground, offsetX, offsetY, projection, clip) {
  const tile = await groundTileFrame(library, ground, ground.scale ?? 1, projection);
  if (tile.width === 0 || tile.height === 0) throw new Error(`${ground.ref} has an empty ground frame`);
  // Isometric packs commonly center a 2:1 power-of-two diamond near the
  // bottom of a much larger transparent frame. The painted bounds may include
  // a couple of antialiased edge pixels, so snap the width to its nearest
  // power of two and derive the logical height from the 2:1 projection.
  const nearestPowerOfTwo = 2 ** Math.round(Math.log2(tile.width));
  const correctedIsometricWidth =
    nearestPowerOfTwo === tile.width ||
      (tile.width >= 32 && Math.abs(nearestPowerOfTwo - tile.width) <= 2)
      ? nearestPowerOfTwo
      : tile.width;
  const frameWidth = projection === "isometric" ? correctedIsometricWidth : tile.width;
  const frameHeight = projection === "isometric"
    ? frameWidth / 2
    : tile.height;
  if (projection === "isometric") {
    const rowHeight = Math.max(1, Math.floor(frameHeight / 2));
    const startRow = Math.floor(-frameHeight / rowHeight) - 1;
    const endRow = Math.ceil((target.height + frameHeight) / rowHeight) + 1;
    for (let row = startRow; row <= endRow; row += 1) {
      const y = row * rowHeight + (((Math.round(offsetY) % rowHeight) + rowHeight) % rowHeight);
      const stagger = row % 2 === 0 ? 0 : frameWidth / 2;
      const phaseX = ((Math.round(offsetX) % frameWidth) + frameWidth) % frameWidth;
      const startX = phaseX - frameWidth + stagger;
      for (let x = startX; x < target.width + frameWidth; x += frameWidth) {
        blit(target, tile, x, y, clip);
      }
    }
    return;
  }
  const startX = ((Math.round(offsetX) % frameWidth) + frameWidth) % frameWidth - frameWidth;
  const startY = ((Math.round(offsetY) % frameHeight) + frameHeight) % frameHeight - frameHeight;
  for (let y = startY; y < target.height; y += frameHeight) {
    for (let x = startX; x < target.width; x += frameWidth) {
      blit(target, tile, x, y, clip);
    }
  }
}

function cellPosition(ground, cell, projection) {
  const [cellWidth, cellHeight] = ground.grid.cell;
  const [originX, originY] = ground.grid.origin;
  if (projection === "isometric") {
    return [
      originX + (cell[0] - cell[1]) * cellWidth / 2,
      originY + (cell[0] + cell[1]) * cellHeight / 2,
    ];
  }
  return [originX + cell[0] * cellWidth, originY + cell[1] * cellHeight];
}

export async function drawGroundLayers(target, library, ground, offsetX, offsetY, projection, clip) {
  for (const layer of ground.layers ?? []) {
    const tile = await groundTileFrame(
      library,
      layer,
      layer.scale ?? ground.scale ?? 1,
      projection,
    );
    if (tile.width === 0 || tile.height === 0) throw new Error(`${layer.ref} has an empty ground frame`);
    let positions = sortedLayerPositions.get(layer);
    if (!positions) {
      positions = layer.cells
        .map((cell) => cellPosition(ground, cell, projection))
        .sort(([leftX, leftY], [rightX, rightY]) => leftY - rightY || leftX - rightX);
      sortedLayerPositions.set(layer, positions);
    }
    for (const [x, y] of positions) {
      blit(
        target,
        tile,
        x + offsetX - tile.width / 2,
        y + offsetY - tile.height / 2,
        clip,
      );
    }
  }
}

export async function drawGround(target, library, ground, offsetX, offsetY, projection, clip) {
  await drawGroundBase(target, library, ground, offsetX, offsetY, projection, clip);
  await drawGroundLayers(target, library, ground, offsetX, offsetY, projection, clip);
}

export async function drawGroundBase(target, library, ground, offsetX, offsetY, projection, clip) {
  if (ground.underlay) paintRect(target, ground.underlay, clip);
  if (ground.fill === "layers") return;
  await drawFill(target, library, ground, offsetX, offsetY, projection, clip);
}
