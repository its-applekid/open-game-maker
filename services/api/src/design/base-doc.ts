import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { DesignDocSchema, gameManifestSchema, type Build, type DesignDoc, type GameManifest } from '@ogm/contracts';

const pathSegment = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface BaseDocSource {
  load(gameId: string, buildId: string): Promise<DesignDoc>;
  manifest(gameId: string, buildId: string): Promise<GameManifest>;
  status?(gameId: string, buildId: string): Promise<Build['status']>;
}

function assertPathSegment(value: string): void {
  if (!pathSegment.test(value)) throw new Error(`invalid release id: ${value}`);
}

export class FsBaseDocSource implements BaseDocSource {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async load(gameId: string, buildId: string): Promise<DesignDoc> {
    return DesignDocSchema.parse(await this.#readJson(gameId, buildId, 'design', 'design.json'));
  }

  async manifest(gameId: string, buildId: string): Promise<GameManifest> {
    return gameManifestSchema.parse(await this.#readJson(gameId, buildId, 'manifest.json'));
  }

  async status(gameId: string, buildId: string): Promise<Build['status']> {
    const manifest = await this.manifest(gameId, buildId);
    const status = (manifest as Record<string, unknown>).status;
    if (status === 'building' || status === 'tested' || status === 'failed') return status;
    return 'tested';
  }

  async #readJson(gameId: string, buildId: string, ...path: string[]): Promise<unknown> {
    assertPathSegment(gameId);
    assertPathSegment(buildId);
    return JSON.parse(await readFile(join(this.#root, gameId, buildId, ...path), 'utf8')) as unknown;
  }
}

export class MemoryBaseDocSource implements BaseDocSource {
  readonly #documents = new Map<string, DesignDoc>();
  readonly #manifests = new Map<string, GameManifest>();
  readonly #statuses = new Map<string, Build['status']>();

  set(gameId: string, buildId: string, doc: DesignDoc, manifest?: GameManifest): this {
    const key = `${gameId}\u0000${buildId}`;
    this.#documents.set(key, structuredClone(doc));
    if (manifest) this.#manifests.set(key, structuredClone(manifest));
    this.#statuses.set(key, 'tested');
    return this;
  }

  setStatus(gameId: string, buildId: string, status: Build['status']): this {
    this.#statuses.set(`${gameId}\u0000${buildId}`, status);
    return this;
  }

  async load(gameId: string, buildId: string): Promise<DesignDoc> {
    const doc = this.#documents.get(`${gameId}\u0000${buildId}`);
    if (!doc) throw new Error(`base design not found for ${gameId}/${buildId}`);
    return structuredClone(doc);
  }

  async manifest(gameId: string, buildId: string): Promise<GameManifest> {
    const manifest = this.#manifests.get(`${gameId}\u0000${buildId}`);
    if (!manifest) throw new Error(`base manifest not found for ${gameId}/${buildId}`);
    return structuredClone(manifest);
  }

  async status(gameId: string, buildId: string): Promise<Build['status']> {
    return this.#statuses.get(`${gameId}\u0000${buildId}`) ?? 'tested';
  }
}
