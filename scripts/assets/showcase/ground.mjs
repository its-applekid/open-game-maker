import { blit, spriteFrame } from "./canvas.mjs";

function finitePair(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function issue(code, path, detail) {
  return { code, path, detail };
}

export function groundReferences(ground) {
  return [
    ground?.ref,
    ...(ground?.layers ?? []).map(({ ref }) => ref),
  ].filter(Boolean);
}

export function validateGroundLayers(ground, path) {
  const issues = [];
  if (ground?.underlay !== undefined && !/^#[0-9a-f]{6}$/iu.test(ground.underlay)) {
    issues.push(issue("ground.underlay", `${path}.underlay`, "underlay must be a six-digit hex color"));
  }
  if (ground?.layers === undefined) return issues;
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
  }
  return issues;
}

function paintRect(target, color, clip) {
  const rgb = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const left = Math.max(0, Math.floor(clip?.left ?? 0));
  const top = Math.max(0, Math.floor(clip?.top ?? 0));
  const right = Math.min(target.width, Math.ceil(clip?.right ?? target.width));
  const bottom = Math.min(target.height, Math.ceil(clip?.bottom ?? target.height));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * target.width + x) * 4;
      target.data[offset] = rgb[0];
      target.data[offset + 1] = rgb[1];
      target.data[offset + 2] = rgb[2];
      target.data[offset + 3] = 255;
    }
  }
}

async function drawFill(target, library, ground, offsetX, offsetY, projection, clip) {
  const tile = await spriteFrame(library, ground, 0, ground.scale ?? 1);
  if (tile.width === 0 || tile.height === 0) throw new Error(`${ground.ref} has an empty ground frame`);
  const frameWidth = tile.frameWidth ?? tile.width;
  const frameHeight = tile.frameHeight ?? tile.height;
  if (projection === "isometric") {
    const rowHeight = Math.max(1, Math.floor(frameHeight / 2));
    const startRow = Math.floor(-frameHeight / rowHeight) - 1;
    const endRow = Math.ceil((target.height + frameHeight) / rowHeight) + 1;
    for (let row = startRow; row <= endRow; row += 1) {
      const y = row * rowHeight + (((Math.round(offsetY) % rowHeight) + rowHeight) % rowHeight);
      const stagger = row % 2 === 0 ? 0 : frameWidth / 2;
      const startX =
        ((Math.round(offsetX - stagger) % frameWidth) + frameWidth) % frameWidth - frameWidth + stagger;
      for (let x = startX; x < target.width + frameWidth; x += frameWidth) {
        blit(target, tile, x + tile.offsetX, y + tile.offsetY, clip);
      }
    }
    return;
  }
  const startX = ((Math.round(offsetX) % frameWidth) + frameWidth) % frameWidth - frameWidth;
  const startY = ((Math.round(offsetY) % frameHeight) + frameHeight) % frameHeight - frameHeight;
  for (let y = startY; y < target.height; y += frameHeight) {
    for (let x = startX; x < target.width; x += frameWidth) {
      blit(target, tile, x + tile.offsetX, y + tile.offsetY, clip);
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

async function drawLayers(target, library, ground, offsetX, offsetY, projection, clip) {
  for (const layer of ground.layers ?? []) {
    const tile = await spriteFrame(library, layer, 0, layer.scale ?? ground.scale ?? 1);
    if (tile.width === 0 || tile.height === 0) throw new Error(`${layer.ref} has an empty ground frame`);
    const frameWidth = tile.frameWidth ?? tile.width;
    const frameHeight = tile.frameHeight ?? tile.height;
    for (const cell of layer.cells) {
      const [x, y] = cellPosition(ground, cell, projection);
      blit(
        target,
        tile,
        x + offsetX - frameWidth / 2 + tile.offsetX,
        y + offsetY - frameHeight / 2 + tile.offsetY,
        clip,
      );
    }
  }
}

export async function drawGround(target, library, ground, offsetX, offsetY, projection, clip) {
  if (ground.underlay) paintRect(target, ground.underlay, clip);
  await drawFill(target, library, ground, offsetX, offsetY, projection, clip);
  await drawLayers(target, library, ground, offsetX, offsetY, projection, clip);
}
