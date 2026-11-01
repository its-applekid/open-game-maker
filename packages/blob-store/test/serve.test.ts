import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { FsBlobStore, parseBlobRequest, roundExpiry, serveBlob, signBlobUrl, type BlobHash } from '../src/index.js';

const signingKey = 'serve-test-signing-key-with-32-bytes-or-more';
let root: string;
let store: FsBlobStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ogm-blob-serve-'));
  store = new FsBlobStore({
    root,
    signingKey,
    publicOrigin: 'https://example.test:8443',
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('parseBlobRequest', () => {
  test('parses only an exact prefixed blob path with one exp and sig', () => {
    const hex = 'a'.repeat(64);
    expect(parseBlobRequest(new URL(`https://example.test/blobs/sha256/${hex}?exp=123&sig=abc`))).toEqual({
      hash: `sha256:${hex}`,
      exp: 123,
      sig: 'abc',
    });
    expect(parseBlobRequest(new URL(`https://example.test/blobs/sha256/${hex}?exp=123&exp=124&sig=abc`))).toBeNull();
    expect(parseBlobRequest(new URL(`https://example.test/x/sha256/${hex}?exp=123&sig=abc`))).toBeNull();
    expect(parseBlobRequest(new URL(`https://example.test/blobs/sha256/${hex}?exp=1.5&sig=abc`))).toBeNull();
  });
});

describe('serveBlob', () => {
  test('serves stored bytes with immutable and sniff-safe headers', async () => {
    const bytes = new TextEncoder().encode('served bytes');
    const ref = await store.put(bytes, 'text/plain');
    const signed = await store.signedGet(ref.hash, new Date('2026-11-01T12:00:00.000Z'));

    const response = await serveBlob(store, signingKey, new URL(signed.url), Date.parse('2026-11-01T12:00:00.000Z'));

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': 'sandbox',
      'Content-Disposition': 'inline',
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'text/plain',
      ETag: `"${ref.hash.slice(7)}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    expect(await readStream(response.stream!)).toEqual(Buffer.from(bytes));
  });

  test('rejects tampered and expired signatures before opening a blob', async () => {
    const ref = await store.put(new Uint8Array([1, 2, 3]), 'application/octet-stream');
    const signed = await store.signedGet(ref.hash, new Date('2026-11-01T12:00:00.000Z'));
    const tampered = new URL(signed.url);
    const signature = tampered.searchParams.get('sig')!;
    tampered.searchParams.set('sig', `${signature[0] === '0' ? '1' : '0'}${signature.slice(1)}`);

    const badSignature = await serveBlob(store, signingKey, tampered, Date.parse('2026-11-01T12:00:00.000Z'));
    const expired = await serveBlob(store, signingKey, new URL(signed.url), Date.parse(signed.expiresAt));

    expect(badSignature).toEqual({ status: 403, headers: { 'Cache-Control': 'no-store' } });
    expect(expired).toEqual({ status: 403, headers: { 'Cache-Control': 'no-store' } });
  });

  test('returns 404 for malformed requests and valid signatures for missing blobs', async () => {
    const missing = `sha256:${createHash('sha256').update('missing').digest('hex')}` as BlobHash;
    const exp = roundExpiry(new Date('2026-11-01T12:00:00.000Z'));
    const sig = signBlobUrl(signingKey, missing, exp);
    const hex = missing.slice(7);

    expect(
      await serveBlob(
        store,
        signingKey,
        new URL(`https://example.test/blobs/sha256/${hex}?exp=${exp}&sig=${sig}`),
        Date.parse('2026-11-01T12:00:00.000Z'),
      ),
    ).toEqual({ status: 404, headers: {} });
    expect(await serveBlob(store, signingKey, new URL(`https://example.test/blobs/sha256/${hex}`))).toEqual({
      status: 404,
      headers: {},
    });
    expect(
      await serveBlob(store, signingKey, new URL(`https://example.test/x/sha256/${hex}?exp=${exp}&sig=${sig}`)),
    ).toEqual({ status: 404, headers: {} });
  });

  test('supports a custom path prefix end to end', async () => {
    const customStore = new FsBlobStore({
      root,
      signingKey,
      publicOrigin: 'https://example.test/base/',
      pathPrefix: '/media/',
    });
    const ref = await customStore.put(new Uint8Array([7]), 'application/octet-stream');
    const signed = await customStore.signedGet(ref.hash, new Date('2026-11-01T12:00:00.000Z'));

    expect(new URL(signed.url).pathname).toBe('/base/media/sha256/' + ref.hash.slice(7));
    expect(
      (await serveBlob(customStore, signingKey, new URL(signed.url), Date.parse('2026-11-01T12:00:00.000Z'))).status,
    ).toBe(200);
  });
});
