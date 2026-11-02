import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { access, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { previewKey, renderCollectionSheet, renderSheet, spriteSheet } from '@ogm/asset-previews';
import { validateCard, type AssetCard } from '@ogm/contracts';

import type { WorkerRecord } from './workers.js';

export type TagKind = 'audio' | 'map' | 'model' | 'sprite';

export type TagTarget = {
  id: string;
  slug: string;
  root: string;
  collectionPath: string;
  collection: AssetCard;
  cards: Array<{ path: string; card: AssetCard }>;
};

export type TargetDiscovery = { targets: TagTarget[]; refusals: string[] };

type Snapshot = {
  roots: string[];
  files: Map<string, Buffer>;
};

function glob(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^${escaped}$`);
}

async function filesUnder(root: string, suffix: string): Promise<string[]> {
  try {
    return (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function matchesKind(card: AssetCard, kind: TagKind): boolean {
  if (kind === 'map') return card.kind === 'inspiration' && card.subkind === 'map';
  if (card.kind !== kind) return false;
  if (kind !== 'model') return true;
  const primary = card.source?.files.find((file) => file.role === 'primary') ?? card.source?.files[0];
  return primary?.format === 'glb';
}

export async function discoverTagTargets(assetsRoot: string, kind: TagKind, only = '*'): Promise<TargetDiscovery> {
  const top = join(assetsRoot, kind === 'map' ? 'inspiration' : 'packs');
  const pattern = glob(only);
  const targets: TagTarget[] = [];
  const refusals: string[] = [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(top, { withFileTypes: true, encoding: 'utf8' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { targets, refusals };
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !pattern.test(entry.name)) continue;
    const root = join(top, entry.name);
    const collectionPath = join(root, 'collection.card.json');
    let collection: AssetCard;
    try {
      const parsed = validateCard(JSON.parse(await readFile(collectionPath, 'utf8')) as unknown);
      if (!parsed.ok || parsed.card.card_type !== 'collection') continue;
      collection = parsed.card;
    } catch {
      continue;
    }
    if (
      !collection.rights?.uses.includes('vision-input') ||
      !['any', 'local-only'].includes(collection.rights.processing ?? '')
    ) {
      refusals.push(`${entry.name}: effective rights do not allow local vision-input`);
      continue;
    }
    const cards: TagTarget['cards'] = [];
    for (const path of await filesUnder(join(root, 'cards'), '.card.json')) {
      try {
        const parsed = validateCard(JSON.parse(await readFile(path, 'utf8')) as unknown);
        if (parsed.ok && parsed.card.card_type === 'asset' && matchesKind(parsed.card, kind)) {
          cards.push({ path, card: parsed.card });
        }
      } catch {
        // Existing invalid cards are not eligible inputs and remain untouched.
      }
    }
    if (cards.length > 0) {
      targets.push({ id: collection.id, slug: entry.name, root, collectionPath, collection, cards });
    }
  }
  return { targets, refusals };
}

export async function snapshotTargets(targets: readonly TagTarget[]): Promise<Snapshot> {
  const roots = targets.map((target) => join(target.root, 'cards'));
  const paths = [
    ...targets.map((target) => target.collectionPath),
    ...(await Promise.all(roots.map((root) => filesUnder(root, '.card.json')))).flat(),
  ];
  return { roots, files: new Map(await Promise.all(paths.map(async (path) => [path, await readFile(path)] as const))) };
}

export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  for (const root of snapshot.roots) {
    for (const path of await filesUnder(root, '.card.json')) await rm(path);
    for (const path of await filesUnder(root, '.card.json.part')) await rm(path);
  }
  for (const [path, contents] of snapshot.files) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}

export function assertWorkerRecord(record: WorkerRecord): void {
  if (record.card === undefined) return;
  if (typeof record.card !== 'string' || isAbsolute(record.card) || record.card.includes('\\')) {
    throw new Error('worker card path must be a relative library path');
  }
  const parts = record.card.split('/');
  if (parts.includes('..') || !record.card.endsWith('.card.json')) throw new Error('worker card path is unsafe');
  if (!['measured', 'tagged'].includes(String(record.status))) throw new Error('worker card status is invalid');
  if (!Array.isArray(record.flags) || record.flags.some((flag) => typeof flag !== 'string')) {
    throw new Error('worker card flags must be strings');
  }
}

function inside(root: string, candidate: string): boolean {
  const local = relative(root, candidate);
  return local === '' || (!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`));
}

export async function validateWorkerCards(
  assetsRoot: string,
  targets: readonly TagTarget[],
  records: readonly WorkerRecord[],
): Promise<number> {
  const roots = await Promise.all(targets.map((target) => realpath(join(target.root, 'cards'))));
  let count = 0;
  for (const record of records) {
    if (record.card === undefined) continue;
    assertWorkerRecord(record);
    const lexical = resolve(assetsRoot, record.card);
    if (!inside(resolve(assetsRoot), lexical)) throw new Error(`worker card escapes asset root: ${record.card}`);
    const canonical = await realpath(lexical);
    if (!roots.some((root) => inside(root, canonical)))
      throw new Error(`worker card is outside selected collections: ${record.card}`);
    const parsed = validateCard(JSON.parse(await readFile(canonical, 'utf8')) as unknown);
    if (!parsed.ok) throw new Error(`worker card failed validation: ${record.card}: ${parsed.errors.join('; ')}`);
    if (parsed.card.status !== record.status) throw new Error(`worker status does not match ${record.card}`);
    count += 1;
  }
  return count;
}

async function writeCard(path: string, card: AssetCard): Promise<void> {
  const validated = validateCard(card);
  if (!validated.ok) throw new Error(`${path}: ${validated.errors.join('; ')}`);
  const staged = `${path}.part`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(staged, `${JSON.stringify(card, null, 2)}\n`);
  await rename(staged, path);
}

function primary(card: AssetCard): NonNullable<AssetCard['source']>['files'][number] {
  const file = card.source?.files.find((candidate) => candidate.role === 'primary') ?? card.source?.files[0];
  if (!file) throw new Error(`${card.id} has no primary source file`);
  return file;
}

async function currentVersion(target: TagTarget): Promise<string> {
  const manifest = JSON.parse(await readFile(join(target.root, 'pack.json'), 'utf8')) as { current?: unknown };
  if (typeof manifest.current !== 'string') throw new Error(`${target.slug}/pack.json has no current version`);
  return manifest.current;
}

function relativeKey(assetsRoot: string, path: string): string {
  return relative(assetsRoot, path).split(sep).join('/');
}

export async function prepareVisualPreviews(options: {
  assetsRoot: string;
  targets: readonly TagTarget[];
  kind: 'model' | 'sprite';
  limit: number;
  software: boolean;
}): Promise<{ pages: string[]; renderers: string[] }> {
  const all = options.targets.flatMap((target) => target.cards.map((entry) => ({ target, ...entry })));
  const selected = all.slice(0, options.limit || undefined);
  const pages: string[] = [];
  const renderers: string[] = [];
  for (const { target, path, card } of selected) {
    const existing = card.previews?.sheet;
    if (
      existing &&
      (await access(join(options.assetsRoot, existing))
        .then(() => true)
        .catch(() => false))
    )
      continue;
    const source = primary(card);
    const version = await currentVersion(target);
    const sourcePath = join(target.root, version, 'extracted', ...source.path.split('/'));
    const hash = source.sha256.replace(/^sha256:/, '');
    const key = previewKey(hash, `${options.kind}-sheet`, target.collection.rights?.redistribution, {
      version: 1,
    });
    const out = join(options.assetsRoot, key);
    if (options.kind === 'model') {
      const result = await renderSheet(sourcePath, out, {
        executablePath: '/usr/bin/chromium',
        software: options.software,
      });
      renderers.push(result.renderer);
    } else {
      await spriteSheet(sourcePath, out, { pixelArt: card.image?.pixel_art === true });
    }
    const updated = structuredClone(card);
    updated.previews = { ...updated.previews, sheet: key };
    await writeCard(path, updated);
  }

  if (selected.length === all.length) {
    for (const target of options.targets) {
      const cards = await Promise.all(
        target.cards.map(async ({ path }) => JSON.parse(await readFile(path, 'utf8')) as AssetCard),
      );
      const thumbs = cards
        .map((card) => card.previews?.sheet ?? card.previews?.thumb)
        .filter((key): key is string => typeof key === 'string')
        .map((key) => join(options.assetsRoot, key));
      if (thumbs.length !== cards.length || cards.length === 0) continue;
      const combined = createHash('sha256')
        .update(cards.map((card) => card.source?.content_hash ?? card.id).join('\0'))
        .digest('hex');
      const key = previewKey(combined, `${options.kind}-collection-sheet`, target.collection.rights?.redistribution, {
        items: cards.length,
        version: 1,
      });
      const result = await renderCollectionSheet(thumbs, join(options.assetsRoot, key));
      const pageKeys = result.pages.map((page) => relativeKey(options.assetsRoot, page));
      pages.push(...pageKeys);
      const collection = structuredClone(target.collection);
      collection.previews = { ...collection.previews, sheet: pageKeys[0] ?? key };
      await writeCard(target.collectionPath, collection);
    }
  }
  return { pages, renderers };
}

function countKey(card: AssetCard): string | null {
  if (card.kind === 'inspiration' && card.subkind === 'map') return 'inspiration/map';
  if (card.kind === 'audio' || card.kind === 'model' || card.kind === 'sprite')
    return card.subkind ? `${card.kind}/${card.subkind}` : card.kind;
  return null;
}

export async function reconcileCounts(targets: readonly TagTarget[], kind: TagKind): Promise<void> {
  const prefix = kind === 'map' ? 'inspiration/map' : kind;
  for (const target of targets) {
    const collection = JSON.parse(await readFile(target.collectionPath, 'utf8')) as AssetCard;
    if (!collection.collection_info) throw new Error(`${target.collectionPath}: collection_info is missing`);
    const current = collection.collection_info?.counts ?? {};
    const counts = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(`${prefix}/`)),
    );
    let total = 0;
    for (const path of await filesUnder(join(target.root, 'cards'), '.card.json')) {
      const parsed = validateCard(JSON.parse(await readFile(path, 'utf8')) as unknown);
      if (!parsed.ok || parsed.card.card_type !== 'asset' || !matchesKind(parsed.card, kind)) continue;
      const key = countKey(parsed.card);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
      total += 1;
    }
    if (kind !== 'map') counts[kind] = total;
    collection.collection_info = {
      ...collection.collection_info,
      counts: Object.fromEntries(Object.entries(counts).sort()),
    };
    await writeCard(target.collectionPath, collection);
  }
}
