import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { validateCard } from '@ogm/contracts';

import { gm, tempDir } from './helpers.js';

const temporary: string[] = [];

function fresh(prefix: string): string {
  const path = tempDir(prefix);
  temporary.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function unknownFixture(): Promise<string> {
  const input = fresh('gm-pack-input-');
  await mkdir(join(input, 'Textures'));
  await writeFile(join(input, 'wall.obj'), 'o wall\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  await sharp({ create: { width: 16, height: 16, channels: 4, background: '#ff00ffff' } })
    .png()
    .toFile(join(input, 'Textures', 'wall.png'));
  return input;
}

describe('gm packs import', () => {
  it('writes a valid, stable collection that remains hidden while quarantined', async () => {
    const assets = fresh('gm-pack-assets-');
    const input = await unknownFixture();
    const env = { OGM_ASSETS_ROOT: assets };
    const first = await gm(['packs', 'import', input, '--id', 'vendor-test', '--version', '1', '--json'], { env });
    expect(first.code, first.err.join('\n')).toBe(0);
    const summary = JSON.parse(first.out[0]) as { collection: string; cards: number; status: string };
    expect(summary).toMatchObject({ collection: 't1:vendor-test@1', cards: 2, status: 'quarantined' });

    const pack = join(assets, 'packs', 'vendor-test');
    await expect(stat(join(pack, '1', 'originals', 'wall.obj'))).resolves.toBeTruthy();
    await expect(stat(join(pack, '1', 'extracted', 'wall.obj'))).resolves.toBeTruthy();
    const collection = JSON.parse(await readFile(join(pack, 'collection.card.json'), 'utf8'));
    expect(collection.collection_info).not.toHaveProperty('creation_choice');
    expect(validateCard(collection)).toMatchObject({ ok: true });
    const before = await readFile(join(pack, 'collection.card.json'), 'utf8');

    const second = await gm(['packs', 'import', input, '--id', 'vendor-test', '--version', '1', '--json'], { env });
    expect(second.code).toBe(0);
    expect(await readFile(join(pack, 'collection.card.json'), 'utf8')).toBe(before);

    const search = await gm(
      ['assets', 'search', '--include-draft', '--collection', 't1:vendor-test@1', '--json'],
      { env },
    );
    expect(search.out).toEqual([]);
  });

  it('refuses a bad queue manifest before writing collection files', async () => {
    const assets = fresh('gm-pack-queue-');
    const quarantine = join(assets, 'inbox', 'quarantine', 'bad-drop');
    await mkdir(join(quarantine, 'files'), { recursive: true });
    await writeFile(
      join(quarantine, 'manifest.json'),
      JSON.stringify({ drop_id: 'drop-bad', name: 'Bad', integrity_ok: false, problems: ['checksum mismatch'], files: [] }),
    );
    await writeFile(
      join(assets, 'inbox', 'queue.jsonl'),
      `${JSON.stringify({ drop_id: 'drop-bad', name: 'Bad', manifest: 'quarantine/bad-drop/manifest.json' })}\n`,
    );

    const result = await gm(['packs', 'import', '--from-queue', 'drop-bad', '--id', 'drive-bad', '--json'], {
      env: { OGM_ASSETS_ROOT: assets },
    });
    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toContain('integrity');
    await expect(stat(join(assets, 'packs', 'drive-bad'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('confirms a quarantined collection with a named human and updates intake state', async () => {
    const assets = fresh('gm-pack-confirm-');
    const input = await unknownFixture();
    const env = { OGM_ASSETS_ROOT: assets };
    await gm(['packs', 'import', input, '--id', 'confirm-test', '--version', '1', '--json'], { env });

    const result = await gm(
      ['packs', 'import', '--confirm', 't1:confirm-test@1', '--license', 'CC0-1.0', '--confirmed-by', 'kevin', '--json'],
      { env },
    );
    expect(result.code, result.err.join('\n')).toBe(0);
    const card = JSON.parse(await readFile(join(assets, 'packs', 'confirm-test', 'collection.card.json'), 'utf8'));
    expect(card).toMatchObject({ status: 'draft', license: 'CC0-1.0', rights: { processing: 'any' } });
    expect(card.rights.basis[0]).toMatchObject({ type: 'license', confirmed_by: 'kevin' });
    const search = await gm(
      ['assets', 'search', '--include-draft', '--collection', 't1:confirm-test@1', '--json'],
      { env },
    );
    expect(search.out.map((line) => {
      const hit = JSON.parse(line) as { id: string; collection?: string };
      return hit.collection ?? hit.id;
    })).toContain('t1:confirm-test@1');
  });
});
