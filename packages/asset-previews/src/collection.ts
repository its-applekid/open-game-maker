import { extname, join, parse } from 'node:path';

import sharp from 'sharp';

import { atomicWebp } from './sheet.js';

const CELL_SIZE = 128;
const COLUMNS = 8;
const PAGE_SIZE = 48;

function pagePath(out: string, page: number): string {
  if (page === 0) return out;
  const parts = parse(out);
  return join(parts.dir, `${parts.name}-${page + 1}${extname(out)}`);
}

export type CollectionSheetResult = {
  pages: string[];
};

export async function renderCollectionSheet(thumbs: readonly string[], out: string): Promise<CollectionSheetResult> {
  if (thumbs.length === 0) throw new Error('at least one thumbnail is required');
  const pages: string[] = [];
  for (let offset = 0; offset < thumbs.length; offset += PAGE_SIZE) {
    const batch = thumbs.slice(offset, offset + PAGE_SIZE);
    const images = await Promise.all(
      batch.map((thumb) =>
        sharp(thumb)
          .resize(CELL_SIZE, CELL_SIZE, {
            fit: 'contain',
            background: { r: 17, g: 24, b: 39, alpha: 1 },
          })
          .png()
          .toBuffer(),
      ),
    );
    const target = pagePath(out, pages.length);
    const rows = Math.ceil(batch.length / COLUMNS);
    await atomicWebp(
      sharp({
        create: {
          width: COLUMNS * CELL_SIZE,
          height: rows * CELL_SIZE,
          channels: 3,
          background: '#111827',
        },
      }).composite(
        images.map((input, index) => ({
          input,
          left: (index % COLUMNS) * CELL_SIZE,
          top: Math.floor(index / COLUMNS) * CELL_SIZE,
        })),
      ),
      target,
    );
    pages.push(target);
  }
  return { pages };
}
