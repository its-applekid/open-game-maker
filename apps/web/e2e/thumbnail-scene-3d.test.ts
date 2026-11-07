// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  batchTargets,
  buildPackScene,
  buildSetShowcase,
  checkShowcase3d,
  orbitCamera,
  previewBase,
  renderPackScene,
  renderShowcase3d,
  runBatch,
  sceneFrameTimes,
  selectSceneCards,
  splitCardId,
} from '../tools/thumbnail-scene-3d.mjs';
import { publishStagedShowcase } from '../../../scripts/assets/showcase/publish.mjs';
import { buildSceneFixture, json } from './fixtures/glb.mjs';

const ffmpegAvailable = ['ffmpeg', 'ffprobe'].every(
  (command) => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0,
);
const browserAvailable = existsSync(chromium.executablePath());

const card = (pack: string, key: string, subkind: string, set = 'fixture-set') => ({
  id: `t1:${pack}/${key}@1.0`,
  kind: 'model',
  subkind,
  describe: { set },
  collection: `t1:${pack}@1.0`,
});

const publicCollections = (packs: string[]) =>
  Object.fromEntries(
    packs.map((pack) => [
      `t1:${pack}@1.0`,
      { rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', basis: [] } },
    ]),
  );

describe('3D scene planner', () => {
  it('selects the same greedy kind/subkind coverage regardless of input order', () => {
    const cards = [
      card('pack-a', 'props/chair', 'prop'),
      card('pack-a', 'characters/hero', 'character'),
      card('pack-a', 'nature/tree', 'nature'),
      card('pack-a', 'buildings/house', 'building'),
    ];
    const expected = selectSceneCards(cards, { kind: 'pack', id: 'pack-a' }).map((item) => item.id);
    const reversed = selectSceneCards([...cards].reverse(), { kind: 'pack', id: 'pack-a' }).map((item) => item.id);
    expect(reversed).toEqual(expected);
    expect(expected).toHaveLength(4);
    expect(new Set(expected)).toEqual(new Set(cards.map((item) => item.id)));
  });

  it('caps a pack scene at six cards and fails loudly when a pack has fewer than three', () => {
    const many = Array.from({ length: 9 }, (_, index) => card('pack-a', `props/prop-${index}`, `kind-${index}`));
    expect(selectSceneCards(many, { kind: 'pack', id: 'pack-a' })).toHaveLength(6);
    expect(() => selectSceneCards([card('pack-a', 'props/only', 'prop')], { kind: 'pack', id: 'pack-a' })).toThrow(
      'no renderable 3D cards',
    );
  });

  it('builds a square 1024 px pack scene with a whole 96-frame loop', () => {
    const cards = [
      card('pack-a', 'props/chair', 'prop'),
      card('pack-a', 'characters/hero', 'character'),
      card('pack-a', 'nature/tree', 'nature'),
    ];
    const scene = buildPackScene({ cards, target: { kind: 'pack', id: 'pack-a' }, set: 'fixture-set' });
    expect(scene.canvas).toEqual({ width: 1024, height: 1024, background: '#e9e1cc' });
    expect(scene.items).toHaveLength(3);
    expect(sceneFrameTimes(scene)).toHaveLength(96);
    expect(sceneFrameTimes(scene).at(-1)).toBeCloseTo(95 / 24);
  });

  it('orbits the camera around its target without changing the target', () => {
    const camera = { position: [6, 4, 6], target: [0, 1, 0] };
    const quarter = orbitCamera(camera, Math.PI / 2);
    expect(quarter.target).toEqual([0, 1, 0]);
    expect(quarter.position[1]).toBeCloseTo(4);
    expect(Math.hypot(quarter.position[0], quarter.position[2])).toBeCloseTo(Math.hypot(6, 6));
  });

  it('keeps a preview private when any source resolves to redistribution none or a private audience', () => {
    const cards = [card('pack-a', 'props/chair', 'prop'), card('pack-b', 'props/crate', 'prop')];
    const collections = publicCollections(['pack-a', 'pack-b']);
    expect(previewBase({ cards, collections, base: 'packs/pack-a/scene' })).toBe('packs/pack-a/scene');
    collections['t1:pack-b@1.0'] = {
      rights: { uses: ['in-game'], audience: 'private', redistribution: 'none', basis: [] },
    };
    expect(previewBase({ cards, collections, base: 'packs/pack-a/scene' })).toBe('private/packs/pack-a/scene');
    expect(previewBase({ cards, collections: {}, base: 'packs/pack-a/scene' })).toBe('private/packs/pack-a/scene');
  });

  it('plans a closed route with one point per stop and a constant speed', () => {
    const cards = [
      card('pack-a', 'characters/hero', 'character'),
      card('pack-a', 'props/crate', 'prop'),
      card('pack-b', 'characters/guard', 'character'),
      card('pack-b', 'props/barrel', 'prop'),
    ];
    const { sequence, world, sheets } = buildSetShowcase({ cards, set: 'fixture-set', fps: 4, framesPerStop: 2 });
    expect(sequence.stops).toHaveLength(2);
    expect(sequence.runner.path.points).toHaveLength(3);
    expect(sequence.runner.path.points[0]).toEqual(sequence.runner.path.points.at(-1));
    expect(sequence.loop_seconds).toBeCloseTo(1);
    expect(world.items).toHaveLength(2);
    expect([...sheets.keys()]).toEqual(['pack-a', 'pack-b']);
    for (const sheet of sheets.values()) {
      expect(sheet.models).toHaveLength(1);
    }
  });

  it('reports uncovered packs and cards reused across the world and a sheet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-check-'));
    const cards = [
      card('pack-a', 'characters/hero', 'character'),
      card('pack-a', 'props/crate', 'prop'),
      card('pack-b', 'characters/guard', 'character'),
      card('pack-b', 'props/barrel', 'prop'),
    ];
    const { sequence, world, sheets } = buildSetShowcase({ cards, set: 'fixture-set', fps: 4, framesPerStop: 2 });
    const sequencePath = 'sets/fixture-set/showcase.sequence.json';
    const worldPath = join(root, 'sets/fixture-set/world.json');
    const sheetPath = (id: string) => join(root, `sets/fixture-set/sheets/${id}.json`);
    await json(join(root, sequencePath), sequence);
    await json(worldPath, world);
    for (const [id, sheet] of sheets) await json(sheetPath(id), sheet);

    const clean = await checkShowcase3d({ root, sequencePath });
    expect(clean.issues).toEqual([]);

    await json(join(root, sequencePath), { ...sequence, required_packs: ['pack-a', 'pack-b', 'pack-c'] });
    const missing = await checkShowcase3d({ root, sequencePath });
    expect(missing.issues.map((issue: { code: string }) => issue.code)).toContain('pack.uncovered');
    await json(join(root, sequencePath), sequence);

    const duplicated = structuredClone(world);
    duplicated.items.push({ ...duplicated.items[0], id: 'duplicate' });
    await json(worldPath, duplicated);
    await expect(checkShowcase3d({ root, sequencePath })).rejects.toThrow('at most once');
    await json(worldPath, world);

    const sheet = sheets.get('pack-a')!;
    await json(sheetPath('pack-a'), {
      ...sheet,
      models: [{ ...sheet.models[0], card_id: world.items[0].card_id }],
    });
    const overlap = await checkShowcase3d({ root, sequencePath });
    expect(overlap.issues.map((issue: { code: string }) => issue.code)).toContain('world.sheet_overlap');
  });

  it('splits a versioned card id into its pack and key', () => {
    expect(splitCardId('t1:kenney-mini-dungeon/props/chair@1.0')).toEqual({
      pack: 'kenney-mini-dungeon',
      key: 'props/chair',
      version: '1.0',
    });
    expect(() => splitCardId('not-a-card')).toThrow('invalid asset-card id');
  });
});

describe('3D batch driver', () => {
  it('selects packs with three models and sets with two multi-card packs', () => {
    const packs = [
      {
        pack: 'pack-a',
        cards: [card('pack-a', 'characters/hero', 'character'), card('pack-a', 'props/crate', 'prop')],
      },
      {
        pack: 'pack-b',
        cards: [
          card('pack-b', 'characters/guard', 'character'),
          card('pack-b', 'props/barrel', 'prop'),
          card('pack-b', 'nature/tree', 'nature'),
        ],
      },
      { pack: 'pack-c', cards: [card('pack-c', 'props/lamp', 'prop', 'other-set')] },
    ];
    const { packTargets, setTargets } = batchTargets({ packs });
    expect(packTargets.map((target: { id: string }) => target.id)).toEqual(['pack-b']);
    expect(setTargets.map((target: { id: string; ready: boolean }) => [target.id, target.ready])).toEqual([
      ['fixture-set', true],
      ['other-set', false],
    ]);
    const narrowed = batchTargets({ packs, onlyPacks: ['pack-a'], onlySets: ['fixture-set'] });
    expect(narrowed.packTargets).toEqual([]);
    expect(narrowed.setTargets.map((target: { id: string }) => target.id)).toEqual(['fixture-set']);
  });

  it.skipIf(!browserAvailable || !ffmpegAvailable)(
    'renders a filtered pack scene and set showcase in one batch run (skipped when Chromium or ffmpeg is absent)',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-batch-'));
      await buildSceneFixture(root);
      const results = await runBatch({
        root,
        onlyPacks: ['fixture-pack-a'],
        onlySets: ['fixture-set'],
        durationMs: 1000,
        fps: 4,
        framesPerStop: 2,
        softwareGL: true,
      });
      expect(
        results.map((result: { kind: string; id: string; ok: boolean; base?: string; error?: string }) => [
          result.kind,
          result.id,
          result.ok,
          result.base ?? '',
          result.error ?? '',
        ]),
      ).toEqual([
        ['pack', 'fixture-pack-a', true, 'packs/fixture-pack-a/scene', ''],
        ['set', 'fixture-set', true, 'sets/fixture-set/showcase', ''],
      ]);
      const manifest = JSON.parse(await readFile(join(root, 'sets/fixture-set/manifest.json'), 'utf8'));
      expect(manifest.schema).toBe('ogm.set-showcase-media/3');
    },
    240_000,
  );
});

describe('3D rights gate', () => {
  it('refuses to render a private pack scene under a public base', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-rights-pack-'));
    const { cards } = await buildSceneFixture(root);
    await json(join(root, 'packs/fixture-pack-a/collection.card.json'), {
      schema: 'ogm.asset-card/1.0',
      id: 't1:fixture-pack-a@1.0',
      card_type: 'collection',
      rights: { uses: ['in-game'], audience: 'private', redistribution: 'none', basis: [] },
    });
    const scene = buildPackScene({ cards, target: { kind: 'pack', id: 'fixture-pack-a' }, set: 'fixture-set' });
    await expect(
      renderPackScene({ root, scene, outputBase: 'packs/fixture-pack-a/scene', softwareGL: true }),
    ).rejects.toThrow('rights require the preview base private/packs/fixture-pack-a/scene');
  });

  it('refuses to render a private set showcase under a public base', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-rights-set-'));
    const { cards } = await buildSceneFixture(root);
    await json(join(root, 'packs/fixture-pack-b/collection.card.json'), {
      schema: 'ogm.asset-card/1.0',
      id: 't1:fixture-pack-b@1.0',
      card_type: 'collection',
      rights: { uses: ['in-game'], audience: 'private', redistribution: 'none', basis: [] },
    });
    const { sequence, world, sheets } = buildSetShowcase({ cards, set: 'fixture-set', fps: 4, framesPerStop: 2 });
    const base = 'sets/fixture-set/showcase';
    await json(join(root, `${base}.sequence.json`), sequence);
    await json(join(root, 'sets/fixture-set/world.json'), world);
    for (const [id, sheet] of sheets) await json(join(root, `sets/fixture-set/sheets/${id}.json`), sheet);
    await expect(
      renderShowcase3d({ root, sequencePath: `${base}.sequence.json`, outputBase: base, softwareGL: true }),
    ).rejects.toThrow('rights require the preview base private/sets/fixture-set/showcase');
  });
});

describe('3D showcase publication', () => {
  it('publishes a version 3 manifest and removes the media its previous manifest owned', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-publish-'));
    const output = join(root, 'sets/fixture-set');
    await mkdir(output, { recursive: true });
    const first = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-staging-a-'));
    await writeFile(join(first, 'old.region.1024.mp4'), 'stale');
    await writeFile(join(first, 'shared.sheet.poster.png'), 'poster');
    await writeFile(
      join(first, 'manifest.json'),
      `${JSON.stringify({ schema: 'ogm.set-showcase-media/3', tracks: { region: { mp4: 'old.region.1024.mp4' } } })}\n`,
    );
    await publishStagedShowcase({ staging: first, output });
    expect(await readFile(join(output, 'old.region.1024.mp4'), 'utf8')).toBe('stale');

    const second = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-staging-b-'));
    await writeFile(join(second, 'shared.sheet.poster.png'), 'fresh');
    await writeFile(
      join(second, 'manifest.json'),
      `${JSON.stringify({ schema: 'ogm.set-showcase-media/3', tracks: { sheet: { poster: 'shared.sheet.poster.png' } } })}\n`,
    );
    await publishStagedShowcase({ staging: second, output });

    expect(await readFile(join(output, 'shared.sheet.poster.png'), 'utf8')).toBe('fresh');
    await expect(readFile(join(output, 'old.region.1024.mp4'), 'utf8')).rejects.toThrow('ENOENT');
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    expect(manifest.tracks.sheet.poster).toBe('shared.sheet.poster.png');
  });
});

describe('3D scene renderer', () => {
  it.skipIf(!browserAvailable)(
    'renders a square 1024 px pack still from a card-backed scene (skipped when Chromium is absent)',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-render-'));
      const { cards } = await buildSceneFixture(root);
      const scene = buildPackScene({ cards, target: { kind: 'pack', id: 'fixture-pack-a' }, set: 'fixture-set' });
      await renderPackScene({ root, scene, outputBase: 'packs/fixture-pack-a/scene', softwareGL: true });
      const metadata = await sharp(join(root, 'packs/fixture-pack-a/scene.1024.png')).metadata();
      expect(metadata).toMatchObject({ width: 1024, height: 1024 });
      const stats = await sharp(join(root, 'packs/fixture-pack-a/scene.1024.png')).stats();
      expect(stats.channels[0].stdev).toBeGreaterThan(1);
      const small = await sharp(join(root, 'packs/fixture-pack-a/scene.256.png')).metadata();
      expect(small).toMatchObject({ width: 256, height: 256 });
    },
    120_000,
  );

  it.skipIf(!browserAvailable || !ffmpegAvailable)(
    'encodes the pack loop as H.264 and a looping GIF (skipped when Chromium or ffmpeg is absent)',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-loop-'));
      const { cards } = await buildSceneFixture(root);
      const scene = buildPackScene({
        cards,
        target: { kind: 'pack', id: 'fixture-pack-a' },
        set: 'fixture-set',
        durationMs: 1000,
        fps: 4,
      });
      await renderPackScene({ root, scene, outputBase: 'packs/fixture-pack-a/scene', softwareGL: true });
      const mp4 = await readFile(join(root, 'packs/fixture-pack-a/scene.1024.mp4'));
      expect(mp4.subarray(4, 8).toString()).toBe('ftyp');
      const gif = await readFile(join(root, 'packs/fixture-pack-a/scene.256.gif'));
      expect(gif.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
    },
    120_000,
  );

  it.skipIf(!browserAvailable || !ffmpegAvailable)(
    'renders a continuous set showcase with both shared tracks and a manifest (skipped when Chromium or ffmpeg is absent)',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'ogm-scene-3d-showcase-'));
      const { cards } = await buildSceneFixture(root);
      const { sequence, world, sheets } = buildSetShowcase({
        cards,
        set: 'fixture-set',
        fps: 4,
        framesPerStop: 2,
      });
      const base = 'sets/fixture-set/showcase';
      await json(join(root, `${base}.sequence.json`), sequence);
      await json(join(root, 'sets/fixture-set/world.json'), world);
      for (const [id, sheet] of sheets) await json(join(root, `sets/fixture-set/sheets/${id}.json`), sheet);

      const manifest = await renderShowcase3d({
        root,
        sequencePath: `${base}.sequence.json`,
        outputBase: base,
        softwareGL: true,
      });
      expect(manifest.schema).toBe('ogm.set-showcase-media/3');
      expect(manifest.tracks.region.mp4).toBe('showcase.region.1024.mp4');
      expect(manifest.stops).toHaveLength(2);
      const written = JSON.parse(await readFile(join(root, 'sets/fixture-set/manifest.json'), 'utf8'));
      expect(written).toEqual(manifest);
      const poster = await sharp(join(root, 'sets/fixture-set/showcase.region.poster.png')).metadata();
      expect(poster).toMatchObject({ width: 1024, height: 1024 });
      const sheetPoster = await sharp(join(root, 'sets/fixture-set/showcase.sheet.poster.png')).metadata();
      expect(sheetPoster).toMatchObject({ width: 1024, height: 1024 });
      const published = await readdir(join(root, 'sets/fixture-set'));
      expect(published.filter((file) => /^(region|sheet)-\d{3}\.png$/.test(file))).toEqual([]);
    },
    180_000,
  );
});
