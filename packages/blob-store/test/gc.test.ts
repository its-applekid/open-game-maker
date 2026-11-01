import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fc from 'fast-check';
import { afterEach, describe, expect, test } from 'vitest';

import { blobPath, FsBlobStore, gc, type BlobHash } from '../src/index.js';
import { runBlobGcCli } from '../src/cli.js';

const rootsToRemove: string[] = [];
const nowMs = Date.parse('2026-11-01T12:00:00.000Z');
const graceMs = 24 * 60 * 60 * 1000;

afterEach(async () => {
  await Promise.all(rootsToRemove.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ogm-blob-gc-'));
  rootsToRemove.push(root);
  return root;
}

function makeStore(root: string): FsBlobStore {
  return new FsBlobStore({ root, signingKey: '', publicOrigin: 'http://127.0.0.1' });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

describe('gc', () => {
  test('deletes exactly old non-roots and dry-run leaves every blob intact', async () => {
    const cases = fc.uniqueArray(
      fc.record({
        id: fc.integer({ min: 0, max: 1_000_000_000 }),
        rooted: fc.boolean(),
        old: fc.boolean(),
      }),
      { selector: (item) => item.id, minLength: 1, maxLength: 6 },
    );

    await fc.assert(
      fc.asyncProperty(cases, fc.boolean(), async (items, dryRun) => {
        const root = await makeRoot();
        const store = makeStore(root);
        const refs: Array<{ hash: BlobHash; rooted: boolean; old: boolean }> = [];

        for (const item of items) {
          const ref = await store.put(new TextEncoder().encode(String(item.id)), 'text/plain');
          const modified = item.old ? nowMs - graceMs - 1 : nowMs - graceMs + 1;
          await utimes(blobPath(root, ref.hash), modified / 1000, modified / 1000);
          refs.push({ hash: ref.hash, rooted: item.rooted, old: item.old });
        }

        const rootHashes = refs.filter((item) => item.rooted).map((item) => item.hash);
        const expectedDeleted = refs
          .filter((item) => !item.rooted && item.old)
          .map((item) => item.hash)
          .sort();
        const result = await gc(store, rootHashes, { graceMs, nowMs, dryRun });

        expect(result.scanned).toBe(refs.length);
        expect(result.deleted.sort()).toEqual(expectedDeleted);
        expect(result.kept).toBe(refs.length - expectedDeleted.length);
        for (const item of refs) {
          const shouldExist = dryRun || item.rooted || !item.old;
          expect(await exists(blobPath(root, item.hash))).toBe(shouldExist);
        }
      }),
      { numRuns: 200 },
    );
  }, 30_000);

  test('validates every root before deleting anything', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const ref = await store.put(new Uint8Array([1]), 'application/octet-stream');
    await utimes(blobPath(root, ref.hash), 0, 0);

    await expect(gc(store, [ref.hash, 'sha256:bad' as BlobHash], { graceMs: 0, nowMs })).rejects.toThrow(
      'Invalid blob hash',
    );
    expect(await exists(blobPath(root, ref.hash))).toBe(true);
  });

  test('accepts async roots and cleans only stale temporary files', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const rooted = await store.put(new Uint8Array([1]), 'application/octet-stream');
    const stale = join(root, 'tmp', 'stale');
    const fresh = join(root, 'tmp', 'fresh');
    await writeFile(stale, 'stale');
    await writeFile(fresh, 'fresh');
    await utimes(stale, 0, 0);
    await utimes(fresh, nowMs / 1000, nowMs / 1000);

    async function* roots(): AsyncGenerator<BlobHash> {
      yield rooted.hash;
    }

    await gc(store, roots(), { graceMs, nowMs, dryRun: true });
    expect(await exists(blobPath(root, rooted.hash))).toBe(true);
    expect(await exists(stale)).toBe(true);
    expect(await exists(fresh)).toBe(true);

    await gc(store, roots(), { graceMs, nowMs });
    expect(await exists(blobPath(root, rooted.hash))).toBe(true);
    expect(await exists(stale)).toBe(false);
    expect(await exists(fresh)).toBe(true);
  });
});

describe('ogm-blob-gc CLI', () => {
  test('is dry-run by default and applies deletion only with --apply', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const ref = await store.put(new Uint8Array([9]), 'application/octet-stream');
    await utimes(blobPath(root, ref.hash), 0, 0);
    const rootsFile = join(root, 'roots.txt');
    await writeFile(rootsFile, '# no roots\n');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) };

    expect(await runBlobGcCli(['--root', root, '--roots', rootsFile, '--grace-days', '0'], io, nowMs)).toBe(0);
    expect(JSON.parse(stdout.at(-1)!)).toMatchObject({ deleted: 1, dryRun: true });
    expect(await exists(blobPath(root, ref.hash))).toBe(true);

    expect(await runBlobGcCli(['--root', root, '--roots', rootsFile, '--grace-days', '0', '--apply'], io, nowMs)).toBe(
      0,
    );
    expect(JSON.parse(stdout.at(-1)!)).toMatchObject({ deleted: 1, dryRun: false });
    expect(await exists(blobPath(root, ref.hash))).toBe(false);
    expect(stderr).toEqual([]);
  });

  test('malformed roots fail before any blob is deleted', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const ref = await store.put(new Uint8Array([4]), 'application/octet-stream');
    await utimes(blobPath(root, ref.hash), 0, 0);
    const rootsFile = join(root, 'roots.txt');
    await writeFile(rootsFile, 'sha256:xyz\n');
    const stderr: string[] = [];

    expect(
      await runBlobGcCli(
        ['--root', root, '--roots', rootsFile, '--grace-days', '0', '--apply'],
        { stdout: () => undefined, stderr: (line) => stderr.push(line) },
        nowMs,
      ),
    ).toBe(1);
    expect(stderr.at(-1)).toContain('Invalid blob hash');
    expect(await exists(blobPath(root, ref.hash))).toBe(true);
    expect(await readFile(rootsFile, 'utf8')).toBe('sha256:xyz\n');
  });
});
