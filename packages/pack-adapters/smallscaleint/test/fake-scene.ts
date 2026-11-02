import type { AssetLoader, ResolvedAsset } from '@gm/sdk/assets';
import type Phaser from 'phaser';

/** A synthetic sheet: every pixel of a cell holds that cell's number, `row * 100 + col`. */
export interface SyntheticSheet {
  width: number;
  height: number;
  pixels: Int32Array;
}

export function drawSheet(frame: number, cols = 15): SyntheticSheet {
  const width = cols * frame;
  const height = 8 * frame;
  const pixels = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels[y * width + x] = Math.floor(y / frame) * 100 + Math.floor(x / frame);
  }
  return { width, height, pixels };
}

interface Loaded {
  url: string;
  frameWidth: number;
  frameHeight: number;
}

/** Just the Phaser scene surface the adapter touches; spritesheet frames are cut row-major as Phaser does. */
export function fakeScene(sheets: Map<string, SyntheticSheet>) {
  const loaded = new Map<string, Loaded>();
  const pending: [string, Loaded][] = [];
  const animations = new Map<string, { frames: number[]; frameRate: number; repeat: number }>();
  const listeners = new Map<string, ((arg?: unknown) => void)[]>();
  const emit = (event: string, arg?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(arg);
  };
  /** Files queued by someone else in the same loader batch, as `[key, url]`. */
  const foreign: [string, string][] = [];
  const sprite = {
    texture: '',
    frame: -1,
    x: 0,
    y: 0,
    depth: 0,
    setTexture(key: string, frame: number) {
      sprite.texture = key;
      sprite.frame = frame;
      return sprite;
    },
    setPosition(x: number, y: number) {
      sprite.x = x;
      sprite.y = y;
      return sprite;
    },
    setDepth(depth: number) {
      sprite.depth = depth;
      return sprite;
    },
  };

  const scene = {
    load: {
      spritesheet(key: string, url: string, config: { frameWidth: number; frameHeight: number }) {
        pending.push([key, { url, ...config }]);
      },
      on(event: string, callback: (arg?: unknown) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), callback]);
      },
      once(event: string, callback: (arg?: unknown) => void) {
        const once = (arg?: unknown) => {
          scene.load.off(event, once);
          callback(arg);
        };
        scene.load.on(event, once);
      },
      off(event: string, callback: (arg?: unknown) => void) {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((listener) => listener !== callback),
        );
      },
      start() {
        for (const [key, url] of foreign.splice(0)) emit('loaderror', { key, src: url });
        for (const [key, file] of pending.splice(0)) {
          if (sheets.has(file.url)) loaded.set(key, file);
          else emit('loaderror', { key, src: file.url });
        }
        emit('complete');
      },
    },
    textures: { exists: (key: string) => loaded.has(key) },
    anims: {
      exists: (key: string) => animations.has(key),
      generateFrameNumbers: (_key: string, range: { start: number; end: number }) =>
        Array.from({ length: range.end - range.start + 1 }, (_, i) => ({ frame: range.start + i })),
      create(config: { key: string; frames: { frame: number }[]; frameRate: number; repeat: number }) {
        animations.set(config.key, {
          frames: config.frames.map((f) => f.frame),
          frameRate: config.frameRate,
          repeat: config.repeat,
        });
      },
    },
    add: {
      sprite(_x: number, _y: number, key: string, frame: number) {
        return sprite.setTexture(key, frame);
      },
    },
  };

  /** The url and the number drawn at the centre of `frame` in the texture `key`. */
  function cell(key: string, frame: number): { url: string; row: number; col: number } {
    const file = loaded.get(key)!;
    const sheet = sheets.get(file.url)!;
    const across = sheet.width / file.frameWidth;
    const x = (frame % across) * file.frameWidth + file.frameWidth / 2;
    const y = Math.floor(frame / across) * file.frameHeight + file.frameHeight / 2;
    const drawn = sheet.pixels[y * sheet.width + x]!;
    return { url: file.url, row: Math.floor(drawn / 100), col: drawn % 100 };
  }

  return { scene: scene as unknown as Phaser.Scene, sprite, loaded, animations, foreign, cell };
}

export function fakeLoader(resolved: Partial<ResolvedAsset>): AssetLoader {
  return {
    resolve: () => ({ url: 'https://game.test/assets/a1.png', file: 'a1.png', license: {}, ...resolved }),
  } as unknown as AssetLoader;
}
