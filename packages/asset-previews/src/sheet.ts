import { mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import sharp, { type Sharp } from 'sharp';

import { renderModelViews, type BrowserRenderOptions } from './browser.js';
import { VIEWS, type View } from './page.js';

export type RenderSheetOptions = BrowserRenderOptions & {
  cellSize?: number;
  views?: readonly View[];
};

export type RenderSheetResult = {
  out: string;
  renderer: string;
  software: boolean;
  views: readonly View[];
};

async function atomicWebp(image: Sharp, out: string): Promise<void> {
  await mkdir(dirname(out), { recursive: true });
  const staged = `${out}.part`;
  try {
    await image.webp({ quality: 82 }).toFile(staged);
    await rename(staged, out);
  } catch (error) {
    await unlink(staged).catch(() => undefined);
    throw error;
  }
}

export async function renderSheet(
  glb: string,
  out: string,
  options: RenderSheetOptions = {},
): Promise<RenderSheetResult> {
  const views = options.views ?? VIEWS;
  if (views.length === 0) throw new Error('at least one model view is required');
  const cellSize = options.cellSize ?? 320;
  const rendered = await renderModelViews(glb, views, options);
  const columns = Math.min(3, views.length);
  const rows = Math.ceil(views.length / columns);
  const cells = await Promise.all(
    rendered.cells.map((cell) => sharp(cell).resize(cellSize, cellSize, { fit: 'fill' }).png().toBuffer()),
  );
  await atomicWebp(
    sharp({
      create: { width: columns * cellSize, height: rows * cellSize, channels: 3, background: '#111827' },
    }).composite(
      cells.map((input, index) => ({
        input,
        left: (index % columns) * cellSize,
        top: Math.floor(index / columns) * cellSize,
      })),
    ),
    out,
  );
  return { out, renderer: rendered.renderer, software: rendered.software, views };
}

export { atomicWebp };
