declare module 'pixelfx/core/index.js' {
  interface PixelFrame {
    w: number;
    h: number;
    color: Uint32Array;
    light: Uint32Array;
  }

  interface PixelFx {
    update(delta: number): void;
    draw(frame: PixelFrame, layer?: 'back' | 'front'): void;
  }

  export function createFrame(w: number, h: number, ox?: number, oy?: number): PixelFrame;
  export function clearFrame(frame: PixelFrame): PixelFrame;
  export function createFx(module: unknown, options?: Record<string, unknown>): PixelFx;
  export function composite(
    frame: PixelFrame,
    output: Uint8ClampedArray<ArrayBuffer>,
    background?: number | Uint32Array | null,
    light?: number,
  ): Uint8ClampedArray<ArrayBuffer>;
}

declare module 'pixelfx/fx/*.js' {
  const effect: Record<string, unknown>;
  export = effect;
}
