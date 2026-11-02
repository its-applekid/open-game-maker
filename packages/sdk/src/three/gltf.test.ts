import type { WebGLRenderer } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gltfSpies = vi.hoisted(() => ({
  ktx2: vi.fn(),
  meshopt: vi.fn(),
  parse: vi.fn(),
}));

const ktx2Spies = vi.hoisted(() => ({
  constructed: vi.fn(),
  detectSupport: vi.fn(),
  transcoderPath: vi.fn(),
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setKTX2Loader(loader: unknown) {
      gltfSpies.ktx2(loader);
      return this;
    }

    setMeshoptDecoder(decoder: unknown) {
      gltfSpies.meshopt(decoder);
      return this;
    }

    parseAsync(bytes: ArrayBuffer, path: string) {
      return gltfSpies.parse(bytes, path);
    }
  },
}));

vi.mock('three/addons/loaders/KTX2Loader.js', () => ({
  KTX2Loader: class {
    constructor() {
      ktx2Spies.constructed();
    }

    setTranscoderPath(path: string) {
      ktx2Spies.transcoderPath(path);
      return this;
    }

    detectSupport(renderer: unknown) {
      ktx2Spies.detectSupport(renderer);
      return this;
    }
  },
}));

import { createGltf } from './gltf.js';

describe('createGltf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gltfSpies.parse.mockResolvedValue({ scene: {} });
  });

  it('configures meshopt and decodes ordinary GLB data without KTX2', async () => {
    const gltf = createGltf({} as WebGLRenderer);
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    await expect(gltf.decode(bytes, 'cube.glb')).resolves.toEqual({ scene: {} });

    expect(gltfSpies.meshopt).toHaveBeenCalledOnce();
    expect(ktx2Spies.constructed).not.toHaveBeenCalled();
    expect(gltfSpies.parse).toHaveBeenCalledWith(bytes, '');
  });

  it('constructs and detects KTX2 support lazily only once', async () => {
    const renderer = {} as WebGLRenderer;
    const gltf = createGltf(renderer, { basisPath: '/basis/' });
    const bytes = new ArrayBuffer(0);

    await gltf.decode(bytes, 'texture.ktx2');
    await gltf.decode(bytes, 'second.ktx2');

    expect(ktx2Spies.constructed).toHaveBeenCalledOnce();
    expect(ktx2Spies.transcoderPath).toHaveBeenCalledWith('/basis/');
    expect(ktx2Spies.detectSupport).toHaveBeenCalledWith(renderer);
    expect(gltfSpies.ktx2).toHaveBeenCalledOnce();
  });
});
