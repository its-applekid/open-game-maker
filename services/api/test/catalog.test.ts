import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, loadFamilies, writeIndex } from '@ogm/asset-cards';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { catalogRoutes, prefix, setRequiresPrivateRepository, type StyleFamilyApi } from '../src/catalog/routes.js';
import { asUser, installUsers, makeApp, makeDeps } from './helpers.js';

const FIXTURE = fileURLToPath(new URL('../../../packages/asset-cards/test/fixtures/library', import.meta.url));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const CREATOR = {
  kind: 'user' as const,
  userId: 'u_catalog_creator',
  email: 'catalog@example.test',
  displayName: 'Catalog Creator',
  familyId: null,
  platformRole: 'none' as const,
  capability: 'creator' as const,
};

/** A writable fixture library; `thumbs` records imported thumb blobs on index entries the way OGM-067 does. */
async function library(
  thumbs: Record<string, { hash: string; visibility?: string }> = {},
  publicPacks: string[] = [],
): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'ogm-api-catalog-'));
  cpSync(FIXTURE, root, { recursive: true });
  const index = await buildIndex(root);
  const publicTemplate = Object.values(index.collections).find((card) => card.resolved.license === 'CC0-1.0');
  if (!publicTemplate) throw new Error('fixture needs a public collection');
  for (const pack of publicPacks) {
    if (Object.values(index.collections).some((card) => card.id.startsWith(`t1:${pack}@`))) continue;
    const card = structuredClone(publicTemplate);
    card.id = `t1:${pack}@fixture`;
    card.title = `${pack} fixture`;
    index.collections[card.id] = card;
    index.cards.push(card);
  }
  for (const [pack, { hash, visibility }] of Object.entries(thumbs)) {
    const card = Object.values(index.collections).find((c) => c.id.startsWith(`t1:${pack}@`));
    if (!card) throw new Error(`no fixture collection ${pack}`);
    Object.assign(card, {
      previews: { ...card.previews, blob: { thumb: hash } },
      ...(visibility ? { visibility } : {}),
    });
  }
  await writeIndex(root, index);
  return root;
}

async function libraryWithShowcase(): Promise<string> {
  const root = await library();
  const showcase = join(root, 'sets', 'smallscaleint', 'showcase');
  const media = join(showcase, 'out', 'media');
  mkdirSync(media, { recursive: true });
  writeFileSync(
    join(showcase, 'sequence.json'),
    JSON.stringify({
      stops: [
        { tile: 'fantasy', sheet: 'fantasy', seconds: 7.5 },
        { tile: 'modern-zombie', sheet: 'modern-zombie', seconds: 4 },
      ],
    }),
  );
  writeFileSync(join(media, 'showcase.tiles-row.720.mp4'), new Uint8Array([0, 1, 2, 3, 4, 5]));
  writeFileSync(join(media, 'showcase.sheets.720.mp4'), new Uint8Array([6, 7, 8, 9]));
  writeFileSync(join(media, '1-fantasy.tile.256.gif'), new Uint8Array([10, 11]));
  writeFileSync(join(media, '1-fantasy.sheet.256.gif'), new Uint8Array([12, 13]));
  writeFileSync(join(media, '2-modern-zombie.tile.256.gif'), new Uint8Array([14, 15]));
  writeFileSync(join(media, '2-modern-zombie.sheet.256.gif'), new Uint8Array([16, 17]));
  return root;
}

function appWith(assetsRoot: string | undefined) {
  const deps = makeDeps();
  installUsers(deps, [CREATOR]);
  const app = createApp(deps);
  app.route(prefix, catalogRoutes({ assetsRoot }));
  return { app, deps };
}

const get = async (app: ReturnType<typeof appWith>['app'], headers: Record<string, string> = {}) =>
  app.request('/api/catalog/style-families', { headers });

const packOf = (families: StyleFamilyApi[], id: string) =>
  families.flatMap((f) => f.packs).find((pack) => pack.id === id);

const packsOfSet = (id: string) => {
  const set = loadFamilies()
    .flatMap((family) => family.sets)
    .find((candidate) => candidate.id === id);
  if (!set) throw new Error(`no style set ${id}`);
  return set.packs.map((pack) => pack.id);
};

describe('setRequiresPrivateRepository', () => {
  it('allows a set only when every pack resolves to a public SPDX license', () => {
    const licenses = new Map([
      ['terrain', 'CC0-1.0'],
      ['characters', 'kenney'],
    ]);

    expect(setRequiresPrivateRepository([...licenses.keys()], (pack) => licenses.get(pack))).toBe(false);
  });

  it('requires privacy for LicenseRef, unknown, and unresolved pack licenses', () => {
    expect(setRequiresPrivateRepository(['vendor'], () => 'LicenseRef-synty-personal')).toBe(true);
    expect(setRequiresPrivateRepository(['public-vendor'], () => 'ansimuz-free-commercial')).toBe(true);
    expect(setRequiresPrivateRepository(['unknown'], () => 'not-in-the-license-catalog')).toBe(true);
    expect(setRequiresPrivateRepository(['missing'], () => undefined)).toBe(true);
  });
});

describe('GET /api/catalog/style-families', () => {
  it('is mounted by the route scan and needs no principal', async () => {
    const { app } = await makeApp();
    const response = await app.request('/api/catalog/style-families');
    expect(response.status).toBe(200);
    expect(((await response.json()) as StyleFamilyApi[]).length).toBe(7);
  });

  it('returns the seven families with Synty ones not offered, pack names from collection cards, and an ETag', async () => {
    const { app } = appWith(await library({}, packsOfSet('kenney-tiny')));
    const response = await get(app);
    expect(response.status).toBe(200);
    const families = (await response.json()) as StyleFamilyApi[];
    expect(families.map((f) => f.id)).toEqual([
      'chunky-low-poly',
      'detailed-low-poly',
      'simple-low-poly',
      'pixel-art',
      'flat-cartoon',
      'isometric-2d',
      'sketch',
    ]);
    const offered = Object.fromEntries(families.map((f) => [f.id, f.creationChoice]));
    expect(offered['detailed-low-poly']).toBe(false);
    expect(offered['simple-low-poly']).toBe(false);
    expect(offered['chunky-low-poly']).toBe(true);
    expect(packOf(families, 'kenney-mini-dungeon')).toEqual({
      id: 'kenney-mini-dungeon',
      name: 'Mini Dungeon (Kenney)',
      thumbnailUrl: null,
    });
    expect(packOf(families, 'kenney-castle-kit')?.name).toBe('kenney-castle-kit');
    const tiny = families.find((family) => family.id === 'pixel-art')?.sets.find((set) => set.id === 'kenney-tiny');
    expect(tiny?.requiresPrivateRepository).toBe(false);
    const polygon = families
      .find((family) => family.id === 'detailed-low-poly')
      ?.sets.find((set) => set.id === 'synty-polygon');
    expect(polygon).toMatchObject({
      label: 'Synty POLYGON',
      vendors: ['synty'],
      traits: expect.objectContaining({ perspective: '3d' }),
      requiresPrivateRepository: true,
    });
    expect(polygon?.packs.map((pack) => pack.id)).toContain('synty-polygon-goblin-war-camp');
    expect(polygon?.packs.find((pack) => pack.id === 'synty-polygon-goblin-war-camp')?.thumbnailUrl).toBeNull();
    const smallscaleint = families
      .find((family) => family.id === 'isometric-2d')
      ?.sets.find((set) => set.id === 'smallscaleint');
    expect(smallscaleint).toBeDefined();
    expect(smallscaleint?.pickerFamilies).toEqual(['pixel-art']);
    expect(smallscaleint?.showcase).toBeUndefined();
    expect(smallscaleint).not.toHaveProperty('previews');
    expect(Object.keys(families[0]).sort()).toEqual(
      ['coverage', 'creationChoice', 'dimension', 'fidelity', 'id', 'label', 'packs', 'sets', 'views'].sort(),
    );

    const etag = response.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const again = await get(app, { 'if-none-match': etag as string });
    expect(again.status).toBe(304);
  });

  it('signs a public collection thumb the blob store holds, and never a private one', async () => {
    const { deps } = appWith(undefined);
    const ref = await deps.blobStore.put(PNG, 'image/png');
    const root = await library({
      'kenney-mini-dungeon': { hash: ref.hash, visibility: 'library' },
      'synty-polygon-goblin-war-camp': { hash: ref.hash, visibility: 'library' },
    });
    const app = createApp(deps);
    app.route(prefix, catalogRoutes({ assetsRoot: root }));
    const families = (await (await get(app)).json()) as StyleFamilyApi[];
    const url = packOf(families, 'kenney-mini-dungeon')?.thumbnailUrl;
    expect(url).toMatch(/\/blobs\/sha256\/[0-9a-f]{64}\?exp=\d+&sig=[0-9a-f]{64}$/);
    // Valid well past the server cache (5 min) plus the client max-age (300 s).
    expect(Number(new URL(url as string).searchParams.get('exp'))).toBeGreaterThan(Date.now() / 1000 + 86_400);
    expect(packOf(families, 'synty-polygon-goblin-war-camp')?.thumbnailUrl).toBeNull();
  });

  it('returns null when the imported thumb blob is not in the store or was imported as private', async () => {
    const missing = appWith(await library({ 'kenney-mini-dungeon': { hash: `sha256:${'0'.repeat(64)}` } }));
    const absent = (await (await get(missing.app)).json()) as StyleFamilyApi[];
    expect(packOf(absent, 'kenney-mini-dungeon')?.thumbnailUrl).toBeNull();

    const { deps } = appWith(undefined);
    const ref = await deps.blobStore.put(PNG, 'image/png');
    const root = await library({ 'kenney-mini-dungeon': { hash: ref.hash, visibility: 'private' } });
    const privateApp = createApp(deps);
    privateApp.route(prefix, catalogRoutes({ assetsRoot: root }));
    const families = (await (await get(privateApp)).json()) as StyleFamilyApi[];
    expect(packOf(families, 'kenney-mini-dungeon')?.thumbnailUrl).toBeNull();
  });

  it('returns null thumbnails and pack ids as names without an asset library', async () => {
    const { app } = appWith(undefined);
    const families = (await (await get(app)).json()) as StyleFamilyApi[];
    expect(families.flatMap((f) => f.packs).every((pack) => pack.thumbnailUrl === null && pack.name === pack.id)).toBe(
      true,
    );
    expect(families.flatMap((family) => family.sets).every((set) => set.requiresPrivateRepository)).toBe(true);
  });

  it('discovers pre-rendered showcase tracks and serves authenticated byte ranges', async () => {
    const { app } = appWith(await libraryWithShowcase());
    const families = (await (await get(app)).json()) as StyleFamilyApi[];
    const showcase = families
      .find((family) => family.id === 'isometric-2d')
      ?.sets.find((set) => set.id === 'smallscaleint')?.showcase;

    expect(showcase).toEqual({
      tileVideoUrl: '/api/catalog/style-sets/smallscaleint/showcase/showcase.tiles-row.720.mp4',
      sheetVideoUrl: '/api/catalog/style-sets/smallscaleint/showcase/showcase.sheets.720.mp4',
      stops: [
        {
          id: 'fantasy',
          label: 'Fantasy',
          startSeconds: 0,
          tileFallbackUrl: '/api/catalog/style-sets/smallscaleint/showcase/1-fantasy.tile.256.gif',
          sheetFallbackUrl: '/api/catalog/style-sets/smallscaleint/showcase/1-fantasy.sheet.256.gif',
        },
        {
          id: 'modern-zombie',
          label: 'Modern zombie',
          startSeconds: 7.5,
          tileFallbackUrl: '/api/catalog/style-sets/smallscaleint/showcase/2-modern-zombie.tile.256.gif',
          sheetFallbackUrl: '/api/catalog/style-sets/smallscaleint/showcase/2-modern-zombie.sheet.256.gif',
        },
      ],
    });

    const url = showcase!.tileVideoUrl!;
    expect((await app.request(url)).status).toBe(401);
    const full = await app.request(url, { headers: asUser(CREATOR.userId) });
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect(full.headers.get('content-length')).toBe('6');
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(full.headers.get('cache-control')).toBe('private, max-age=300');
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5]));

    const partial = await app.request(url, { headers: { ...asUser(CREATOR.userId), range: 'bytes=2-4' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-4/6');
    expect(partial.headers.get('content-length')).toBe('3');
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4]));

    const unsatisfiable = await app.request(url, {
      headers: { ...asUser(CREATOR.userId), range: 'bytes=7-9' },
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */6');
  });

  it('refuses malformed ranges and files outside the discovered showcase allowlist', async () => {
    const { app } = appWith(await libraryWithShowcase());
    const headers = asUser(CREATOR.userId);
    const base = '/api/catalog/style-sets/smallscaleint/showcase/';

    expect((await app.request(`${base}sequence.json`, { headers })).status).toBe(404);
    expect(
      (await app.request(`${base}showcase.tiles-row.720.mp4`, { headers: { ...headers, range: 'wat' } })).status,
    ).toBe(416);
    expect(
      (await app.request('/api/catalog/style-sets/unknown/showcase/showcase.tiles-row.720.mp4', { headers })).status,
    ).toBe(404);
  });
});
