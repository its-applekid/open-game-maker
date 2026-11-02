import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { WebGLRenderer } from 'three';

export interface GltfOptions {
  basisPath?: string;
}

export interface GltfHandle {
  loader: GLTFLoader;
  decode(bytes: ArrayBuffer, name: string, resourcePath?: string): Promise<GLTF>;
}

export function createGltf(renderer?: WebGLRenderer, options: GltfOptions = {}): GltfHandle {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let ktx2: Promise<KTX2Loader> | undefined;

  const enableKtx2 = () => {
    if (!renderer) return Promise.reject(new Error('KTX2 decoding requires a renderer'));
    if (ktx2) return ktx2;
    const request = import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
      const decoder = new KTX2Loader().setTranscoderPath(options.basisPath ?? 'basis/').detectSupport(renderer);
      loader.setKTX2Loader(decoder);
      return decoder;
    });
    ktx2 = request.catch((error: unknown) => {
      ktx2 = undefined;
      throw error;
    });
    return ktx2;
  };

  return {
    loader,
    async decode(bytes, name, resourcePath = '') {
      if (name.toLowerCase().includes('.ktx2')) await enableKtx2();
      return loader.parseAsync(bytes, resourcePath);
    },
  };
}
