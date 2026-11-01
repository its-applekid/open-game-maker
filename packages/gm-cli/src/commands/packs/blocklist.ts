import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { buildIndex, type CardIndex, type ResolvedCard } from '@ogm/asset-cards';

import { EXIT, type GmCommand, type GmContext } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';
import { LINE, PREVIEW_KINDS, formatLine, relKey, sha256File, sortLines, walk } from '../../packs/hashwalk.js';

export const DEFAULT_OUT = join('private', 'blocklist', 'redistribution-none.txt');
const CACHE = join('private', 'blocklist', 'cache.json');

type CacheEntry = { mtimeMs: number; size: number; sha256: string };
type Cache = Record<string, CacheEntry>;

/** `t1:sidetrax-60-battle@v1` → `sidetrax-60-battle`, the directory under `packs/` or `inspiration/`. */
function slugOf(id: string): string {
  return id.replace(/^t\d:/, '').replace(/@.*$/, '');
}

/** The trees that hold a collection's bytes: pack originals and extracted files, or the whole inspiration dir, plus variants. */
function rootsOf(root: string, collection: ResolvedCard): string[] {
  const slug = slugOf(collection.id);
  const derived = join(root, 'derived', slug);
  if (existsSync(join(root, 'inspiration', slug, 'collection.card.json'))) {
    return [join(root, 'inspiration', slug), derived];
  }
  const version = collection.collection_info?.version ?? '';
  return [join(root, 'packs', slug, version, 'originals'), join(root, 'packs', slug, version, 'extracted'), derived];
}

/** Preview bucket keys of the collection card and every asset card in it (C3 §7: previews inherit rights). */
function previewKeysOf(index: CardIndex, collection: ResolvedCard): string[] {
  const keys = new Set<string>();
  for (const card of index.cards) {
    if (card.id !== collection.id && card.collection !== collection.id) continue;
    for (const kind of PREVIEW_KINDS) {
      const key = card.previews?.[kind];
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}

async function readCache(file: string): Promise<Cache> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.part`, text);
  await rename(`${file}.part`, file);
}

export type BlocklistStats = {
  collections: number;
  /** Collection cards that failed to load: their rights are unknown, so their bytes are not in the feed. */
  collection_errors: string[];
  files: number;
  hashed: number;
  cached: number;
  manifest_lines: number;
  missing: string[];
  unique_hashes: number;
  lines: number;
  out: string;
};

/** Build the feed: one `sha256  bytes  path` line per byte of every `redistribution: none` collection. */
export async function buildBlocklist(
  ctx: GmContext,
  root: string,
  out: string,
  useCache: boolean,
): Promise<BlocklistStats> {
  // A fresh build, not the cached index: rights decide what is protected, so they must reflect the cards on disk now.
  const index = await buildIndex(root);
  const collectionErrors = index.errors
    .map((error) => error.path)
    .filter((path) => path.endsWith('collection.card.json'));
  const targets = Object.values(index.collections)
    .filter((collection) => collection.resolved.rights.redistribution === 'none')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const cacheFile = join(root, CACHE);
  const oldCache = useCache ? await readCache(cacheFile) : {};
  const cache: Cache = {};
  const lines: string[] = [];
  const missing: string[] = [];
  const stats = { files: 0, hashed: 0, cached: 0, manifest_lines: 0 };

  const hashOne = async (abs: string, rel: string, size: number, mtimeMs: number): Promise<void> => {
    const hit = oldCache[rel];
    let sha: string;
    if (hit && hit.size === size && hit.mtimeMs === mtimeMs) {
      sha = hit.sha256;
      stats.cached += 1;
    } else {
      sha = await sha256File(abs);
      stats.hashed += 1;
    }
    cache[rel] = { mtimeMs, size, sha256: sha };
    lines.push(formatLine(sha, size, rel));
    stats.files += 1;
  };

  for (const collection of targets) {
    for (const dir of rootsOf(root, collection)) {
      for await (const file of walk(root, dir)) await hashOne(file.abs, file.rel, file.size, file.mtimeMs);
    }
    for (const key of previewKeysOf(index, collection)) {
      const abs = join(root, key);
      const info = await lstat(abs).catch(() => null);
      if (info?.isFile()) await hashOne(abs, relKey(root, abs), info.size, info.mtimeMs);
      else missing.push(key);
    }
    const manifest = collection.collection_info?.hash_manifest;
    if (manifest) {
      let text: string;
      try {
        text = await readFile(join(root, manifest), 'utf8');
      } catch {
        missing.push(manifest);
        continue;
      }
      const prefix = `manifest/${slugOf(collection.id)}/`;
      for (const line of text.split('\n')) {
        const match = LINE.exec(line);
        if (!match) continue;
        lines.push(formatLine(match[1], Number(match[2]), `${prefix}${match[3]}`));
        stats.manifest_lines += 1;
      }
    }
  }

  const sorted = sortLines(lines);
  await writeAtomic(out, sorted.length > 0 ? `${sorted.join('\n')}\n` : '');
  await writeAtomic(cacheFile, `${JSON.stringify(cache)}\n`);
  for (const key of missing) ctx.err(`missing: ${key}`);
  for (const path of collectionErrors) ctx.err(`unreadable collection card, its files are not listed: ${path}`);
  return {
    collections: targets.length,
    collection_errors: collectionErrors,
    ...stats,
    missing,
    unique_hashes: new Set(sorted.map((line) => line.slice(0, 64))).size,
    lines: sorted.length,
    out,
  };
}

export const command: GmCommand = {
  name: 'packs blocklist',
  summary: 'write the sorted sha256 feed of every redistribution:none file, preview, variant and hash manifest',
  usage: '[--out <file>]',
  example: 'packs blocklist --json',
  flags: {
    out: {
      type: 'string',
      help: 'feed file (default $OGM_BLOCKLIST_FILE, else private/blocklist/redistribution-none.txt)',
    },
    'no-cache': { type: 'boolean', default: false, help: 'rehash every file instead of trusting size and mtime' },
  },
  async run(ctx, _args, flags) {
    const root = requireAssetsRoot(ctx);
    const out =
      typeof flags.out === 'string' ? resolve(ctx.cwd, flags.out) : (ctx.blocklistFile ?? join(root, DEFAULT_OUT));
    let stats: BlocklistStats;
    try {
      stats = await buildBlocklist(ctx, root, out, flags['no-cache'] !== true);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EACCES' && code !== 'EROFS' && code !== 'ENOTDIR' && code !== 'EPERM') throw error;
      ctx.err(`cannot read or write ${(error as NodeJS.ErrnoException).path ?? out} (${code})`);
      return EXIT.failed;
    }
    if (ctx.json) printJson(ctx, stats);
    else
      ctx.out(
        `${stats.lines} lines, ${stats.unique_hashes} unique hashes from ${stats.collections} collections -> ${stats.out}`,
      );
    ctx.emit('assets.blocklist', {
      ...stats,
      missing: stats.missing.length,
      collection_errors: stats.collection_errors.length,
    });
    return stats.collection_errors.length > 0 ? EXIT.failed : EXIT.ok;
  },
};
