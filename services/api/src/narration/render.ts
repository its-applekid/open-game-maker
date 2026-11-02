import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { BlobStore } from '@ogm/blob-store';
import type { Sqlite } from '@ogm/db';
import { z } from 'zod';

import type { AppDeps } from '../app/types.js';
import { NarrationCache, type NarrationCacheEntry } from './cache.js';
import { narrationKey, type NarrationEngine } from './key.js';

const run = promisify(execFile);
const signedUrlTtlMs = 60 * 60 * 1_000;
const hostHealthTimeoutMs = 2_000;
const renderTimeoutMs = 65_000;

export const NarrationLine = z
  .object({
    id: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(5_000),
    voice: z.string().trim().min(1).max(120).optional(),
    lang: z.string().trim().min(1).max(35).optional(),
  })
  .strict();

export type NarrationLineInput = z.infer<typeof NarrationLine>;
export type NarrationSuccess = {
  id: string;
  key: string;
  audio_url: string;
  alignment_url: string;
  cached: boolean;
};
export type NarrationFailure = { id: string; status: 'unsupported' | 'failed'; reason: string };
export type NarrationResult = NarrationSuccess | NarrationFailure;

type Alignment = { text: string; start_ms: number; end_ms: number };
type NarrationMeta = {
  key: string;
  text: string;
  voice: string;
  engine: string;
  lang: string;
  duration_ms: number;
  format: 'opus';
  alignment: Alignment[];
};

const HealthResponse = z.object({ provider: z.string() });
const HostResponse = z.object({
  wav_path: z.string().min(1),
  format: z.enum(['pcm_16000', 'pcm_24000', 'pcm_44100']),
  alignment: z.array(
    z.object({ text: z.string(), start_ms: z.number().int().nonnegative(), end_ms: z.number().int().nonnegative() }),
  ),
});

type RendererOptions = {
  sqlite: Sqlite;
  blobStore: BlobStore;
  hostUrl: string;
  secret: string;
  concurrency: number;
  fetch?: typeof globalThis.fetch;
  transcode?: (wavPath: string, opusPath: string) => Promise<void>;
};

export class NarrationRenderer {
  readonly #cache: NarrationCache;
  readonly #fetch: typeof globalThis.fetch;
  readonly #hostUrl: string;
  readonly #inflight = new Map<string, Promise<NarrationResult>>();
  #engine?: Promise<NarrationEngine>;

  constructor(private readonly options: RendererOptions) {
    this.#cache = new NarrationCache(options.sqlite, options.blobStore);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#hostUrl = options.hostUrl.replace(/\/$/, '');
  }

  async renderLines(lines: readonly NarrationLineInput[]): Promise<NarrationResult[]> {
    const results = new Array<NarrationResult>(lines.length);
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= lines.length) return;
        const line = lines[index]!;
        try {
          results[index] = await this.renderLine(line);
        } catch {
          results[index] = { id: line.id, status: 'failed', reason: 'render_failed' };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, lines.length) }, worker));
    return results;
  }

  private async renderLine(line: NarrationLineInput): Promise<NarrationResult> {
    const voice = line.voice ?? 'default';
    const lang = line.lang ?? 'en';
    let engine: NarrationEngine;
    try {
      this.#engine ??= this.discoverEngine();
      engine = await this.#engine;
    } catch {
      this.#engine = undefined;
      return { id: line.id, status: 'failed', reason: 'host_unavailable' };
    }
    const key = narrationKey({ text: line.text, voice, engine, version: 1, speed: 1, lang });
    const cached = await this.#cache.get(key);
    if (cached) return this.success(line.id, key, cached, true);

    const active = this.#inflight.get(key);
    if (active) {
      const result = await active;
      return 'key' in result ? { ...result, id: line.id, cached: true } : { ...result, id: line.id };
    }

    const render = this.renderFresh(line, { key, voice, lang, engine });
    this.#inflight.set(key, render);
    try {
      return await render;
    } finally {
      this.#inflight.delete(key);
    }
  }

  private async renderFresh(
    line: NarrationLineInput,
    spec: { key: string; voice: string; lang: string; engine: NarrationEngine },
  ): Promise<NarrationResult> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#hostUrl}/internal/narration`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ogm-internal': this.options.secret },
        body: JSON.stringify({ text: line.text, voice_id: spec.voice, format: 'pcm_24000' }),
        signal: AbortSignal.timeout(renderTimeoutMs),
      });
    } catch {
      return { id: line.id, status: 'failed', reason: 'host_unavailable' };
    }
    if (response.status === 501) return { id: line.id, status: 'unsupported', reason: 'provider_has_no_render' };
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: unknown } | null;
      return {
        id: line.id,
        status: 'failed',
        reason: typeof error?.error === 'string' ? error.error : `host_${response.status}`,
      };
    }

    const parsed = HostResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return { id: line.id, status: 'failed', reason: 'host_invalid_response' };
    const temp = await mkdtemp(join(tmpdir(), 'ogm-narration-'));
    const opusPath = join(temp, `${spec.key}.opus`);
    try {
      try {
        await (this.options.transcode ?? transcode)(parsed.data.wav_path, opusPath);
      } catch {
        return { id: line.id, status: 'failed', reason: 'transcode_failed' };
      }
      try {
        const audioRef = await this.options.blobStore.put(await readFile(opusPath), 'audio/ogg; codecs=opus');
        const meta: NarrationMeta = {
          key: spec.key,
          text: line.text,
          voice: spec.voice,
          engine: spec.engine,
          lang: spec.lang,
          duration_ms: parsed.data.alignment.at(-1)?.end_ms ?? 0,
          format: 'opus',
          alignment: parsed.data.alignment,
        };
        const alignmentRef = await this.options.blobStore.put(Buffer.from(JSON.stringify(meta)), 'application/json');
        const entry = { audioHash: audioRef.hash, alignmentHash: alignmentRef.hash };
        this.#cache.put(spec.key, entry);
        return this.success(line.id, spec.key, entry, false);
      } catch {
        return { id: line.id, status: 'failed', reason: 'storage_failed' };
      }
    } finally {
      await Promise.allSettled([rm(parsed.data.wav_path, { force: true }), rm(temp, { recursive: true, force: true })]);
    }
  }

  private async success(
    id: string,
    key: string,
    entry: NarrationCacheEntry,
    cached: boolean,
  ): Promise<NarrationSuccess> {
    const expires = new Date(Date.now() + signedUrlTtlMs);
    const [audio, alignment] = await Promise.all([
      this.options.blobStore.signedGet(entry.audioHash, expires),
      this.options.blobStore.signedGet(entry.alignmentHash, expires),
    ]);
    return { id, key, audio_url: audio.url, alignment_url: alignment.url, cached };
  }

  private async discoverEngine(): Promise<NarrationEngine> {
    const response = await this.#fetch(`${this.#hostUrl}/healthz`, {
      signal: AbortSignal.timeout(hostHealthTimeoutMs),
    });
    if (!response.ok) throw new Error('voice_host_unavailable');
    const { provider } = HealthResponse.parse(await response.json());
    if (provider === 'fake') return 'fake';
    if (provider === 'elevenlabs_agents') return 'elevenlabs';
    if (provider === 'openai_realtime') return 'openai';
    throw new Error('voice_host_provider_unknown');
  }
}

async function transcode(wavPath: string, opusPath: string): Promise<void> {
  await run(
    '/usr/bin/ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      wavPath,
      '-c:a',
      'libopus',
      '-b:a',
      '48k',
      '-f',
      'ogg',
      opusPath,
    ],
    {
      timeout: renderTimeoutMs,
      killSignal: 'SIGKILL',
    },
  );
}

const renderers = new WeakMap<AppDeps, NarrationRenderer>();

export function getNarrationRenderer(deps: AppDeps): NarrationRenderer | null {
  if (!deps.config.voiceHostInternalUrl || !deps.config.voiceInternalSecret) return null;
  const existing = renderers.get(deps);
  if (existing) return existing;
  const renderer = new NarrationRenderer({
    sqlite: deps.sqlite,
    blobStore: deps.blobStore,
    hostUrl: deps.config.voiceHostInternalUrl,
    secret: deps.config.voiceInternalSecret,
    concurrency: deps.config.narrationConcurrency,
  });
  renderers.set(deps, renderer);
  return renderer;
}
