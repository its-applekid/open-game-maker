import { readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunJsonWorkerOptions, WorkerRecord } from '../src/packs/workers.js';
import { gm, library, tempDir } from './helpers.js';

const worker = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('../src/packs/workers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/packs/workers.js')>();
  return { ...actual, runJsonWorker: worker.run };
});

const MUSIC = 'packs/kenney-music-loops/cards';

function emitMusic(options: RunJsonWorkerOptions): void {
  options.onRecord({
    card: `${MUSIC}/infinite-descent.card.json`,
    status: 'tagged',
    flags: ['low-confidence'],
  });
}

function successfulWorkers(): void {
  worker.run.mockImplementation(async (options: RunJsonWorkerOptions) => {
    if (options.label === 'audio cards') emitMusic(options);
    return { stderr: '', stderrTruncated: false };
  });
}

beforeEach(() => {
  worker.run.mockReset();
});

describe('gm packs tag', () => {
  it('runs bounded offline stages, validates cards, reconciles counts, and emits once', async () => {
    successfulWorkers();
    const assetsRoot = library();
    const eventsFile = join(tempDir('gm-tag-events-'), 'events.jsonl');

    const result = await gm(
      ['packs', 'tag', '--kind', 'audio', '--only', 'kenney-music-loops', '--workers', '32', '--json'],
      { env: { OGM_ASSETS_ROOT: assetsRoot, GM_EVENTS_FILE: eventsFile } },
    );

    expect(result.code, result.err.join('\n')).toBe(0);
    expect(worker.run).toHaveBeenCalledTimes(2);
    const calls = worker.run.mock.calls.map(([options]) => options as RunJsonWorkerOptions);
    expect(calls.map((call) => call.label)).toEqual(['audio analysis', 'audio cards']);
    const expectedKeys = [
      'GM_EVENTS_FILE',
      'HF_HUB_OFFLINE',
      'HOME',
      'MKL_NUM_THREADS',
      'NUMEXPR_NUM_THREADS',
      'OGM_ASSETS_ROOT',
      'OGM_TORCH_THREADS',
      'OMP_NUM_THREADS',
      'OPENBLAS_NUM_THREADS',
      'PATH',
      'TOKENIZERS_PARALLELISM',
      'TRANSFORMERS_OFFLINE',
    ];
    expect(Object.keys(calls[0].env).sort()).toEqual(expectedKeys);
    expect(calls[0].env).not.toHaveProperty('OPENAI_API_KEY');
    expect(calls[0].args).toContain('--json');

    const output = result.out.map((line) => JSON.parse(line) as Record<string, unknown>);
    const summary = output.at(-1)?.summary as {
      cards: number;
      workers: { requested: number; effective: number };
    };
    expect(summary.cards).toBe(1);
    expect(summary.workers).toEqual({
      requested: 32,
      effective: Math.max(1, Math.floor(availableParallelism() / 3)),
    });
    const collection = JSON.parse(
      await readFile(join(assetsRoot, 'packs/kenney-music-loops/collection.card.json'), 'utf8'),
    ) as { collection_info: { counts: Record<string, number> } };
    expect(collection.collection_info.counts).toEqual({ audio: 2, 'audio/music/loop': 2 });
    const events = (await readFile(eventsFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'packs.tag', payload: { kind: 'audio', cards: 1 } });
  });

  it('refuses rights-ineligible collections before spawning a worker', async () => {
    const assetsRoot = library();
    const path = join(assetsRoot, 'packs/kenney-music-loops/collection.card.json');
    const collection = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    collection.rights = { ...(collection.rights as object), uses: ['in-game'] };
    await writeFile(path, `${JSON.stringify(collection, null, 2)}\n`);

    const result = await gm(['packs', 'tag', '--kind', 'audio', '--only', 'kenney-music-loops'], {
      env: { OGM_ASSETS_ROOT: assetsRoot },
    });

    expect(result.code).toBe(2);
    expect(result.err.join('\n')).toContain('effective rights do not allow local vision-input');
    expect(worker.run).not.toHaveBeenCalled();
  });

  it.each([
    ['traversing', '../escape.card.json'],
    ['absolute', '/tmp/escape.card.json'],
    ['wrong collection', 'packs/drive-2026-10-26-dungeon-sfx/cards/door-creak.card.json'],
  ])('rejects a %s worker card path and restores prior cards', async (_case, card) => {
    const assetsRoot = library();
    const priorPath = join(assetsRoot, MUSIC, 'infinite-descent.card.json');
    const before = await readFile(priorPath);
    worker.run.mockImplementation(async (options: RunJsonWorkerOptions) => {
      if (options.label === 'audio cards') options.onRecord({ card, status: 'tagged', flags: [] });
      return { stderr: '', stderrTruncated: false };
    });

    const result = await gm(['packs', 'tag', '--kind', 'audio', '--only', 'kenney-music-loops'], {
      env: { OGM_ASSETS_ROOT: assetsRoot },
    });

    expect(result.code).toBe(1);
    expect(result.err.join('\n')).toContain('prior cards restored');
    expect(await readFile(priorPath)).toEqual(before);
  });

  it('restores an existing card byte-for-byte when a worker writes invalid JSON', async () => {
    const assetsRoot = library();
    const cardPath = join(assetsRoot, MUSIC, 'night-patrol.card.json');
    const before = await readFile(cardPath);
    worker.run.mockImplementation(async (options: RunJsonWorkerOptions) => {
      if (options.label === 'audio cards') {
        await writeFile(cardPath, '{broken');
        options.onRecord({
          card: `${MUSIC}/night-patrol.card.json`,
          status: 'tagged',
          flags: [],
        } satisfies WorkerRecord);
      }
      return { stderr: '', stderrTruncated: false };
    });

    const result = await gm(['packs', 'tag', '--kind', 'audio', '--only', 'kenney-music-loops'], {
      env: { OGM_ASSETS_ROOT: assetsRoot },
    });

    expect(result.code).toBe(1);
    expect(result.err.join('\n')).toContain('prior cards restored');
    expect(await readFile(cardPath)).toEqual(before);
  });
});
