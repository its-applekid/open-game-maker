import { createHash, randomUUID } from 'node:crypto';
import { chmod, link, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assertBlobHash, blobHex, type BlobHash } from './hash.js';
import { normalizePathPrefix, roundExpiry, signBlobUrl } from './sign.js';

export type AssetRef = { hash: BlobHash; bytes: number; mime: string };
export type SignedGet = { url: string; expiresAt: string };

export interface BlobStore {
  put(bytes: Uint8Array | AsyncIterable<Uint8Array>, mime: string): Promise<AssetRef>;
  head(hash: BlobHash): Promise<AssetRef | null>;
  signedGet(hash: BlobHash, expiresAt: Date): Promise<SignedGet>;
  delete(hash: BlobHash): Promise<void>;
  open(hash: BlobHash): Promise<{ ref: AssetRef; stream: NodeJS.ReadableStream } | null>;
}

type BlobMetadata = { bytes: number; mime: string; createdAt: string };
const storeRoots = new WeakMap<FsBlobStore, string>();
const storePathPrefixes = new WeakMap<FsBlobStore, string>();

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isAlreadyPresent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EEXIST';
}

function validateMime(mime: string): void {
  if (!mime || /[\r\n]/.test(mime)) throw new TypeError('Invalid blob mime type');
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function* chunks(input: Uint8Array | AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  if (input instanceof Uint8Array) {
    yield input;
    return;
  }

  for await (const chunk of input) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('Blob stream yielded non-bytes');
    yield chunk;
  }
}

export function blobPath(root: string, hash: BlobHash): string {
  return join(root, 'blobs', 'sha256', blobHex(hash));
}

export class FsBlobStore implements BlobStore {
  readonly #root: string;
  readonly #signingKey: string;
  readonly #publicOrigin: string;
  readonly #pathPrefix: string;

  constructor(opts: { root: string; signingKey: string; publicOrigin: string; pathPrefix?: string }) {
    if (!opts.root) throw new TypeError('Blob root is required');

    const origin = new URL(opts.publicOrigin);
    if (origin.search || origin.hash) {
      throw new TypeError('Blob public origin cannot have a query or fragment');
    }

    this.#root = opts.root;
    this.#signingKey = opts.signingKey;
    this.#publicOrigin = origin.toString().replace(/\/$/, '');
    this.#pathPrefix = normalizePathPrefix(opts.pathPrefix);
    storeRoots.set(this, this.#root);
    storePathPrefixes.set(this, normalizePathPrefix(`${origin.pathname.replace(/\/$/, '')}${this.#pathPrefix}`));
  }

  async put(input: Uint8Array | AsyncIterable<Uint8Array>, mime: string): Promise<AssetRef> {
    validateMime(mime);
    let precomputedHash: BlobHash | undefined;

    if (input instanceof Uint8Array) {
      precomputedHash = `sha256:${createHash('sha256').update(input).digest('hex')}`;
      const existing = await this.head(precomputedHash);
      if (existing) return existing;
    }

    await mkdir(join(this.#root, 'tmp'), { recursive: true });
    await mkdir(join(this.#root, 'blobs', 'sha256'), { recursive: true });

    const temporaryPath = join(this.#root, 'tmp', randomUUID());
    const file = await open(temporaryPath, 'wx', 0o600);
    const hash = precomputedHash ? undefined : createHash('sha256');
    let bytes = 0;

    try {
      for await (const chunk of chunks(input)) {
        hash?.update(chunk);
        bytes += chunk.byteLength;
        await file.writeFile(chunk);
      }
      await file.sync();
    } catch (error) {
      await file.close().catch(() => undefined);
      await unlinkIfPresent(temporaryPath);
      throw error;
    }
    await file.close();

    const blobHash = precomputedHash ?? (`sha256:${hash!.digest('hex')}` as BlobHash);
    const existing = await this.head(blobHash);
    if (existing) {
      await unlinkIfPresent(temporaryPath);
      return existing;
    }

    const destination = blobPath(this.#root, blobHash);
    try {
      await chmod(temporaryPath, 0o444);
      await link(temporaryPath, destination);
    } catch (error) {
      if (!isAlreadyPresent(error)) throw error;
    } finally {
      await unlinkIfPresent(temporaryPath);
    }

    const metadata = await this.#publishMetadata(blobHash, { bytes, mime, createdAt: new Date().toISOString() });
    return { hash: blobHash, bytes: metadata.bytes, mime: metadata.mime };
  }

  async head(hash: BlobHash): Promise<AssetRef | null> {
    assertBlobHash(hash);
    const metadata = await this.#readMetadata(hash);
    if (!metadata) return null;

    try {
      await stat(blobPath(this.#root, hash));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    return { hash, bytes: metadata.bytes, mime: metadata.mime };
  }

  async signedGet(hash: BlobHash, expiresAt: Date): Promise<SignedGet> {
    assertBlobHash(hash);
    const exp = roundExpiry(expiresAt);
    const sig = signBlobUrl(this.#signingKey, hash, exp);
    const url = `${this.#publicOrigin}${this.#pathPrefix}/sha256/${blobHex(hash)}?exp=${exp}&sig=${sig}`;
    return { url, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async delete(hash: BlobHash): Promise<void> {
    assertBlobHash(hash);
    const destination = blobPath(this.#root, hash);
    await unlinkIfPresent(`${destination}.json`);
    await chmod(destination, 0o600).catch((error: unknown) => {
      if (!isNotFound(error)) throw error;
    });
    await unlinkIfPresent(destination);
  }

  async open(hash: BlobHash): Promise<{ ref: AssetRef; stream: NodeJS.ReadableStream } | null> {
    const ref = await this.head(hash);
    if (!ref) return null;

    try {
      const handle = await open(blobPath(this.#root, hash), 'r');
      return { ref, stream: handle.createReadStream() };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async #readMetadata(hash: BlobHash): Promise<BlobMetadata | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(`${blobPath(this.#root, hash)}.json`, 'utf8'));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Number.isSafeInteger((parsed as BlobMetadata).bytes) ||
        (parsed as BlobMetadata).bytes < 0 ||
        typeof (parsed as BlobMetadata).mime !== 'string' ||
        typeof (parsed as BlobMetadata).createdAt !== 'string'
      ) {
        throw new Error('Invalid blob metadata');
      }
      return parsed as BlobMetadata;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async #publishMetadata(hash: BlobHash, metadata: BlobMetadata): Promise<BlobMetadata> {
    const existing = await this.#readMetadata(hash);
    if (existing) return existing;

    const temporaryPath = join(this.#root, 'tmp', `${randomUUID()}.json`);
    const destination = `${blobPath(this.#root, hash)}.json`;
    try {
      await writeFile(temporaryPath, JSON.stringify(metadata), { flag: 'wx', mode: 0o444 });
      try {
        await link(temporaryPath, destination);
      } catch (error) {
        if (!isAlreadyPresent(error)) throw error;
      }
    } finally {
      await unlinkIfPresent(temporaryPath);
    }

    const stored = await this.#readMetadata(hash);
    if (!stored) throw new Error('Blob metadata was not published');
    return stored;
  }
}

export function getFsBlobRoot(store: FsBlobStore): string {
  const root = storeRoots.get(store);
  if (root === undefined) throw new TypeError('Invalid filesystem blob store');
  return root;
}

export function getFsBlobPathPrefix(store: FsBlobStore): string {
  const pathPrefix = storePathPrefixes.get(store);
  if (pathPrefix === undefined) throw new TypeError('Invalid filesystem blob store');
  return pathPrefix;
}
