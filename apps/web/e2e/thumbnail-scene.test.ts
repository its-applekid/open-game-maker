// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  extractItchMedia,
  fetchStoreMedia,
  frameTimes,
  projectPoint,
  renderSceneOutputs,
  renderSpecimen,
  renderStill,
  selectSpecimenCards,
  videoArgs,
} from '../tools/thumbnail-scene.mjs';

const execFileAsync = promisify(execFile);

type TestCard = {
  id: string;
  kind: string;
  subkind: string;
  describe: { world: string };
  collection: string;
};

const card = (id: string, world: string, subkind: string): TestCard => ({
  id,
  kind: 'sprite',
  subkind,
  describe: { world },
  collection: `t1:${id.split(':')[1]!.split('/')[0]}@1.0`,
});

describe('thumbnail specimens and store references', () => {
  it('selects the same greedy coverage regardless of input order', () => {
    const cards = [
      card('t1:pack-a/characters/hero@1.0', 'fantasy', 'character'),
      card('t1:pack-a/tiles/grass@1.0', 'fantasy', 'tile'),
      card('t1:pack-b/characters/zombie@1.0', 'modern-zombie', 'character'),
      card('t1:pack-b/sequences/crate@1.0', 'modern-zombie', 'prop'),
    ];

    const expected = selectSpecimenCards(cards, { kind: 'set' }).map((item) => item.id);
    const reversed = selectSpecimenCards([...cards].reverse(), { kind: 'set' }).map((item) => item.id);

    expect(reversed).toEqual(expected);
    expect(new Set(expected)).toEqual(
      new Set(['t1:pack-a/tiles/grass@1.0', 't1:pack-b/sequences/crate@1.0', 't1:pack-a/characters/hero@1.0']),
    );
  });

  it('fails loudly when a pack has no renderable cards', () => {
    expect(() => selectSpecimenCards([], { kind: 'pack', id: 'smallscaleint-empty-pack' })).toThrow(
      'smallscaleint-empty-pack',
    );
  });

  it('extracts only public itch image media and ignores purchase links', () => {
    const html = `
      <meta property="og:image" content="https://img.itch.zone/aW1n/cover.png">
      <img src="//img.itch.zone/aW1n/demo.gif">
      <img src="https://example.com/tracker.png">
      <a href="https://smallscaleint.itch.io/game/purchase">Buy</a>
    `;

    expect(extractItchMedia(html, 'https://smallscaleint.itch.io/game')).toEqual([
      'https://img.itch.zone/aW1n/cover.png',
      'https://img.itch.zone/aW1n/demo.gif',
    ]);
  });

  it('fetches verified media atomically and selects a GIF fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-thumbnail-store-'));
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } })
      .png()
      .toBuffer();
    const gif = Buffer.from('GIF89a01010100', 'ascii');
    const pageUrl = 'https://smallscaleint.itch.io/game';
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url === pageUrl)
        return new Response(
          '<img src="https://img.itch.zone/demo.png"><img src="https://img.itch.zone/demo.gif">',
          { headers: { 'content-type': 'text/html' } },
        );
      if (url.endsWith('.png')) return new Response(png, { headers: { 'content-type': 'image/png' } });
      return new Response(gif, { headers: { 'content-type': 'image/gif' } });
    };

    const manifest = await fetchStoreMedia({
      root,
      packId: 'smallscaleint-game',
      pageUrl,
      fetchImpl,
      fetchedAt: '2026-11-01T00:00:00.000Z',
    });

    expect(manifest.selected_fallback).toMatch(/\.gif$/);
    expect(manifest.media).toHaveLength(2);
    expect(JSON.parse(await readFile(join(root, 'packs/smallscaleint-game/store/media.json'), 'utf8'))).toEqual(
      manifest,
    );
  });

  it('accepts a store page with more than 20 media items within the bounded cap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-thumbnail-store-'));
    const pageUrl = 'https://smallscaleint.itch.io/media-heavy-pack';
    const media = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        sharp({ create: { width: 2, height: 2, channels: 4, background: { r: index, g: 0, b: 0, alpha: 1 } } })
          .png()
          .toBuffer(),
      ),
    );
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url === pageUrl) {
        const images = media.map((_, index) => `<img src="https://img.itch.zone/media-${index}.png">`).join('');
        return new Response(images, { headers: { 'content-type': 'text/html' } });
      }
      const index = Number(/media-(\d+)\.png$/.exec(url)?.[1]);
      return new Response(media[index], { headers: { 'content-type': 'image/png' } });
    };

    const manifest = await fetchStoreMedia({ root, packId: 'smallscaleint-media-heavy-pack', pageUrl, fetchImpl });

    expect(manifest.media).toHaveLength(21);
  });

  it('rejects a redirect away from the allowlisted page host without replacing prior metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-thumbnail-store-'));
    const store = join(root, 'packs/smallscaleint-game/store');
    await mkdir(store, { recursive: true });
    await writeFile(join(store, 'media.json'), '{"preserved":true}\n');

    await expect(
      fetchStoreMedia({
        root,
        packId: 'smallscaleint-game',
        pageUrl: 'https://smallscaleint.itch.io/game',
        fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://example.com/' } }),
      }),
    ).rejects.toThrow(/redirect|host/i);
    expect(await readFile(join(store, 'media.json'), 'utf8')).toBe('{"preserved":true}\n');
  });
});

async function writeSprite(root: string, name: string, colour: string): Promise<void> {
  await sharp({ create: { width: 8, height: 8, channels: 4, background: colour } })
    .png()
    .toFile(join(root, 'packs/fixture-pack/1.0/extracted', name));
}

async function writeCard(root: string, rel: string, body: object): Promise<void> {
  const path = join(root, 'packs/fixture-pack/cards', `${rel}.card.json`);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(body)}\n`);
}

async function fixtureLibrary(): Promise<{ root: string; scene: Record<string, unknown> }> {
  const root = await mkdtemp(join(tmpdir(), 'ogm-thumbnail-scene-'));
  const extracted = join(root, 'packs/fixture-pack/1.0/extracted');
  await mkdir(extracted, { recursive: true });
  await writeFile(join(root, 'packs/fixture-pack/pack.json'), '{"current":"1.0"}\n');
  for (const [name, colour] of [
    ['ground.png', '#008000'],
    ['prop-a.png', '#ffa500'],
    ['prop-b.png', '#ffff00'],
    ['prop-c.png', '#800080'],
    ['hero-0.png', '#ff0000'],
    ['hero-1.png', '#0000ff'],
    ['enemy.png', '#000000'],
  ])
    await writeSprite(root, name, colour);

  const cards = [
    ['tiles/ground', 'tile', 'ground.png'],
    ['props/a', 'prop', 'prop-a.png'],
    ['props/b', 'prop', 'prop-b.png'],
    ['props/c', 'prop', 'prop-c.png'],
    ['characters/enemy', 'character', 'enemy.png'],
  ] as const;
  for (const [rel, subkind, file] of cards) {
    await writeCard(root, rel, {
      id: `t1:fixture-pack/${rel}@1.0`,
      kind: 'sprite',
      subkind,
      source: { files: [{ path: file }] },
      sprite: { facings: { S: file } },
    });
  }
  await writeCard(root, 'characters/hero', {
    id: 't1:fixture-pack/characters/hero@1.0',
    kind: 'sprite',
    subkind: 'character',
    source: { files: [{ path: 'hero-0.png' }, { path: 'hero-1.png' }] },
    sprite: {
      animations: [
        { name: 'idle', frames: [0, 1], directions: ['S'], direction_files: { S: ['hero-0.png', 'hero-1.png'] } },
      ],
    },
  });

  const layer = (id: string, kind: string, rel: string, grid: [number, number, number], z: number) => ({
    id,
    kind,
    card_id: `t1:fixture-pack/${rel}@1.0`,
    position: { grid, offset_px: [0, 0], scale: 2 },
    selection: { direction: 'S', frame: 0 },
    z_order: z,
  });
  const scene = {
    schema: 'ogm.thumbnail-scene/1.0',
    set_id: 'fixture-set',
    target: { kind: 'set', id: 'fixture-set', world: 'fantasy' },
    canvas: { width: 1024, height: 1024, background: '#c8c3b8' },
    camera: {
      projection: 'isometric-2:1',
      tile_px: [128, 64],
      origin_px: [512, 256],
      elevation_px: 32,
      pixel_snap: true,
    },
    lighting: { mode: 'source-baked', intensity: 1, tint: '#ffffff' },
    duration_ms: 4000,
    fps: 24,
    layers: [
      layer('ground', 'ground', 'tiles/ground', [4, 4, 0], 0),
      layer('prop-a', 'prop', 'props/a', [2, 4, 0], 10),
      layer('prop-b', 'prop', 'props/b', [6, 4, 0], 10),
      layer('prop-c', 'prop', 'props/c', [4, 2, 0], 10),
      {
        ...layer('hero', 'character', 'characters/hero', [4, 4, 0], 30),
        role: 'hero',
        selection: { action: 'idle', direction: 'S', frame: 0 },
        playback: { mode: 'loop', fps: 8, phase_frames: 0 },
      },
      { ...layer('enemy', 'character', 'characters/enemy', [6, 5, 0], 30), role: 'enemy' },
    ],
  };
  return { root, scene };
}

describe('headless thumbnail scene renderer', () => {
  it('uses the fixed projection and exact 96-frame timeline', () => {
    expect(projectPoint([4, 4, 0], [0, 0])).toEqual([512, 512]);
    expect(frameTimes()).toHaveLength(96);
    expect(frameTimes().at(-1)).toBeCloseTo(95 / 24);
  });

  it('builds bounded H.264 and looping GIF commands', () => {
    const args = videoArgs('frames/%03d.png', 'scene.mp4', 'scene.gif');
    expect(args.mp4).toEqual(
      expect.arrayContaining(['-framerate', '24', '-frames:v', '96', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']),
    );
    expect(args.gif.join(' ')).toContain('scale=256:256:flags=neighbor');
    expect(args.gif).toContain('-loop');
  });

  it('renders a validated scene with hard pixels and the hero at centre', async () => {
    const { root, scene } = await fixtureLibrary();
    const output = 'sets/fixture-set/diorama.fantasy.1024.png';

    await renderStill({ root, scene, output, softwareGL: true });

    const image = sharp(join(root, output));
    expect(await image.metadata()).toMatchObject({ width: 1024, height: 1024 });
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const centreAboveAnchor = (500 * info.width + 512) * info.channels;
    expect([...data.subarray(centreAboveAnchor, centreAboveAnchor + 3)]).toEqual([255, 0, 0]);
  }, 30_000);

  it('renders a byte-stable native-pixel specimen with no labels', async () => {
    const { root } = await fixtureLibrary();
    const relativeCards = ['tiles/ground', 'props/a', 'props/b', 'props/c', 'characters/hero', 'characters/enemy'];
    const cards = await Promise.all(
      relativeCards.map(async (relativeCard) => ({
        ...JSON.parse(await readFile(join(root, `packs/fixture-pack/cards/${relativeCard}.card.json`), 'utf8')),
        describe: { world: 'fantasy' },
      })),
    );

    await renderSpecimen({ root, cards, target: { kind: 'pack', id: 'fixture-pack' }, output: 'first.png' });
    await renderSpecimen({ root, cards: [...cards].reverse(), target: { kind: 'pack', id: 'fixture-pack' }, output: 'second.png' });

    expect(await readFile(join(root, 'first.png'))).toEqual(await readFile(join(root, 'second.png')));
  });

  it('encodes the exact four-second H.264 and looping GIF outputs', async () => {
    const { root, scene } = await fixtureLibrary();

    await renderSceneOutputs({ root, scene, outputBase: 'sets/fixture-set/diorama.fantasy', softwareGL: true });

    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,width,height,avg_frame_rate:format=duration',
      '-of',
      'json',
      join(root, 'sets/fixture-set/diorama.fantasy.1024.mp4'),
    ]);
    const probe = JSON.parse(stdout);
    expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 1024, height: 1024, avg_frame_rate: '24/1' });
    expect(Number(probe.format.duration)).toBeCloseTo(4, 3);
    expect((await readFile(join(root, 'sets/fixture-set/diorama.fantasy.256.gif'))).subarray(0, 6).toString()).toMatch(
      /^GIF8[79]a$/,
    );
  }, 120_000);
});
