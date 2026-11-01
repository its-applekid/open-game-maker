import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { validateCard, type AssetCard } from '@ogm/contracts';

import { resolve } from './resolve.js';
import type { CardIndex, IndexError, ResolvedCard } from './types.js';

export const INDEX_PATH = join('index', 'cards.index.json');
const TOPS = ['packs', 'inspiration'];

async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** Card files: `<top>/<id>/collection.card.json` and `<top>/<id>/cards/**\/*.card.json`; extracted trees are never walked. */
export async function cardFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const top of TOPS) {
    for (const id of (await entries(join(root, top))).sort()) {
      const base = join(root, top, id);
      if ((await entries(base)).includes('collection.card.json')) files.push(join(base, 'collection.card.json'));
      let nested: string[];
      try {
        nested = await readdir(join(base, 'cards'), { recursive: true });
      } catch {
        continue;
      }
      for (const file of nested.filter((name) => name.endsWith('.card.json')).sort()) {
        files.push(join(base, 'cards', file));
      }
    }
  }
  return files;
}

export async function buildIndex(root: string): Promise<CardIndex> {
  const errors: IndexError[] = [];
  const valid: AssetCard[] = [];
  for (const file of await cardFiles(root)) {
    const path = relative(root, file);
    let doc: unknown;
    try {
      doc = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      errors.push({ path, errors: [`unreadable JSON: ${error instanceof Error ? error.message : String(error)}`] });
      continue;
    }
    const result = validateCard(doc);
    if (result.ok) valid.push(result.card);
    else errors.push({ path, errors: result.errors });
  }

  const raw: Record<string, AssetCard> = {};
  for (const card of valid) if (card.card_type === 'collection') raw[card.id] = card;

  const cards: ResolvedCard[] = [];
  const collections: Record<string, ResolvedCard> = {};
  for (const card of valid) {
    let resolved: ResolvedCard;
    try {
      resolved = resolve(card, raw);
    } catch (error) {
      errors.push({ path: card.id, errors: [error instanceof Error ? error.message : String(error)] });
      continue;
    }
    cards.push(resolved);
    if (card.card_type === 'collection') collections[card.id] = resolved;
  }

  const vocab =
    valid
      .map((card) => card.vocab)
      .sort()
      .at(-1) ?? '';
  return { version: 1, built: new Date().toISOString(), vocab, cards, collections, errors };
}

export async function writeIndex(root: string, index: CardIndex): Promise<string> {
  const path = join(root, INDEX_PATH);
  await mkdir(join(root, 'index'), { recursive: true });
  await writeFile(path, `${JSON.stringify(index)}\n`);
  return path;
}

/** True when the index file is missing or any card file is newer than it. */
export async function isStale(root: string): Promise<boolean> {
  let built: number;
  try {
    built = (await stat(join(root, INDEX_PATH))).mtimeMs;
  } catch {
    return true;
  }
  for (const file of await cardFiles(root)) {
    if ((await stat(file)).mtimeMs > built) return true;
  }
  return false;
}

/** Read the index, rebuilding and writing it first when it is missing or stale. */
export async function loadIndex(root: string): Promise<CardIndex> {
  if (await isStale(root)) {
    const index = await buildIndex(root);
    await writeIndex(root, index);
    return index;
  }
  return JSON.parse(await readFile(join(root, INDEX_PATH), 'utf8')) as CardIndex;
}
