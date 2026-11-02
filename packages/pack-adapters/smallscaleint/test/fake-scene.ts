import type { AssetLoader, ResolvedAsset } from '@gm/sdk/assets';
import type Phaser from 'phaser';

/** A synthetic sheet: every pixel of a cell holds that cell's number, `row * 100 + col`. */
export interface SyntheticSheet {
  width: number;
  height: number;
  pixels: Int32Array;
}

export function drawSheet(frame: number): SyntheticSheet {
  const width = 15 * frame;
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
  const listeners = new Map<string, (arg?: unknown) => void>();
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
      once(event: string, callback: (arg?: unknown) => void) {
        listeners.set(event, callback);
      },
      off(event: string) {
        listeners.delete(event);
      },
      start() {
        for (const [key, file] of pending.splice(0)) {
          if (!sheets.has(file.url)) return listeners.get('loaderror')?.({ key, src: file.url });
          loaded.set(key, file);
        }
        listeners.get('complete')?.();
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

  return { scene: scene as unknown as Phaser.Scene, sprite, loaded, animations, cell };
}

export function fakeLoader(resolved: Partial<ResolvedAsset>): AssetLoader {
  return {
    resolve: () => ({ url: 'https://game.test/assets/a1.png', file: 'a1.png', license: {}, ...resolved }),
  } as unknown as AssetLoader;
}
