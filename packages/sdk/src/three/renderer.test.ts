import type { Camera, Scene } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rendererSpies = vi.hoisted(() => ({
  compileAsync: vi.fn(),
  construct: vi.fn(),
  dispose: vi.fn(),
  getContext: vi.fn(),
  render: vi.fn(),
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
}));

vi.mock('three', () => ({
  WebGLRenderer: class {
    readonly info = { render: { calls: 3, triangles: 12 }, memory: { textures: 4 } };
    readonly domElement: HTMLCanvasElement;

    constructor(options: { canvas: HTMLCanvasElement; preserveDrawingBuffer?: boolean }) {
      rendererSpies.construct(options);
      this.domElement = options.canvas;
    }

    compileAsync = rendererSpies.compileAsync;
    dispose = rendererSpies.dispose;
    getContext = rendererSpies.getContext;
    render = rendererSpies.render;
    setPixelRatio = rendererSpies.setPixelRatio;
    setSize = rendererSpies.setSize;
  },
}));

import { DPR_CAP, createRenderer } from './renderer.js';

describe('createRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rendererSpies.compileAsync.mockResolvedValue(undefined);
    rendererSpies.getContext.mockReturnValue({
      getExtension: vi.fn(() => ({ UNMASKED_RENDERER_WEBGL: 0x9246 })),
      getParameter: vi.fn(() => 'ANGLE (Test GPU)'),
    });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
  });

  it.each([
    ['desktop', 2],
    ['mobile', 1.5],
    ['low', 1],
  ] as const)('caps %s pixel ratio at %s', (tier, cap) => {
    createRenderer(document.createElement('canvas'), { tier });

    expect(DPR_CAP[tier]).toBe(cap);
    expect(rendererSpies.setPixelRatio).toHaveBeenCalledWith(cap);
  });

  it('resizes without changing CSS dimensions and recompiles before rendering', async () => {
    const wrapper = createRenderer(document.createElement('canvas'), { tier: 'mobile' });
    const scene = {} as Scene;
    const camera = {} as Camera;

    wrapper.resize(800, 450, 2);
    await wrapper.compile(scene, camera);

    expect(rendererSpies.setSize).toHaveBeenCalledWith(800, 450, false);
    expect(rendererSpies.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(rendererSpies.compileAsync).toHaveBeenCalledWith(scene, camera);
  });

  it('preserves the drawing buffer when capture mode requests it', () => {
    const canvas = document.createElement('canvas');

    createRenderer(canvas, { tier: 'low', preserveDrawingBuffer: true });

    expect(rendererSpies.construct).toHaveBeenCalledWith(
      expect.objectContaining({ canvas, preserveDrawingBuffer: true }),
    );
  });

  it('reports renderer counters and backend', () => {
    const wrapper = createRenderer(document.createElement('canvas'), { tier: 'low' });

    expect(wrapper.info()).toEqual({
      calls: 3,
      triangles: 12,
      frameMs: 0,
      textureBytes: 0,
      backend: 'ANGLE (Test GPU)',
    });
  });

  it('surfaces WebGL context loss without allowing the browser default', () => {
    const onContextLost = vi.fn();
    const canvas = document.createElement('canvas');
    const wrapper = createRenderer(canvas, { tier: 'desktop', onContextLost });
    const event = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onContextLost).toHaveBeenCalledOnce();

    wrapper.dispose();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

    expect(onContextLost).toHaveBeenCalledOnce();
    expect(rendererSpies.dispose).toHaveBeenCalledOnce();
  });
});
