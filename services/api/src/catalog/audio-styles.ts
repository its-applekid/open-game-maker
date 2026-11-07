import { createHash } from 'node:crypto';
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative } from 'node:path';

import { AUDIO_STYLES } from '@ogm/contracts';
import { Hono } from 'hono';

import type { ApiBindings } from '../app/types.js';
import { requirePrincipal } from '../app/principal.js';
import { streamMedia } from './byte-range.js';

/** One audio style tile: the direction a creator picks and the pre-rendered 60 s montage that plays for it. */
export type AudioStyleTile = {
  id: string;
  label: string;
  style: string;
  mood: string;
  sampleUrl: string;
};

/** Tiles grouped family-first by their style axis, so the picker's first screen shows styles like the Style step. */
export type AudioStyleFamily = { id: string; label: string; styles: AudioStyleTile[] };

export type SampleFile = { path: string; bytes: number; mime: string };

const SAMPLE_MIME = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
]);

function title(value: string): string {
  return value.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

/** The folder `style_montages.py` writes into; `null` when the library is not mounted in this process. */
async function stylesRoot(assetsRoot: string | undefined): Promise<string | null> {
  if (!assetsRoot) return null;
  try {
    const root = await realpath(assetsRoot);
    const folder = await realpath(join(root, 'audio-styles'));
    return (await stat(folder)).isDirectory() ? folder : null;
  } catch {
    return null;
  }
}

/**
 * The sample file a style's tile plays, resolved inside the assets root and confined to it. A style without a sample is
 * not offered: a tile without a montage is worse than no tile, so the builder's output is the gate.
 */
export async function audioStyleSample(
  assetsRoot: string | undefined,
  styleId: string,
): Promise<SampleFile | undefined> {
  const folder = await stylesRoot(assetsRoot);
  if (!folder) return undefined;
  const known = AUDIO_STYLES.some((style) => style.id === styleId);
  if (!known) return undefined;
  for (const extension of SAMPLE_MIME.keys()) {
    const candidate = join(folder, `${styleId}${extension}`);
    try {
      const [info, resolved] = await Promise.all([lstat(candidate), realpath(candidate)]);
      if (!info.isFile() || info.isSymbolicLink() || !isInside(folder, resolved)) continue;
      const file = await stat(resolved);
      return { path: resolved, bytes: file.size, mime: SAMPLE_MIME.get(extension)! };
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * The tiles the picker offers: the contract's taste-led styles, kept only where the builder rendered a sample. Grouped
 * by style axis, families in the order the styles first appear so the list is stable between requests.
 */
export async function audioStyleFamilies(assetsRoot: string | undefined, prefix: string): Promise<AudioStyleFamily[]> {
  const folder = await stylesRoot(assetsRoot);
  if (!folder) return [];
  const present = new Set((await readdir(folder)).map((name) => name.replace(extname(name), '')));
  const families = new Map<string, AudioStyleFamily>();
  for (const style of AUDIO_STYLES) {
    if (!present.has(style.id)) continue;
    const family = families.get(style.style) ?? { id: style.style, label: title(style.style), styles: [] };
    family.styles.push({
      id: style.id,
      label: style.label,
      style: style.style,
      mood: style.mood,
      sampleUrl: `${prefix}/audio-styles/${encodeURIComponent(style.id)}/sample`,
    });
    families.set(style.style, family);
  }
  return [...families.values()];
}

const CACHE_MS = 5 * 60_000;

/**
 * The audio-style endpoints the creation flow reads: the tiles to offer and one style's montage.
 *
 * `GET /audio-styles` is public and ETagged like `/style-families`; `GET /audio-styles/:styleId/sample` needs a user
 * session because the montage is licensed library audio, not public marketing media.
 */
export function audioStyleRoutes(opts: { assetsRoot?: string; prefix: string }): Hono<ApiBindings> {
  type Entry = { body: string; etag: string };
  let cached: { at: number; entry: Promise<Entry> } | undefined;
  const build = async (): Promise<Entry> => {
    const body = JSON.stringify({ families: await audioStyleFamilies(opts.assetsRoot, opts.prefix) });
    return { body, etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"` };
  };
  return new Hono<ApiBindings>()
    .get('/audio-styles', async (c) => {
      // One shared build per cache period, so a burst never rebuilds the index concurrently; a failed build is retried.
      if (!cached || Date.now() - cached.at > CACHE_MS) {
        const next = { at: Date.now(), entry: build() };
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
    .get('/audio-styles/:styleId/sample', async (c) => {
      requirePrincipal(c, ['user']);
      const file = await audioStyleSample(opts.assetsRoot, c.req.param('styleId'));
      if (!file) return c.json({ error: 'not_found' }, 404);
      return streamMedia(file, c.req.header('range'));
    });
}
