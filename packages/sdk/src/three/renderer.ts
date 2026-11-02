import type { Tier } from '@ogm/contracts';
import { WebGLRenderer, type Camera, type Scene } from 'three';

import { DPR_CAP } from '../assets/tier.js';
import type { RenderInfo } from '../core/runtime.js';

export { DPR_CAP };

export interface RendererOptions {
  tier: Tier;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  onContextLost?: () => void;
}

export interface RendererHandle {
  renderer: WebGLRenderer;
  resize(width: number, height: number, dpr: number): void;
  compile(scene: Scene, camera: Camera): Promise<void>;
  info(): RenderInfo;
  dispose(): void;
}

function backend(renderer: WebGLRenderer): string {
  const context = renderer.getContext();
  const extension = context.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  if (!extension) return 'webgl';
  const value = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
  return typeof value === 'string' && value.length > 0 ? value : 'webgl';
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions): RendererHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: options.antialias ?? options.tier === 'desktop',
    powerPreference: 'high-performance',
    preserveDrawingBuffer: options.preserveDrawingBuffer,
  });
  const cap = DPR_CAP[options.tier];
  let frameMs = 0;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, cap));

  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const before = performance.now();
    render(scene, camera);
    frameMs = Math.max(0, performance.now() - before);
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    options.onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  let disposed = false;

  return {
    renderer,
    resize(width, height, dpr) {
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(dpr, cap));
    },
    async compile(scene, camera) {
      await renderer.compileAsync(scene, camera);
    },
    info() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frameMs,
        textureBytes: 0,
        backend: backend(renderer),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose();
    },
  };
}
