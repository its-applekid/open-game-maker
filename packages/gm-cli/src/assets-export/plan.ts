import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { CardIndex, ResolvedCard } from '@ogm/asset-cards';
import { blobPath } from '@ogm/blob-store';
import type { AssetsLock, LockEntry } from '@ogm/contracts';

import { readLock } from '../lock.js';
import { collectionParts, entrySource, libraryRoot, resolveEntry } from '../resolve.js';
import { rightsForCard, type LockRights } from '../rules.js';

export type Game = { id: string; dir: string; lock: AssetsLock };

/** One file to put in the zip. `sha256` is the pinned hash the exported bytes must match, when one is known. */
export type ExportFile = {
  path: string;
  file: string;
  sha256?: string;
  ids: string[];
  license?: string;
  rights?: LockRights;
  mime?: string;
  /** Exported only because `--include-restricted` was given. */
  restricted?: boolean;
};

export type Excluded = { path?: string; ids: string[]; license?: string; rights?: LockRights; reason: string };

export type ExportPlan = { files: ExportFile[]; excluded: Excluded[]; restricted: Excluded[]; missing: string[] };

/** Raw files may leave the instance only when their rights allow free redistribution. */
export function restrictedReason(rights: LockRights | undefined): string | null {
  if (rights === undefined) return 'no rights are recorded for it';
  if (rights.redistribution === 'free') return null;
  return `redistribution is ${rights.redistribution}`;
}

export async function gameIdOf(dir: string): Promise<string> {
  try {
    const doc = JSON.parse(await readFile(join(dir, '.gm/game.json'), 'utf8')) as { gameId?: string; id?: string };
    if (doc.gameId ?? doc.id) return (doc.gameId ?? doc.id)!;
  } catch {
    // A repo without .gm/game.json is named by its directory.
  }
  return basename(dir);
}

/** Every game repo directly under `dir` (one that holds `assets.lock.json`), sorted by id. */
export async function scanGames(dir: string): Promise<Game[]> {
  const games: Game[] = [];
  for (const name of (await readdir(dir, { withFileTypes: true })).filter((item) => item.isDirectory())) {
    const gameDir = join(dir, name.name);
    const lock = await readLock(gameDir);
    if (lock !== null) games.push({ id: await gameIdOf(gameDir), dir: gameDir, lock });
  }
  return games.sort((left, right) => left.id.localeCompare(right.id));
}

function slash(path: string): string {
  return path.split(sep).join('/');
}

function collectionCardParts(id: string): { slug: string; version: string } | null {
  const match = /^t[12]:([a-z0-9][a-z0-9-]*)(?:\/[^@]*)?@([A-Za-z0-9._-]+)$/.exec(id);
  return match ? { slug: match[1]!, version: match[2]! } : null;
}

function lockFacts(entry: LockEntry): object {
  return {
    sha256: entry.sha256,
    files: (entry.files ?? []).map((file) => file.sha256).sort(),
    license: entry.license,
    rights: entry.rights,
  };
}

async function blobMime(file: string): Promise<string | undefined> {
  try {
    const mime = (JSON.parse(await readFile(`${file}.json`, 'utf8')) as { mime?: unknown }).mime;
    return typeof mime === 'string' ? mime : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The files one lock entry needs. Shared resolution verifies every pinned file before this maps library and blob
 * locations into the portable export layout. Vendored files stay in the game repository and need no export copy.
 */
async function entryFiles(
  entry: LockEntry,
  game: Game,
  assetsRoot: string | null,
  blobRoot: string | null,
  collections: Record<string, ResolvedCard>,
): Promise<{ files: ExportFile[]; pack?: { dir: string; slug: string } } | { inRepo: true } | { missing: string }> {
  const base = { ids: [entry.id], license: entry.license, rights: entry.rights };
  const resolution = await resolveEntry(entry, { cwd: game.dir, assetsRoot, blobRoot, collections });
  if (!resolution.ok) return { missing: `${entry.id}: ${resolution.detail}` };

  const source = entrySource(entry);
  if (source === 'vendored') return { inRepo: true };
  const pinned = [{ path: entry.path, sha256: entry.sha256 }, ...(entry.files ?? [])];
  if (source === 'blob') {
    const files: ExportFile[] = [];
    for (const item of pinned) {
      const file = blobPath(blobRoot!, `sha256:${item.sha256}`);
      const mime = await blobMime(file);
      files.push({
        ...base,
        path: `blobs/${item.sha256}`,
        file,
        sha256: item.sha256,
        ...(mime ? { mime } : {}),
      });
    }
    return { files };
  }

  const parts = collectionParts(entry.id);
  const collectionId = entry.id.replace(/\/.*@/, '@');
  const extracted = libraryRoot(assetsRoot!, entry.id, collections[collectionId]);
  return {
    files: pinned.map((item) => ({
      ...base,
      path: `library/${parts.slug}/${parts.version}/extracted/${slash(item.path)}`,
      file: join(extracted, item.path),
      sha256: item.sha256,
    })),
    pack: { dir: dirname(dirname(extracted)), slug: parts.slug },
  };
}

/** Merge files that several entries (or games) share into one zip entry; keep zip order by path. */
function merge(files: ExportFile[]): ExportFile[] {
  const byPath = new Map<string, ExportFile>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (existing === undefined) byPath.set(file.path, { ...file, ids: [...file.ids] });
    else {
      existing.ids = [...new Set([...existing.ids, ...file.ids])].sort();
      existing.sha256 ??= file.sha256;
      if (file.restricted) {
        existing.license = file.license;
        existing.rights = file.rights;
        existing.restricted = true;
      }
    }
  }
  return [...byPath.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/**
 * Every file the locks of `games` need. An entry is restricted when its lock rights or its current card's rights
 * (a lock may predate a narrowed card) do not allow free redistribution; a file any restricted entry pins is
 * restricted even when a free entry pins it too. Two games locking one id with different bytes or rights abort.
 */
export async function planUsed(
  games: Game[],
  assetsRoot: string | null,
  blobRoot: string | null,
  index: CardIndex | null,
  includeRestricted: boolean,
): Promise<ExportPlan> {
  const cards = new Map((index?.cards ?? []).map((card) => [card.id, card]));
  const files: ExportFile[] = [];
  const restricted: Excluded[] = [];
  const restrictedPaths = new Set<string>();
  const missing: string[] = [];
  const packs = new Map<string, string>();
  const seen = new Map<string, { game: string; entry: LockEntry }>();
  for (const game of games) {
    for (const entry of game.lock.assets) {
      const first = seen.get(entry.id);
      if (first) {
        if (!isDeepStrictEqual(lockFacts(first.entry), lockFacts(entry))) {
          missing.push(
            `${entry.id}: ${first.game} and ${game.id} lock it with different bytes, companion files, or rights metadata; refresh one lock`,
          );
          continue;
        }
      } else {
        seen.set(entry.id, { game: game.id, entry });
      }
      const card = cards.get(entry.id);
      const current = card && index ? rightsForCard(card, index.collections) : undefined;
      const lockReason = restrictedReason(entry.rights);
      const cardReason = current ? restrictedReason(current) : null;
      const reason = lockReason ?? (cardReason === null ? null : `its current card says ${cardReason}`);
      const resolved = await entryFiles(entry, game, assetsRoot, blobRoot, index?.collections ?? {});
      if (reason !== null) {
        restricted.push({
          ids: [entry.id],
          license: entry.license,
          rights: lockReason ? entry.rights : current!,
          reason,
        });
        if ('files' in resolved) resolved.files.forEach((file) => restrictedPaths.add(file.path));
        if (!includeRestricted) continue;
      }
      if ('missing' in resolved) missing.push(resolved.missing);
      else if ('files' in resolved) {
        files.push(...resolved.files.map((file) => (reason === null ? file : { ...file, restricted: true })));
        if (resolved.pack) packs.set(resolved.pack.slug, resolved.pack.dir);
      }
    }
  }
  for (const [pack, dir] of [...packs].sort(([left], [right]) => left.localeCompare(right))) {
    files.push(...(await packMetadataFiles(dir, pack)));
  }
  const kept = merge(files)
    .filter((file) => includeRestricted || !restrictedPaths.has(file.path))
    .map((file) => (restrictedPaths.has(file.path) ? { ...file, restricted: true } : file));
  return { files: kept, excluded: includeRestricted ? [] : restricted, restricted, missing };
}

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...(await walk(path)));
    else if (item.isFile()) result.push(path);
  }
  return result;
}

/**
 * The cards a library needs to index a pack (collection card and asset cards). `pack.json` stays behind: it holds
 * intake paths and Drive ids that are not the recipient's business.
 */
async function packMetadataFiles(packDir: string, pack: string): Promise<ExportFile[]> {
  const collection = join(packDir, 'collection.card.json');
  const files = [...(existsSync(collection) ? [collection] : []), ...(await walk(join(packDir, 'cards')))];
  return files.map((file) => ({ path: `library/${pack}/${slash(relative(packDir, file))}`, file, ids: [] }));
}

/**
 * Every pack version's extracted files and every blob. A pack version's rights come from its collection card;
 * an asset card with narrower rights excludes that asset's files. A blob's rights come from the lock entries
 * (of the scanned games) that pin its sha; a blob no lock names has no recorded rights and counts as restricted.
 */
export async function planAll(
  games: Game[],
  assetsRoot: string,
  blobRoot: string | null,
  index: CardIndex,
  includeRestricted: boolean,
): Promise<ExportPlan> {
  const files: ExportFile[] = [];
  const restricted: Excluded[] = [];
  const collections: Array<{ pack: string; packDir: string }> = [];
  for (const top of ['packs', 'inspiration']) {
    const topDir = join(assetsRoot, top);
    if (!existsSync(topDir)) continue;
    for (const item of (await readdir(topDir, { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
      collections.push({ pack: item.name, packDir: join(topDir, item.name) });
    }
  }
  collections.sort((left, right) =>
    left.pack === right.pack ? left.packDir.localeCompare(right.packDir) : left.pack.localeCompare(right.pack),
  );
  for (const { pack, packDir } of collections) {
    let packIncluded = false;
    for (const version of (await readdir(packDir, { withFileTypes: true }))
      .filter((item) => item.isDirectory() && item.name !== 'cards')
      .map((item) => item.name)
      .sort()) {
      const extracted = join(packDir, version, 'extracted');
      if (!existsSync(extracted)) continue;
      const collection = Object.values(index.collections).find((card) => {
        const parts = collectionCardParts(card.id);
        return parts?.slug === pack && parts.version === version;
      });
      const rights = collection ? rightsForCard(collection, index.collections) : undefined;
      const license = collection?.resolved.license;
      const ids = collection ? [collection.id] : [];
      const reason = restrictedReason(rights);
      if (reason !== null) {
        const excluded = {
          path: `library/${pack}/${version}/`,
          ids,
          ...(license ? { license } : {}),
          ...(rights ? { rights } : {}),
          reason,
        };
        restricted.push(excluded);
        if (!includeRestricted) continue;
      }
      packIncluded = true;
      const narrower = new Map<string, { ids: string[]; license: string; rights: LockRights }>();
      if (reason === null && collection) {
        for (const card of index.cards) {
          if (card.collection !== collection.id || card.card_type !== 'asset') continue;
          const cardRights = rightsForCard(card, index.collections);
          const cardReason = restrictedReason(cardRights);
          if (cardReason === null) continue;
          const facts = { ids: [card.id], license: card.resolved.license, rights: cardRights };
          const paths = (card.source?.files ?? []).map((file) => slash(file.path));
          paths.forEach((path) => narrower.set(path, facts));
          restricted.push({
            path: `library/${pack}/${version}/extracted/${paths[0] ?? ''}`,
            ...facts,
            reason: cardReason,
          });
        }
      }
      for (const file of await walk(extracted)) {
        const local = slash(relative(extracted, file));
        const card = narrower.get(local);
        if (card && !includeRestricted) continue;
        files.push({
          path: `library/${pack}/${version}/extracted/${local}`,
          file,
          ids,
          ...(license ? { license } : {}),
          ...(rights ? { rights } : {}),
          ...card,
          ...(reason === null && !card ? {} : { restricted: true }),
        });
      }
    }
    if (packIncluded) files.push(...(await packMetadataFiles(packDir, pack)));
  }

  if (blobRoot !== null) {
    const pinned = new Map<string, LockEntry[]>();
    for (const game of games) {
      for (const entry of game.lock.assets) {
        for (const sha of new Set([entry.sha256, ...(entry.files ?? []).map((file) => file.sha256)])) {
          pinned.set(sha, [...(pinned.get(sha) ?? []), entry]);
        }
      }
    }
    const dir = dirname(blobPath(blobRoot, `sha256:${'0'.repeat(64)}`));
    const hashes = existsSync(dir) ? (await readdir(dir)).filter((name) => /^[0-9a-f]{64}$/.test(name)).sort() : [];
    for (const sha of hashes) {
      const entries = pinned.get(sha) ?? [];
      const ids = [...new Set(entries.map((entry) => entry.id))].sort();
      const reasons = entries.map((entry) => restrictedReason(entry.rights));
      const reason =
        entries.length === 0 ? restrictedReason(undefined) : (reasons.find((item) => item !== null) ?? null);
      const first = entries.find((entry) => restrictedReason(entry.rights) !== null) ?? entries[0];
      const facts = first ? { license: first.license, rights: first.rights } : {};
      if (reason !== null) {
        restricted.push({ path: `blobs/${sha}`, ids, ...facts, reason });
        if (!includeRestricted) continue;
      }
      const file = join(dir, sha);
      const mime = await blobMime(file);
      files.push({
        path: `blobs/${sha}`,
        file,
        sha256: sha,
        ids,
        ...facts,
        ...(mime ? { mime } : {}),
        ...(reason === null ? {} : { restricted: true }),
      });
    }
  }
  return { files: merge(files), excluded: includeRestricted ? [] : restricted, restricted, missing: [] };
}
