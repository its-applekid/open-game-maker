import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';

import { Hono } from 'hono';

import {
  loadFamilies,
  loadIndex,
  licenseFor,
  packOf,
  packsOfFamily,
  type ResolvedCard,
  type StyleFamilyApi,
  type StyleShowcase,
} from '@ogm/asset-cards';
import type { BlobHash, BlobStore } from '@ogm/blob-store';
import { loadEnv } from '@ogm/config';

import type { ApiBindings } from '../app/types.js';
import { requirePrincipal } from '../app/principal.js';

export type { StyleFamilyApi } from '@ogm/asset-cards';

// The creation flow (OGM-074) reads this path; T09 §4 fixed it before the `/api/v1` convention.
export const prefix = '/api/catalog';

const CACHE_MS = 5 * 60_000;
// Outlives a body cached here (5 min) and then by the client (max-age 300); the store rounds it up to a day anyway.
const THUMB_TTL_MS = 24 * 60 * 60_000;
const blobHash = /^sha256:[0-9a-f]{64}$/;
const stopId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_MIME = new Map([
  ['.gif', 'image/gif'],
  ['.json', 'application/json'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
]);

type ShowcaseFile = { path: string; bytes: number; mime: string };
type DiscoveredShowcase = { showcase: StyleShowcase; files: Map<string, ShowcaseFile> };

/** What `gm packs index --import-previews` (OGM-067) adds to an index entry; card files never carry it. */
type Imported = { previews?: { blob?: { thumb?: string } }; visibility?: 'private' | 'library' };

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}

async function safeFile(root: string, path: string): Promise<ShowcaseFile | undefined> {
  try {
    const [rootPath, info, resolved] = await Promise.all([realpath(root), lstat(path), realpath(path)]);
    if (!info.isFile() || info.isSymbolicLink() || !isInside(rootPath, resolved)) return undefined;
    const file = await stat(resolved);
    const extension = [...MEDIA_MIME.keys()].find((suffix) => resolved.endsWith(suffix));
    if (!extension) return undefined;
    return { path: resolved, bytes: file.size, mime: MEDIA_MIME.get(extension)! };
  } catch {
    return undefined;
  }
}

function mediaUrl(setId: string, name: string): string {
  return `${prefix}/style-sets/${encodeURIComponent(setId)}/showcase/${encodeURIComponent(name)}`;
}

function stopLabel(id: string): string {
  return id.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

async function discoverShowcase(
  assetsRoot: string | undefined,
  setId: string,
): Promise<DiscoveredShowcase | undefined> {
  if (!assetsRoot || !loadFamilies().some((family) => family.sets.some((set) => set.id === setId))) return undefined;
  const showcaseRoot = join(assetsRoot, 'sets', setId, 'showcase');
  const sequenceFile = await safeFile(assetsRoot, join(showcaseRoot, 'sequence.json'));
  if (!sequenceFile) return undefined;
  let sequence: unknown;
  try {
    sequence = JSON.parse(await readFile(sequenceFile.path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
  if (!sequence || typeof sequence !== 'object' || !Array.isArray((sequence as { stops?: unknown }).stops))
    return undefined;
  const stops = (sequence as { stops: unknown[] }).stops;
  if (stops.length === 0) return undefined;

  const mediaRoot = join(showcaseRoot, 'out', 'media');
  const files = new Map<string, ShowcaseFile>();
  const add = async (name: string): Promise<string | undefined> => {
    const file = await safeFile(assetsRoot, join(mediaRoot, name));
    if (!file) return undefined;
    files.set(name, file);
    return mediaUrl(setId, name);
  };
  const tileVideoUrl = await add('showcase.tiles-row.720.mp4');
  const sheetVideoUrl = await add('showcase.sheets.720.mp4');
  const seen = new Set<string>();
  let startSeconds = 0;
  const apiStops: StyleShowcase['stops'] = [];
  for (const [index, value] of stops.entries()) {
    if (!value || typeof value !== 'object') return undefined;
    const { tile, sheet, seconds } = value as { tile?: unknown; sheet?: unknown; seconds?: unknown };
    if (
      typeof tile !== 'string' ||
      typeof sheet !== 'string' ||
      !stopId.test(tile) ||
      !stopId.test(sheet) ||
      typeof seconds !== 'number' ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seen.has(tile)
    )
      return undefined;
    seen.add(tile);
    const number = index + 1;
    const tileFallbackUrl = await add(`${number}-${tile}.tile.256.gif`);
    const sheetFallbackUrl = await add(`${number}-${sheet}.sheet.256.gif`);
    apiStops.push({
      id: tile,
      label: stopLabel(tile),
      startSeconds,
      ...(tileFallbackUrl ? { tileFallbackUrl } : {}),
      ...(sheetFallbackUrl ? { sheetFallbackUrl } : {}),
    });
    startSeconds += seconds;
  }
  if (!tileVideoUrl && !sheetVideoUrl && apiStops.every((stop) => !stop.tileFallbackUrl && !stop.sheetFallbackUrl))
    return undefined;
  return {
    showcase: {
      ...(tileVideoUrl ? { tileVideoUrl } : {}),
      ...(sheetVideoUrl ? { sheetVideoUrl } : {}),
      stops: apiStops,
    },
    files,
  };
}

function byteRange(value: string, bytes: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || bytes === 0) return undefined;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0) return undefined;
    return { start: Math.max(0, bytes - length), end: bytes - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : bytes - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= bytes || requestedEnd < start)
    return undefined;
  return { start, end: Math.min(requestedEnd, bytes - 1) };
}

/** Fail closed unless every pack resolves to a recognized public SPDX license. */
export function setRequiresPrivateRepository(
  packIds: readonly string[],
  resolvedLicenseFor: (packId: string) => string | undefined,
): boolean {
  return packIds.some((packId) => {
    const value = resolvedLicenseFor(packId);
    const license = value ? licenseFor(value) : undefined;
    return !license || license.id.startsWith('LicenseRef-') || license.ceiling.audience !== 'public';
  });
}

/** A signed URL only for a public collection whose imported thumb blob the store holds. */
async function thumbnailUrl(blobStore: BlobStore, card: (ResolvedCard & Imported) | undefined): Promise<string | null> {
  const thumb = card?.previews?.blob?.thumb;
  if (!card || !thumb || !blobHash.test(thumb)) return null;
  if (card.visibility === 'private' || card.resolved.rights.audience !== 'public') return null;
  const hash = thumb as BlobHash;
  if (!(await blobStore.head(hash))) return null;
  return (await blobStore.signedGet(hash, new Date(Date.now() + THUMB_TTL_MS))).url;
}

async function styleFamilies(assetsRoot: string | undefined, blobStore: BlobStore): Promise<StyleFamilyApi[]> {
  const byPack = new Map<string, ResolvedCard>();
  if (assetsRoot) {
    for (const card of Object.values((await loadIndex(assetsRoot)).collections)) {
      const pack = packOf(card.id);
      if (pack) byPack.set(pack, card);
    }
  }
  const apiPack = async (id: string) => ({
    id,
    name: byPack.get(id)?.title ?? id,
    thumbnailUrl: await thumbnailUrl(blobStore, byPack.get(id)),
  });
  return Promise.all(
    loadFamilies().map(async (f) => ({
      id: f.id,
      label: f.label,
      dimension: f.dimension,
      fidelity: f.fidelity,
      views: f.views,
      creationChoice: f.creation_choice,
      coverage: f.coverage,
      packs: await Promise.all(packsOfFamily(f).map(apiPack)),
      sets: await Promise.all(
        f.sets.map(async (set) => {
          const showcase = (await discoverShowcase(assetsRoot, set.id))?.showcase;
          return {
            id: set.id,
            label: set.label,
            pickerFamilies: set.picker_families ?? [],
            vendors: set.vendors,
            traits: set.traits,
            requiresPrivateRepository: setRequiresPrivateRepository(
              set.packs.map((pack) => pack.id),
              (pack) => byPack.get(pack)?.resolved.license,
            ),
            packs: await Promise.all(
              set.packs.map(async (pack) => ({
                ...(await apiPack(pack.id)),
                compatibleWith: pack.compatible_with ?? [],
              })),
            ),
            ...(showcase ? { showcase } : {}),
          };
        }),
      ),
    })),
  );
}

/** `GET /style-families`: public (no principal), cached in memory for five minutes, with an ETag. */
export function catalogRoutes(opts: { assetsRoot?: string }): Hono<ApiBindings> {
  type Entry = { body: string; etag: string };
  let cached: { at: number; entry: Promise<Entry> } | undefined;
  const build = async (blobStore: BlobStore): Promise<Entry> => {
    const body = JSON.stringify(await styleFamilies(opts.assetsRoot, blobStore));
    return { body, etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"` };
  };
  return new Hono<ApiBindings>()
    .get('/style-families', async (c) => {
      // One shared build per cache period, so a burst never rebuilds the index concurrently; a failed build is retried.
      if (!cached || Date.now() - cached.at > CACHE_MS) {
        const next = { at: Date.now(), entry: build(c.get('deps').blobStore) };
        cached = next;
        next.entry.catch(() => {
          if (cached === next) cached = undefined;
        });
      }
      const entry = await cached.entry;
      c.header('ETag', entry.etag);
      c.header('Cache-Control', 'public, max-age=300');
      if (c.req.header('if-none-match') === entry.etag) return c.body(null, 304);
      c.header('Content-Type', 'application/json');
      return c.body(entry.body);
    })
    .get('/style-sets/:setId/showcase/:file', async (c) => {
      requirePrincipal(c, ['user']);
      const discovered = await discoverShowcase(opts.assetsRoot, c.req.param('setId'));
      const file = discovered?.files.get(c.req.param('file'));
      if (!file) return c.json({ error: 'not_found' }, 404);

      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
        'Content-Type': file.mime,
      };
      const requested = c.req.header('range');
      if (!requested) {
        headers['Content-Length'] = String(file.bytes);
        return new Response(Readable.toWeb(createReadStream(file.path)) as ReadableStream, { status: 200, headers });
      }
      const range = byteRange(requested, file.bytes);
      if (!range) {
        headers['Content-Range'] = `bytes */${file.bytes}`;
        return new Response(null, { status: 416, headers });
      }
      headers['Content-Length'] = String(range.end - range.start + 1);
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.bytes}`;
      return new Response(
        Readable.toWeb(createReadStream(file.path, { start: range.start, end: range.end })) as ReadableStream,
        { status: 206, headers },
      );
    });
}

const env = loadEnv('api', { OGM_ASSETS_ROOT: { kind: 'path', required: false } });

export default catalogRoutes({ assetsRoot: env.OGM_ASSETS_ROOT });
