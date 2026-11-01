import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import opentype from 'opentype.js';
import { afterEach, describe, expect, it } from 'vitest';

import { measureFont } from '../src/index.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('measureFont', () => {
  it('reports names, glyph coverage, count, and proportional spacing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asset-measure-font-'));
    temporary.push(dir);
    const file = join(dir, 'fixture.ttf');
    const glyphs = [
      new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() }),
      ...Array.from({ length: 128 }, (_, index) =>
        new opentype.Glyph({
          name: `g${index + 32}`,
          unicode: index + 32,
          advanceWidth: 400 + (index % 3) * 50,
          path: new opentype.Path(),
        }),
      ),
    ];
    const font = new opentype.Font({
      familyName: 'Fixture Sans',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      glyphs,
    });
    await writeFile(file, Buffer.from(font.toArrayBuffer()));

    const measured = await measureFont(file);
    expect(measured).toMatchObject({
      family: 'Fixture Sans',
      style: 'Regular',
      glyph_count: 129,
      monospace: false,
      formats: ['ttf'],
    });
    expect(measured.glyph_ranges).toContain('basic-latin');
  });
});
