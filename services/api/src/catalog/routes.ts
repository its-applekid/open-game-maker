import { createHash } from 'node:crypto';

import { Hono } from 'hono';

import { loadFamilies, loadIndex, packOf, type ResolvedCard, type StyleFamilyApi } from '@ogm/asset-cards';
import type { BlobHash, BlobStore } from '@ogm/blob-store';
import { loadEnv } from '@ogm/config';

import type { ApiBindings } from '../app/types.js';

export type { StyleFamilyApi } from '@ogm/asset-cards';

// The creation flow (OGM-074) reads this path; T09 §4 fixed it before the `/api/v1` convention.
export const prefix = '/api/catalog';

const CACHE_MS = 5 * 60_000;
const blobHash = /^sha256:[0-9a-f]{64}$/;

/** What `gm packs index --import-previews` (OGM-067) adds to an index entry; card files never carry it. */
type Imported = { previews?: { blob?: { thumb?: string } }; visibility?: 'private' | 'library' };

/** A signed URL only for a public collection whose imported thumb blob the store holds. */
async function thumbnailUrl(blobStore: BlobStore, card: (ResolvedCard & Imported) | undefined): Promise<string | null> {
  const thumb = card?.previews?.blob?.thumb;
  if (!card || !thumb || !blobHash.test(thumb)) return null;
  if (card.visibility === 'private' || card.resolved.rights.audience !== 'public') return null;
  const hash = thumb as BlobHash;
  if (!(await blobStore.head(hash))) return null;
  return (await blobStore.signedGet(hash, new Date(Date.now() + CACHE_MS))).url;
}

async function styleFamilies(assetsRoot: string | undefined, blobStore: BlobStore): Promise<StyleFamilyApi[]> {
  const byPack = new Map<string, ResolvedCard>();
  if (assetsRoot) {
    for (const card of Object.values((await loadIndex(assetsRoot)).collections)) {
      const pack = packOf(card.id);
      if (pack) byPack.set(pack, card);
    }
  }
  return Promise.all(
    loadFamilies().map(async (f) => ({
      id: f.id,
      label: f.label,
      dimension: f.dimension,
      fidelity: f.fidelity,
      views: f.views,
      creationChoice: f.creation_choice,
      coverage: f.coverage,
      packs: await Promise.all(
        [...f.packs.primary, ...f.packs.extras].map(async (id) => ({
          id,
          name: byPack.get(id)?.title ?? id,
          thumbnailUrl: await thumbnailUrl(blobStore, byPack.get(id)),
        })),
      ),
    })),
  );
}

/** `GET /style-families`: public (no principal), cached in memory for five minutes, with an ETag. */
export function catalogRoutes(opts: { assetsRoot?: string }): Hono<ApiBindings> {
  let cached: { at: number; body: string; etag: string } | undefined;
  return new Hono<ApiBindings>().get('/style-families', async (c) => {
    if (!cached || Date.now() - cached.at > CACHE_MS) {
      const body = JSON.stringify(await styleFamilies(opts.assetsRoot, c.get('deps').blobStore));
      cached = { at: Date.now(), body, etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"` };
    }
    c.header('ETag', cached.etag);
    c.header('Cache-Control', 'public, max-age=300');
    if (c.req.header('if-none-match') === cached.etag) return c.body(null, 304);
    c.header('Content-Type', 'application/json');
    return c.body(cached.body);
  });
}

const env = loadEnv('api', { OGM_ASSETS_ROOT: { kind: 'path', required: false } });

export default catalogRoutes({ assetsRoot: env.OGM_ASSETS_ROOT });
