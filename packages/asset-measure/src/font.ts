import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import opentype from 'opentype.js';
import type { Font } from '@ogm/contracts';

type GlyphRange = Font['glyph_ranges'][number];

function rangeFor(codepoint: number): GlyphRange | undefined {
  if (codepoint >= 0x20 && codepoint <= 0x7e) return 'basic-latin';
  if (codepoint >= 0xa0 && codepoint <= 0xff) return 'latin-1';
  if (codepoint >= 0x100 && codepoint <= 0x17f) return 'latin-ext-a';
  if (codepoint >= 0x180 && codepoint <= 0x24f) return 'latin-ext-b';
  if (codepoint >= 0x370 && codepoint <= 0x3ff) return 'greek';
  if (codepoint >= 0x400 && codepoint <= 0x52f) return 'cyrillic';
  if (codepoint >= 0x4e00 && codepoint <= 0x9fff) return 'cjk';
  if (codepoint >= 0x2000) return 'symbols';
  return undefined;
}

export async function measureFont(file: string): Promise<Font> {
  const bytes = await readFile(file);
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const font = opentype.parse(array);
  const widths = new Set<number>();
  const ranges = new Set<GlyphRange>();
  for (let index = 0; index < font.glyphs.length; index += 1) {
    const glyph = font.glyphs.get(index);
    if (glyph.advanceWidth) widths.add(glyph.advanceWidth);
    for (const codepoint of glyph.unicodes ?? []) {
      const range = rangeFor(codepoint);
      if (range) ranges.add(range);
    }
  }
  const extension = extname(file).slice(1).toLowerCase();
  const format = ['ttf', 'otf', 'woff', 'woff2'].includes(extension) ? (extension as Font['formats'][number]) : 'ttf';
  return {
    family: font.getEnglishName('fontFamily') || 'Unknown',
    style: font.getEnglishName('fontSubfamily') || 'Regular',
    ...(font.tables.os2?.usWeightClass ? { weight: font.tables.os2.usWeightClass } : {}),
    glyph_ranges: [...ranges],
    glyph_count: font.glyphs.length,
    monospace: widths.size <= 1,
    pixel_font_px: null,
    formats: [format],
  };
}
