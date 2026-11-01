import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fc from 'fast-check';
import { afterEach, describe, expect, test } from 'vitest';

import { blobPath, FsBlobStore, type BlobHash } from '../src/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ogm-blob-store-'));
  roots.push(root);
  return root;
}

function makeStore(root: string): FsBlobStore {
  return new FsBlobStore({
    root,
    signingKey: 'test-signing-key-padded-to-32-bytes-min',
    publicOrigin: 'https://example.test:8443',
  });
}

async function entries(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('FsBlobStore', () => {
  test('put is content-addressed and idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 4096 }), async (bytes) => {
        const root = await makeRoot();
        const store = makeStore(root);
        const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

        const first = await store.put(bytes, 'application/octet-stream');
        const blobStat = await stat(blobPath(root, first.hash));
        const metadataBefore = await readFile(`${blobPath(root, first.hash)}.json`, 'utf8');
        const second = await store.put(bytes, 'text/plain');
        const metadataAfter = await readFile(`${blobPath(root, first.hash)}.json`, 'utf8');

        expect(first).toEqual({
          hash: expected,
          bytes: bytes.byteLength,
          mime: 'application/octet-stream',
        });
        expect(second).toEqual(first);
        expect(metadataAfter).toBe(metadataBefore);
        expect((await stat(blobPath(root, first.hash))).ino).toBe(blobStat.ino);
        expect(await entries(join(root, 'tmp'))).toEqual([]);
      }),
      { numRuns: 200 },
    );
  }, 30_000);

  test('concurrent puts publish one blob and one sidecar', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const bytes = new TextEncoder().encode('same bytes');

    const refs = await Promise.all([store.put(bytes, 'text/plain'), store.put(bytes, 'text/plain')]);

    expect(refs[0]).toEqual(refs[1]);
    expect((await entries(join(root, 'blobs', 'sha256'))).sort()).toEqual(
      [refs[0].hash.slice(7), `${refs[0].hash.slice(7)}.json`].sort(),
    );
    expect(await entries(join(root, 'tmp'))).toEqual([]);
  });

  test('a failed stream leaves no published or temporary file', async () => {
    const root = await makeRoot();
    const store = makeStore(root);

    async function* failingBytes(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('partial');
      throw new Error('stream failed');
    }

    await expect(store.put(failingBytes(), 'text/plain')).rejects.toThrow('stream failed');
    expect(await entries(join(root, 'blobs', 'sha256'))).toEqual([]);
    expect(await entries(join(root, 'tmp'))).toEqual([]);
  });

  test('streams every chunk into the stored hash and bytes', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const streamed = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])];
    const expectedBytes = Buffer.concat(streamed.map((chunk) => Buffer.from(chunk)));

    async function* bytes(): AsyncGenerator<Uint8Array> {
      yield* streamed;
    }

    const ref = await store.put(bytes(), 'application/octet-stream');
    const opened = await store.open(ref.hash);

    expect(ref).toEqual({
      hash: `sha256:${createHash('sha256').update(expectedBytes).digest('hex')}`,
      bytes: expectedBytes.byteLength,
      mime: 'application/octet-stream',
    });
    expect(await readStream(opened!.stream)).toEqual(expectedBytes);
  });

  test('head and open return the stored metadata and bytes', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const bytes = new TextEncoder().encode('open me');
    const ref = await store.put(bytes, 'text/plain');

    expect(await store.head(ref.hash)).toEqual(ref);
    const opened = await store.open(ref.hash);
    expect(opened?.ref).toEqual(ref);
    expect(await readStream(opened!.stream)).toEqual(Buffer.from(bytes));
    expect((await stat(blobPath(root, ref.hash))).mode & 0o777).toBe(0o444);
  });

  test('missing blobs return null and delete is idempotent', async () => {
    const root = await makeRoot();
    const store = makeStore(root);
    const missing = `sha256:${'f'.repeat(64)}` as BlobHash;

    expect(await store.head(missing)).toBeNull();
    expect(await store.open(missing)).toBeNull();
    await expect(store.delete(missing)).resolves.toBeUndefined();

    const ref = await store.put(new Uint8Array([1, 2, 3]), 'application/octet-stream');
    await store.delete(ref.hash);
    await expect(store.delete(ref.hash)).resolves.toBeUndefined();
    expect(await store.head(ref.hash)).toBeNull();
  });

  test('blobPath rejects malformed hashes', () => {
    expect(() => blobPath('/store', 'sha256:../../x' as BlobHash)).toThrow('Invalid blob hash');
  });
});
