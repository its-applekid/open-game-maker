import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, writeIndex } from '@ogm/asset-cards';
import { styleShowcaseSchema } from '@ogm/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { catalogRoutes, prefix, type StyleFamilyApi } from '../src/catalog/routes.js';
import { asUser, installUsers, makeDeps } from './helpers.js';

const FIXTURE = fileURLToPath(new URL('../../../packages/asset-cards/test/fixtures/library', import.meta.url));
const roots: string[] = [];
const CREATOR = {
  kind: 'user' as const,
  userId: 'u_catalog_v6_creator',
  email: 'catalog-v6@example.test',
  displayName: 'Catalog V6 Creator',
  familyId: null,
  platformRole: 'none' as const,
  capability: 'creator' as const,
};

const media = (id: string, kind: 'region' | 'sheet') => ({
  mp4: `${id}.${kind}.720.mp4`,
  gif: `${id}.${kind}.256.gif`,
  poster: `${id}.${kind}.poster.png`,
});

async function libraryWithV6Showcase(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'ogm-api-catalog-v6-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  await writeIndex(root, await buildIndex(root));

  const mediaRoot = join(root, 'sets', 'smallscaleint', 'showcase', 'out', 'media');
  mkdirSync(mediaRoot, { recursive: true });
  const ids = [
    '1-fantasy',
    '2-desert',
    '3-dinosaurs',
    '4-town',
    '5-modern-zombie',
    '6-zombie-city',
    '7-interior',
    '8-graveyard',
  ];
  const tracks = {
    region: media('showcase', 'region'),
    sheet: media('showcase', 'sheet'),
  };
  const stops = ids.map((id, index) => ({
    id,
    label: index === 0 ? 'Portal glade ambush' : `V6 scene ${index + 1}`,
    start_time: index * 3,
    region: { poster: `${id}.region.poster.png` },
    sheet: { poster: `${id}.sheet.poster.png` },
  }));
  writeFileSync(
    join(mediaRoot, 'manifest.json'),
    JSON.stringify({ schema: 'ogm.set-showcase-media/2', set: 'smallscaleint', duration: 24, tracks, stops }),
  );
  let value = 70;
  for (const file of [
    ...Object.values(tracks.region),
    ...Object.values(tracks.sheet),
    ...stops.flatMap((stop) => [stop.region.poster, stop.sheet.poster]),
  ]) {
    writeFileSync(join(mediaRoot, file), new Uint8Array([value++]));
  }
  return root;
}

function appWith(assetsRoot: string) {
  const deps = makeDeps();
  installUsers(deps, [CREATOR]);
  const app = createApp(deps);
  app.route(prefix, catalogRoutes({ assetsRoot }));
  return app;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('GET /api/catalog/style-families v6 showcase', () => {
  it('exposes eight seek stops and serves every shared-track media file', async () => {
    const app = appWith(await libraryWithV6Showcase());
    const response = await app.request('/api/catalog/style-families');
    const families = (await response.json()) as StyleFamilyApi[];
    const showcase = styleShowcaseSchema.parse(
      families.find((family) => family.id === 'isometric-2d')?.sets.find((set) => set.id === 'smallscaleint')?.showcase,
    );

    expect(showcase.regionVideoUrl).toBe('/api/catalog/style-sets/smallscaleint/showcase/showcase.region.720.mp4');
    expect(showcase.sheetVideoUrl).toBe('/api/catalog/style-sets/smallscaleint/showcase/showcase.sheet.720.mp4');
    expect(showcase.stops.map(({ id, startSeconds }) => [id, startSeconds])).toEqual([
      ['1-fantasy', 0],
      ['2-desert', 3],
      ['3-dinosaurs', 6],
      ['4-town', 9],
      ['5-modern-zombie', 12],
      ['6-zombie-city', 15],
      ['7-interior', 18],
      ['8-graveyard', 21],
    ]);
    expect(showcase.stops[0]).toEqual({
      id: '1-fantasy',
      label: 'Portal glade ambush',
      startSeconds: 0,
      region: { posterUrl: '/api/catalog/style-sets/smallscaleint/showcase/1-fantasy.region.poster.png' },
      sheet: { posterUrl: '/api/catalog/style-sets/smallscaleint/showcase/1-fantasy.sheet.poster.png' },
    });

    const base = '/api/catalog/style-sets/smallscaleint/showcase/';
    const names = [
      ...Object.values(media('showcase', 'region')),
      ...Object.values(media('showcase', 'sheet')),
      ...showcase.stops.flatMap((stop) => [
        stop.region!.posterUrl!.slice(base.length),
        stop.sheet!.posterUrl!.slice(base.length),
      ]),
    ];
    const statuses = await Promise.all(
      names.map(async (name) => {
        const mediaResponse = await app.request(`${base}${name}`, { headers: asUser(CREATOR.userId) });
        await mediaResponse.arrayBuffer();
        return mediaResponse.status;
      }),
    );
    expect(statuses).toEqual(Array.from({ length: 22 }, () => 200));
  });
});
