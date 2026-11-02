import { AssetLoader } from '@gm/sdk/assets';
import { createGltf } from '@gm/sdk/three';
import { AmbientLight, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

import { conventions } from '../../src/conventions.js';
import { createRiggedCharacter } from '../../src/rigged-character.js';
import { makeRig, toGlb } from '../fixtures/make-rig.js';

const BASE = `${location.origin}/assets/`;

async function main() {
  const files: Record<string, ArrayBuffer> = {
    'hero.glb': await toGlb(makeRig()),
    'lib.glb': await toGlb(makeRig({ clips: [{ name: 'Idle_A', duration: 2, angle: 0.8 }] })),
  };
  const manifest = {
    version: 1,
    tiers: ['desktop'],
    files: Object.fromEntries(
      Object.entries(files).map(([file, bytes]) => [file, { bytes: bytes.byteLength, decoders: [] }]),
    ),
    assets: {
      hero: {
        file: { '*': 'hero.glb' },
        meta: { rig: { rig_type: 'humanoid', rig_id: conventions.rigs.value.shared, joint_count: 3 } },
        license: { id: 'CC0-1.0', use: 'any' },
      },
      lib: { file: { '*': 'lib.glb' }, license: { id: 'CC0-1.0', use: 'any' } },
    },
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === `${BASE}manifest.json`) return Response.json(manifest);
    return new Response(files[url.slice(BASE.length)]);
  };

  const renderer = new WebGLRenderer({ preserveDrawingBuffer: true });
  renderer.setSize(256, 256);
  document.body.append(renderer.domElement);
  const loader = new AssetLoader({ manifestUrl: `${BASE}manifest.json`, tier: 'desktop' });
  await loader.load();
  const character = await createRiggedCharacter(loader, createGltf(renderer), 'hero', {
    clipLibraryIds: ['lib'],
    crossFade: 0,
  });

  const scene = new Scene();
  scene.background = new Color(0x202830);
  scene.add(new AmbientLight(0xffffff, 1), character.root);
  const camera = new PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.set(0, 1, 4);
  camera.lookAt(0, 1, 0);

  const pose = (t: number) => {
    character.sync({ pos: [0, 0, 0], yaw: 0, action: 'idle', t });
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL();
  };
  const rest = pose(0);
  const idle = pose(1);
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  Object.assign(window, {
    __still: { rest, idle, backend: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) },
  });
}

void main().catch((error: unknown) => Object.assign(window, { __still: { error: String(error) } }));
