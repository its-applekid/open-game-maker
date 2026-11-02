import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sortLines } from '../src/packs/hashwalk.js';
import { gm, tempDir } from './helpers.js';
import { ANNUAL, MANIFEST_LINES, SIDETRAX, put, rightsLibrary } from './library-rights.js';

const FEED = 'private/blocklist/redistribution-none.txt';
const GRAMMAR = /^[0-9a-f]{64} {2}[0-9]+ {2}[^\n]+$/;

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function feedLines(root: string, rel = FEED): string[] {
  const text = readFileSync(join(root, rel), 'utf8');
  expect(text.endsWith('\n')).toBe(true);
  return text.slice(0, -1).split('\n');
}

async function blocklist(root: string, extra: string[] = []) {
  const result = await gm(['packs', 'blocklist', '--json', ...extra], { env: { OGM_ASSETS_ROOT: root } });
  return { ...result, stats: result.out[0] ? JSON.parse(result.out[0]) : null };
}

describe('gm packs blocklist', () => {
  it('lists every byte of the redistribution:none collection and nothing of the CC0 one', async () => {
    const root = rightsLibrary();
    const { code, stats } = await blocklist(root);
    expect(code).toBe(0);
    const lines = feedLines(root);

    // The none collection: its map, its card's private preview, its derived variant and every manifest line.
    expect(lines).toContain(`${sha('private map bytes')}  17  ${ANNUAL}/maps/example-dungeon-01.png`);
    expect(lines).toContain(`${sha('private thumb bytes')}  19  private/previews/00/0000000000000000-thumb.webp`);
    expect(lines).toContain(`${sha('derived variant bytes')}  21  derived/profantasy-cartographers-annual/variant.png`);
    // A none pack: both its untouched download and its extracted files.
    expect(lines).toContain(`${sha('sidetrax zip bytes')}  18  ${SIDETRAX}/originals/sidetrax-60.zip`);
    expect(lines).toContain(`${sha('sidetrax wav bytes')}  18  ${SIDETRAX}/extracted/war-drums.wav`);
    for (const line of MANIFEST_LINES) {
      const [hash, bytes, path] = line.split('  ');
      expect(lines).toContain(`${hash}  ${bytes}  manifest/profantasy-cartographers-annual/${path}`);
    }

    // Nothing from the free Kenney collection: neither its extracted/original bytes nor its own preview.
    const cc0 = ['cc0 wall bytes', 'cc0 zip bytes', 'cc0 orc thumb bytes'].map(sha);
    expect(lines.filter((line) => cc0.includes(line.slice(0, 64)))).toEqual([]);
    expect(lines.filter((line) => line.includes('kenney-mini-dungeon'))).toEqual([]);

    expect(stats).toMatchObject({ collections: 3, collection_errors: [], manifest_lines: 2, lines: lines.length });
  });

  it('writes the consumer grammar: relative paths, two-space fields, bytewise sorted, unique', async () => {
    const root = rightsLibrary();
    await blocklist(root);
    const lines = feedLines(root);
    for (const line of lines) {
      expect(line).toMatch(GRAMMAR);
      expect(line.split('  ')[2]!.startsWith('/')).toBe(false);
      expect(line).not.toContain(root);
    }
    expect(lines).toEqual(sortLines(lines));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('sorts bytewise, which localeCompare and UTF-16 order get wrong', () => {
    const a = `${'0'.repeat(64)}  1  Z.png`;
    const b = `${'0'.repeat(64)}  1  a.png`;
    const astral = `${'0'.repeat(64)}  1  \u{1F600}.png`;
    const bmp = `${'0'.repeat(64)}  1  Ａ.png`;
    expect(sortLines([b, a, a])).toEqual([a, b]);
    // UTF-8 puts U+FF21 (EF BC A1) before U+1F600 (F0 9F 98 80); UTF-16 code units put the surrogate pair first.
    expect(sortLines([astral, bmp])).toEqual([bmp, astral]);
  });

  it('hashes nothing on a second run and writes a byte-identical feed', async () => {
    const root = rightsLibrary();
    const first = await blocklist(root);
    const before = readFileSync(join(root, FEED));
    const second = await blocklist(root);
    expect(first.stats.hashed).toBeGreaterThan(0);
    expect(second.stats).toMatchObject({ hashed: 0, cached: first.stats.hashed });
    expect(readFileSync(join(root, FEED)).equals(before)).toBe(true);
  });

  it('ignores a malformed cache entry and rehashes the file', async () => {
    const root = rightsLibrary();
    await blocklist(root);
    const cachePath = join(root, 'private/blocklist/cache.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, { sha256: string }>;
    const rel = Object.keys(cache)[0]!;
    cache[rel]!.sha256 = 'not-a-sha256';
    writeFileSync(cachePath, JSON.stringify(cache));

    const { code, stats } = await blocklist(root);
    expect(code).toBe(0);
    expect(stats.hashed).toBe(1);
    expect(feedLines(root).every((line) => GRAMMAR.test(line))).toBe(true);
  });

  it('rehashes a file whose size or mtime changed', async () => {
    const root = rightsLibrary();
    await blocklist(root);
    put(root, `${ANNUAL}/maps/example-dungeon-01.png`, 'changed map bytes!');
    const { stats } = await blocklist(root);
    expect(stats.hashed).toBe(1);
    expect(feedLines(root)).toContain(`${sha('changed map bytes!')}  18  ${ANNUAL}/maps/example-dungeon-01.png`);
  });

  it('rehashes a same-size edit whose mtime moved, and everything with --no-cache', async () => {
    const root = rightsLibrary();
    const first = await blocklist(root);
    const map = join(root, ANNUAL, 'maps/example-dungeon-01.png');
    const { mtime } = statSync(map);
    put(root, `${ANNUAL}/maps/example-dungeon-01.png`, 'PRIVATE MAP BYTES');
    utimesSync(map, mtime, new Date(mtime.getTime() + 5000));
    const { stats } = await blocklist(root);
    expect(stats.hashed).toBe(1);
    expect(feedLines(root)).toContain(`${sha('PRIVATE MAP BYTES')}  17  ${ANNUAL}/maps/example-dungeon-01.png`);
    expect((await blocklist(root, ['--no-cache'])).stats.hashed).toBe(first.stats.hashed);
  });

  it('reads rights from the cards on disk, not an older saved index', async () => {
    const root = rightsLibrary();
    await blocklist(root);
    const card = join(root, 'packs/kenney-mini-dungeon/collection.card.json');
    const doc = JSON.parse(readFileSync(card, 'utf8'));
    doc.rights.redistribution = 'none';
    for (const basis of doc.rights.basis) basis.redistribution = 'none';
    const { mtime } = statSync(card);
    writeFileSync(card, JSON.stringify(doc));
    utimesSync(card, mtime, new Date(mtime.getTime() - 60_000)); // older than the saved index
    await blocklist(root);
    expect(feedLines(root)).toContain(`${sha('cc0 wall bytes')}  14  packs/kenney-mini-dungeon/2.0/extracted/wall.glb`);
  });

  it('exits 1 naming a collection card it cannot read, still writing the rest', async () => {
    const root = rightsLibrary();
    writeFileSync(join(root, 'packs/sidetrax-pack-60-battle/collection.card.json'), '{ not json');
    const { code, err, stats } = await blocklist(root);
    expect(code).toBe(1);
    expect(err).toContain(
      'unreadable collection card, its files are not listed: packs/sidetrax-pack-60-battle/collection.card.json',
    );
    expect(feedLines(root).length).toBe(stats.lines);
  });

  it('warns about a referenced preview missing on disk and still writes the rest', async () => {
    const root = rightsLibrary();
    const { code, err, stats } = await blocklist(root);
    expect(code).toBe(0);
    // war-drums (Sidetrax, none) references a waveform the fixture never wrote.
    expect(err).toContain('missing: previews/90/90f96c5be94642bf-waveform.webp');
    expect(stats.missing).toContain('previews/90/90f96c5be94642bf-waveform.webp');
    expect(feedLines(root).length).toBe(stats.lines);
  });

  it('rejects traversal preview and manifest keys during card validation', async () => {
    const root = rightsLibrary();
    const outside = `${basename(root).toLowerCase()}-outside`;
    writeFileSync(join(dirname(root), outside), 'outside bytes');
    const traversal = `nested/../../${outside}`;

    const cardPath = join(root, ANNUAL, 'cards/example-dungeon-01.card.json');
    const card = JSON.parse(readFileSync(cardPath, 'utf8'));
    card.previews.thumb = traversal;
    writeFileSync(cardPath, JSON.stringify(card));
    const collectionPath = join(root, ANNUAL, 'collection.card.json');
    const collection = JSON.parse(readFileSync(collectionPath, 'utf8'));
    collection.collection_info.hash_manifest = traversal;
    writeFileSync(collectionPath, JSON.stringify(collection));

    const { code, err, stats } = await blocklist(root);
    expect(code).toBe(1);
    expect(err).toContain(`unreadable collection card, its files are not listed: ${ANNUAL}/collection.card.json`);
    expect(stats.collection_errors).toEqual([`${ANNUAL}/collection.card.json`]);
    expect(stats.unsafe_paths).toEqual([]);
    expect(feedLines(root).some((line) => line.includes('..'))).toBe(false);
    expect(feedLines(root).some((line) => line.startsWith(`${sha('outside bytes')}  `))).toBe(false);
  });

  it('refuses a preview whose parent symlink escapes the asset library', async () => {
    const root = rightsLibrary();
    const outside = join(dirname(root), `${basename(root).toLowerCase()}-outside-dir`);
    mkdirSync(outside);
    writeFileSync(join(outside, 'preview.webp'), 'outside preview');
    symlinkSync(outside, join(root, 'linked'));
    const cardPath = join(root, ANNUAL, 'cards/example-dungeon-01.card.json');
    const card = JSON.parse(readFileSync(cardPath, 'utf8'));
    card.previews.thumb = 'linked/preview.webp';
    writeFileSync(cardPath, JSON.stringify(card));

    const { code, err, stats } = await blocklist(root);
    expect(code).toBe(1);
    expect(err).toContain('unsafe path outside asset library: linked/preview.webp');
    expect(stats.unsafe_paths).toEqual(['linked/preview.webp']);
    expect(feedLines(root).some((line) => line.startsWith(`${sha('outside preview')}  `))).toBe(false);
  });

  it('writes to --out, else $OGM_BLOCKLIST_FILE', async () => {
    const root = rightsLibrary();
    const outDir = tempDir();
    await gm(['packs', 'blocklist', '--out', join(outDir, 'a.txt')], { env: { OGM_ASSETS_ROOT: root } });
    await gm(['packs', 'blocklist'], { env: { OGM_ASSETS_ROOT: root, OGM_BLOCKLIST_FILE: join(outDir, 'b.txt') } });
    expect(feedLines(outDir, 'a.txt')).toEqual(feedLines(outDir, 'b.txt'));
    expect(feedLines(outDir, 'a.txt').length).toBeGreaterThan(0);
  });

  it('exits 1 naming the path when --out cannot be written', async () => {
    const root = rightsLibrary();
    const locked = join(tempDir(), 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    const result = await gm(['packs', 'blocklist', '--out', join(locked, 'feed.txt')], {
      env: { OGM_ASSETS_ROOT: root },
    });
    chmodSync(locked, 0o700);
    expect(result.code).toBe(1);
    expect(result.err.at(-1)).toContain(locked);
  });

  it('appends one assets.blocklist event', async () => {
    const root = rightsLibrary();
    const events = join(tempDir(), 'events.jsonl');
    writeFileSync(events, '');
    await gm(['packs', 'blocklist'], { env: { OGM_ASSETS_ROOT: root, GM_EVENTS_FILE: events } });
    const lines = readFileSync(events, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: 'assets.blocklist', payload: { collections: 3 } });
  });
});
