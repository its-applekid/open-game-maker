import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, writeIndex } from '@ogm/asset-cards';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { catalogRoutes, prefix, type StyleFamilyApi } from '../src/catalog/routes.js';
import { makeApp, makeDeps } from './helpers.js';

const FIXTURE = fileURLToPath(new URL('../../../packages/asset-cards/test/fixtures/library', import.meta.url));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** A writable fixture library; `thumbs` records imported thumb blobs on index entries the way OGM-067 does. */
async function library(thumbs: Record<string, { hash: string; visibility?: string }> = {}): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'ogm-api-catalog-'));
  cpSync(FIXTURE, root, { recursive: true });
  const index = await buildIndex(root);
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

function appWith(assetsRoot: string | undefined) {
  const deps = makeDeps();
  const app = createApp(deps);
  app.route(prefix, catalogRoutes({ assetsRoot }));
  return { app, deps };
}

const get = async (app: ReturnType<typeof appWith>['app'], headers: Record<string, string> = {}) =>
  app.request('/api/catalog/style-families', { headers });

const packOf = (families: StyleFamilyApi[], id: string) =>
  families.flatMap((f) => f.packs).find((pack) => pack.id === id);

describe('GET /api/catalog/style-families', () => {
  it('is mounted by the route scan and needs no principal', async () => {
    const { app } = await makeApp();
    const response = await app.request('/api/catalog/style-families');
    expect(response.status).toBe(200);
    expect(((await response.json()) as StyleFamilyApi[]).length).toBe(7);
  });

  it('returns the seven families with Synty ones not offered, pack names from collection cards, and an ETag', async () => {
    const { app } = appWith(await library());
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
    const polygon = families
      .find((family) => family.id === 'detailed-low-poly')
      ?.sets.find((set) => set.id === 'synty-polygon');
    expect(polygon).toMatchObject({
      label: 'Synty POLYGON',
      vendors: ['synty'],
      traits: expect.objectContaining({ perspective: '3d' }),
    });
    expect(polygon?.packs.map((pack) => pack.id)).toContain('synty-polygon-goblin-war-camp');
    expect(polygon?.packs.find((pack) => pack.id === 'synty-polygon-goblin-war-camp')?.thumbnailUrl).toBeNull();
    const smallscaleint = families
      .find((family) => family.id === 'isometric-2d')
      ?.sets.find((set) => set.id === 'smallscaleint');
    expect(smallscaleint).toBeDefined();
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
  });
});
