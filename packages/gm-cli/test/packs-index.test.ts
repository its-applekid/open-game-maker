import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gm, tempDir } from './helpers.js';
import { MANIFEST_LINES, SOURCE_CARD, rightsLibrary } from './library-rights.js';

const ORC = 't1:kenney-mini-dungeon/character-orc@2.0';

function sha(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/** Every `*.card.json` under the library, path → bytes. */
function cardBytes(root: string): Map<string, string> {
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.card.json'));
  return new Map(files.map((file) => [file, readFileSync(join(root, file), 'utf8')]));
}

type Entry = { id: string; previews?: { blob?: Record<string, string> }; visibility?: string };

function entry(root: string, id: string): Entry {
  const index = JSON.parse(readFileSync(join(root, 'index', 'cards.index.json'), 'utf8')) as { cards: Entry[] };
  return index.cards.find((card) => card.id === id)!;
}

function blobs(blobRoot: string): string[] {
  try {
    return readdirSync(join(blobRoot, 'blobs', 'sha256')).filter((name) => !name.endsWith('.json'));
  } catch {
    return [];
  }
}

describe('gm packs index', () => {
  it('rebuilds the index and prints counts and errors', async () => {
    const root = rightsLibrary();
    const result = await gm(['packs', 'index', '--json'], { env: { OGM_ASSETS_ROOT: root } });
    expect(result.code).toBe(0);
    const summary = JSON.parse(result.out[0]!);
    expect(summary.cards).toBeGreaterThan(0);
    expect(summary.errors).toBe(2);
    expect(summary.error_paths).toEqual(
      expect.arrayContaining(['packs/kenney-mini-dungeon/cards/broken-status.card.json']),
    );
    expect(summary.put).toBeUndefined();
  });

  it('imports previews and private manifests as blobs, maps them on index entries only, and re-runs put nothing', async () => {
    const root = rightsLibrary();
    const blobRoot = tempDir('gm-blobs-');
    const cardsBefore = cardBytes(root);
    const env = { OGM_ASSETS_ROOT: root, OGM_BLOB_ROOT: blobRoot };

    const first = await gm(['packs', 'index', '--import-previews', '--json'], { env });
    expect(first.code).toBe(0);
    // Two previews (one public, one private) and one private hash manifest.
    expect(JSON.parse(first.out[0]!)).toMatchObject({ put: 3, skipped: 0 });
    const stored = ['cc0 orc thumb bytes', 'private thumb bytes', `${MANIFEST_LINES.join('\n')}\n`];
    expect(blobs(blobRoot).sort()).toEqual(stored.map((text) => sha(text).slice('sha256:'.length)).sort());

    expect(entry(root, SOURCE_CARD)).toMatchObject({
      previews: { blob: { thumb: sha('private thumb bytes') } },
      visibility: 'private',
    });
    expect(entry(root, ORC)).toMatchObject({
      previews: { blob: { thumb: sha('cc0 orc thumb bytes') } },
      visibility: 'library',
    });
    expect(cardBytes(root)).toEqual(cardsBefore);

    const second = await gm(['packs', 'index', '--import-previews', '--json'], { env });
    expect(JSON.parse(second.out[0]!)).toMatchObject({ put: 0, skipped: 3 });
    expect(blobs(blobRoot)).toHaveLength(3);
  });

  it('exits 2 naming OGM_BLOB_ROOT when --import-previews has no blob root', async () => {
    const root = rightsLibrary();
    const result = await gm(['packs', 'index', '--import-previews'], { env: { OGM_ASSETS_ROOT: root } });
    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('OGM_BLOB_ROOT');
  });
});
