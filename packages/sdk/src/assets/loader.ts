import { assetManifestSchema, type AssetManifest, type Tier } from '@ogm/contracts/assets';
import {
  ImageBitmapLoader,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Mesh,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { AssetNotFound, AssetUnavailable } from './errors.js';
import { createGltf, type GltfHandle } from '../three/gltf.js';

type AssetEntry = AssetManifest['assets'][string];

export interface ResolvedAsset {
  url: string;
  file: string;
  mesh?: string;
  bounds?: [number, number, number];
  license: AssetEntry['license'];
}

export interface AssetLoaderOptions {
  manifestUrl: string;
  tier: Tier;
  fetch?: typeof globalThis.fetch;
  audioContext?: BaseAudioContext;
  basisPath?: string;
}

const TIER_CHAINS = {
  desktop: ['desktop', '*'],
  mobile: ['mobile', 'desktop', '*'],
  low: ['low', 'mobile', 'desktop', '*'],
} as const satisfies Record<Tier, readonly (Tier | '*')[]>;

function absoluteUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    if (!globalThis.location?.href) {
      throw new TypeError(`Asset manifest URL must be absolute outside a browser: ${url}`);
    }
    return new URL(url, globalThis.location.href).toString();
  }
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function firstMesh(gltf: GLTF): Mesh | undefined {
  let found: Mesh | undefined;
  gltf.scene.traverse((object) => {
    if (!found && isMesh(object)) found = object;
  });
  return found;
}

function offlineAudioContext(): BaseAudioContext {
  if (typeof globalThis.OfflineAudioContext !== 'function') {
    throw new Error('audio() requires an audioContext when OfflineAudioContext is unavailable');
  }
  return new globalThis.OfflineAudioContext(1, 1, 44_100);
}

export class AssetLoader {
  readonly tier: Tier;
  readonly #manifestUrl: string;
  readonly #basisPath: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #audioContext: BaseAudioContext | undefined;
  readonly #files = new Map<string, Promise<ArrayBuffer>>();
  readonly #gltfs = new Map<string, Promise<GLTF>>();
  #manifest: AssetManifest | undefined;
  #manifestPromise: Promise<AssetManifest> | undefined;
  #renderer: WebGLRenderer | undefined;
  #gltfDecoder: GltfHandle | undefined;

  constructor(options: AssetLoaderOptions) {
    this.tier = options.tier;
    this.#manifestUrl = absoluteUrl(options.manifestUrl);
    this.#basisPath = new URL(options.basisPath ?? 'basis/', this.#manifestUrl).toString();
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#audioContext = options.audioContext;
  }

  load(): Promise<AssetManifest> {
    this.#manifestPromise ??= this.#loadManifest();
    return this.#manifestPromise;
  }

  resolve(id: string): ResolvedAsset {
    const manifest = this.#loadedManifest();
    const entry = manifest.assets[id];
    if (!entry) throw new AssetNotFound(id);

    const tried = TIER_CHAINS[this.tier];
    const file = tried.map((tier) => entry.file[tier]).find((candidate) => candidate !== undefined);
    if (!file) throw new AssetUnavailable(id, tried);

    return {
      url: new URL(file, this.#manifestUrl).toString(),
      file,
      ...(entry.mesh ? { mesh: entry.mesh } : {}),
      ...(entry.bounds ? { bounds: entry.bounds } : {}),
      license: entry.license,
    };
  }

  async preload(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.#fetchFile(this.resolve(id).file)));
  }

  async mesh(id: string): Promise<Mesh> {
    const resolved = this.resolve(id);
    const gltf = await this.#gltf(resolved.file);
    const named = resolved.mesh ? gltf.scene.getObjectByName(resolved.mesh) : undefined;
    const mesh = named && isMesh(named) ? named : firstMesh(gltf);
    if (!mesh) {
      const expected = resolved.mesh ? ` named ${resolved.mesh}` : '';
      throw new Error(`Asset ${id} contains no mesh${expected}`);
    }
    return mesh;
  }

  async texture(id: string): Promise<Texture> {
    const resolved = this.resolve(id);
    const bytes = await this.#fetchFile(resolved.file);
    if (typeof URL.createObjectURL !== 'function') {
      throw new Error(`Asset ${id} cannot be decoded because object URLs are unavailable`);
    }

    const objectUrl = URL.createObjectURL(new Blob([bytes]));
    try {
      let texture: Texture;
      if (typeof globalThis.createImageBitmap === 'function') {
        const image = await new ImageBitmapLoader().loadAsync(objectUrl);
        texture = new Texture(image);
      } else {
        texture = await new TextureLoader().loadAsync(objectUrl);
      }
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async audio(id: string): Promise<AudioBuffer> {
    const resolved = this.resolve(id);
    const bytes = await this.#fetchFile(resolved.file);
    const context = this.#audioContext ?? offlineAudioContext();
    return context.decodeAudioData(bytes.slice(0));
  }

  attachRenderer(renderer: WebGLRenderer): void {
    this.#renderer = renderer;
    this.#gltfDecoder = createGltf(renderer, { basisPath: this.#basisPath });
  }

  async #loadManifest(): Promise<AssetManifest> {
    try {
      const response = await this.#fetch(this.#manifestUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = assetManifestSchema.parse(await response.json());
      this.#manifest = parsed;
      return parsed;
    } catch (cause) {
      throw new Error(`Failed to load asset manifest ${this.#manifestUrl}`, { cause });
    }
  }

  #loadedManifest(): AssetManifest {
    if (!this.#manifest) throw new Error(`Asset manifest is not loaded: call load() first`);
    return this.#manifest;
  }

  #fetchFile(file: string): Promise<ArrayBuffer> {
    const existing = this.#files.get(file);
    if (existing) return existing;

    const url = new URL(file, this.#manifestUrl).toString();
    const request = this.#fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to fetch asset file ${url}: HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    this.#files.set(file, request);
    return request;
  }

  #gltf(file: string): Promise<GLTF> {
    const existing = this.#gltfs.get(file);
    if (existing) return existing;

    const request = this.#parseGltf(file).catch((error: unknown) => {
      this.#gltfs.delete(file);
      throw error;
    });
    this.#gltfs.set(file, request);
    return request;
  }

  async #parseGltf(file: string): Promise<GLTF> {
    const metadata = this.#loadedManifest().files[file];
    if (!metadata) throw new Error(`Asset file is missing from the manifest: ${file}`);

    if (metadata.decoders.includes('ktx2') && !this.#renderer) {
      throw new Error(`Asset file ${file} uses KTX2; call attachRenderer() before decoding it`);
    }

    const bytes = await this.#fetchFile(file);
    this.#gltfDecoder ??= createGltf(this.#renderer, { basisPath: this.#basisPath });
    return this.#gltfDecoder.decode(bytes, file, new URL('.', new URL(file, this.#manifestUrl)).toString());
  }
}

export function createAssetLoader(options: AssetLoaderOptions): AssetLoader {
  return new AssetLoader(options);
}
