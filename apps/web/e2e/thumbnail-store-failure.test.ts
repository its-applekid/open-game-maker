// @vitest-environment node
import { mkdtemp, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { fetchStoreMedia } from '../tools/thumbnail-store.mjs';

describe('thumbnail store publication', () => {
  it('rejects a non-slug pack id before fetching', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-thumbnail-store-'));

    await expect(
      fetchStoreMedia({
        root,
        packId: '../sets/smallscaleint',
        pageUrl: 'https://smallscaleint.itch.io/game',
        fetchImpl: async () => {
          throw new Error('fetch must not run');
        },
      }),
    ).rejects.toThrow('pack id must be a slug');
  });

  it('cleans the staged manifest when final publication fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-thumbnail-store-'));
    const store = join(root, 'packs/smallscaleint-game/store');
    await mkdir(join(store, 'media.json'), { recursive: true });
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } })
      .png()
      .toBuffer();
    const pageUrl = 'https://smallscaleint.itch.io/game';

    await expect(
      fetchStoreMedia({
        root,
        packId: 'smallscaleint-game',
        pageUrl,
        fetchImpl: async (input: string | URL | Request) =>
          String(input) === pageUrl
            ? new Response('<img src="https://img.itch.zone/demo.png">', {
                headers: { 'content-type': 'text/html' },
              })
            : new Response(png, { headers: { 'content-type': 'image/png' } }),
      }),
    ).rejects.toThrow();
    expect((await readdir(store)).filter((name) => name.startsWith('.media-'))).toEqual([]);
  });
});
