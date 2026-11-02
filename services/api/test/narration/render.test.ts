import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FsBlobStore, type BlobHash, type BlobStore } from '@ogm/blob-store';
import { afterEach, describe, expect, it } from 'vitest';

import { NarrationCache } from '../../src/narration/cache.js';
import { NarrationRenderer } from '../../src/narration/render.js';
import { narrationKey } from '../../src/narration/key.js';
import { makeDeps } from '../helpers.js';
import { silentWav } from './helpers.js';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fakeHost(options: { badWav?: boolean; unsupported?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ogm-narration-host-'));
  roots.push(root);
  const wavPath = join(root, 'render.wav');
  let renders = 0;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, provider: 'fake' }));
      return;
    }
    if (request.method === 'POST' && request.url === '/internal/narration') {
      renders += 1;
      if (options.unsupported) {
        response.statusCode = 501;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: 'provider_has_no_render' }));
        return;
      }
      await writeFile(wavPath, options.badWav ? 'not a wav' : silentWav());
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          wav_path: wavPath,
          format: 'pcm_24000',
          alignment: [
            { text: 'hello', start_ms: 0, end_ms: 250 },
            { text: 'there', start_ms: 250, end_ms: 500 },
            { text: 'little', start_ms: 500, end_ms: 750 },
            { text: 'fox.', start_ms: 750, end_ms: 1_000 },
          ],
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake host did not bind');
  return { url: `http://127.0.0.1:${address.port}`, renders: () => renders, wavPath };
}

async function setup(hostUrl: string) {
  const deps = makeDeps();
  const blobRoot = await mkdtemp(join(tmpdir(), 'ogm-narration-blobs-'));
  roots.push(blobRoot);
  const blobStore = new FsBlobStore({
    root: blobRoot,
    signingKey: 'narration-test-signing-key-0123456789',
    publicOrigin: 'https://api.example.test',
  });
  const renderer = new NarrationRenderer({
    sqlite: deps.sqlite,
    blobStore,
    hostUrl,
    secret: 'voice-internal-test-secret',
    concurrency: 2,
  });
  return { deps, blobStore, renderer };
}

describe('narration renderer', () => {
  it('renders once, stores Opus and metadata, then serves the cache', async () => {
    const host = await fakeHost();
    const { deps, blobStore, renderer } = await setup(host.url);
    const line = { id: 'intro', text: 'hello there little fox.', voice: 'default', lang: 'en' };

    const first = await renderer.renderLines([line]);
    expect(first).toMatchObject([
      {
        id: 'intro',
        key: expect.stringMatching(/^[0-9a-f]{64}$/),
        audio_url: expect.stringContaining('/blobs/sha256/'),
        alignment_url: expect.stringContaining('/blobs/sha256/'),
        cached: false,
      },
    ]);
    const second = await renderer.renderLines([line]);
    expect(second).toMatchObject([{ id: 'intro', key: first[0]!.key, cached: true }]);
    expect(host.renders()).toBe(1);

    const cached = await new NarrationCache(deps.sqlite, blobStore).get(first[0]!.key!);
    expect(cached).not.toBeNull();
    expect(
      deps.sqlite.prepare("SELECT key FROM app_meta WHERE key LIKE 'narration/%' ORDER BY key").pluck().all(),
    ).toEqual([`narration/${first[0]!.key}.json`, `narration/${first[0]!.key}.opus`]);
    const metadata = await blobStore.open(cached!.alignmentHash);
    const chunks: Buffer[] = [];
    for await (const chunk of metadata!.stream) chunks.push(Buffer.from(chunk));
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toMatchObject({
      key: first[0]!.key,
      text: line.text,
      voice: 'default',
      engine: 'fake',
      lang: 'en',
      duration_ms: 1_000,
      format: 'opus',
    });
  });

  it('single-flights concurrent requests for the same key', async () => {
    const host = await fakeHost();
    const { renderer } = await setup(host.url);
    const line = { id: 'intro', text: 'hello there little fox.' };
    const [first, second] = await Promise.all([renderer.renderLines([line]), renderer.renderLines([line])]);
    expect(host.renders()).toBe(1);
    expect([first[0]!.cached, second[0]!.cached].sort()).toEqual([false, true]);
  });

  it('reports ffmpeg failure, caches nothing, and deletes the host WAV', async () => {
    const host = await fakeHost({ badWav: true });
    const { deps, blobStore, renderer } = await setup(host.url);
    const [result] = await renderer.renderLines([{ id: 'broken', text: 'bad audio' }]);
    expect(result).toEqual({ id: 'broken', status: 'failed', reason: 'transcode_failed' });
    expect(await readFile(host.wavPath).catch(() => null)).toBeNull();
    const keys = deps.sqlite.prepare("SELECT key FROM app_meta WHERE key LIKE 'narration/%'").pluck().all();
    expect(keys).toEqual([]);
    expect(blobStore).toBeDefined();
  });

  it('reports an unsupported provider without caching', async () => {
    const host = await fakeHost({ unsupported: true });
    const { deps, renderer } = await setup(host.url);
    await expect(renderer.renderLines([{ id: 'intro', text: 'hello' }])).resolves.toEqual([
      { id: 'intro', status: 'unsupported', reason: 'provider_has_no_render' },
    ]);
    expect(deps.sqlite.prepare("SELECT key FROM app_meta WHERE key LIKE 'narration/%'").pluck().all()).toEqual([]);
  });

  it('contains unexpected infrastructure failures to the affected line', async () => {
    const host = await fakeHost();
    const deps = makeDeps();
    const blobRoot = await mkdtemp(join(tmpdir(), 'ogm-narration-blobs-'));
    roots.push(blobRoot);
    const realStore = new FsBlobStore({
      root: blobRoot,
      signingKey: 'narration-test-signing-key-0123456789',
      publicOrigin: 'https://api.example.test',
    });
    const brokenHash = `sha256:${'0'.repeat(64)}` as BlobHash;
    const store: BlobStore = {
      put: (bytes, mime) => realStore.put(bytes, mime),
      head: (hash) =>
        hash === brokenHash ? Promise.reject(new Error('blob index unavailable')) : realStore.head(hash),
      signedGet: (hash, expiresAt) => realStore.signedGet(hash, expiresAt),
      delete: (hash) => realStore.delete(hash),
      open: (hash) => realStore.open(hash),
    };
    const bad = { id: 'bad', text: 'cached but unavailable' };
    const key = narrationKey({ text: bad.text, voice: 'default', engine: 'fake', version: 1, speed: 1, lang: 'en' });
    new NarrationCache(deps.sqlite, store).put(key, { audioHash: brokenHash, alignmentHash: brokenHash });
    const renderer = new NarrationRenderer({
      sqlite: deps.sqlite,
      blobStore: store,
      hostUrl: host.url,
      secret: 'voice-internal-test-secret',
      concurrency: 2,
    });

    await expect(renderer.renderLines([bad, { id: 'good', text: 'render me' }])).resolves.toMatchObject([
      { id: 'bad', status: 'failed', reason: 'render_failed' },
      { id: 'good', cached: false },
    ]);
  });

  it('sets deadlines on voice-host discovery and rendering', async () => {
    const signals: AbortSignal[] = [];
    const { deps, blobStore } = await setup('http://127.0.0.1:40401');
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return String(input).endsWith('/healthz')
        ? Response.json({ ok: true, provider: 'fake' })
        : Response.json({ error: 'provider_has_no_render' }, { status: 501 });
    };
    const timedRenderer = new NarrationRenderer({
      sqlite: deps.sqlite,
      blobStore,
      hostUrl: 'http://127.0.0.1:40401',
      secret: 'voice-internal-test-secret',
      concurrency: 2,
      fetch,
    });

    await expect(timedRenderer.renderLines([{ id: 'intro', text: 'hello' }])).resolves.toEqual([
      { id: 'intro', status: 'unsupported', reason: 'provider_has_no_render' },
    ]);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });
});
