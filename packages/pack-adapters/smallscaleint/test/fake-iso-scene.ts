import type { AssetLoader } from '@gm/sdk/assets';
import type Phaser from 'phaser';

interface FakeImage {
  x: number;
  y: number;
  texture: string;
  depth: number;
  visible: boolean;
  origin: [number, number];
  setOrigin(x: number, y: number): FakeImage;
  setDepth(depth: number): FakeImage;
  setVisible(visible: boolean): FakeImage;
}

export function fakeIsoScene(missing: readonly string[] = []) {
  const loaded = new Map<string, string>();
  const pending: [string, string][] = [];
  const listeners = new Map<string, ((arg?: unknown) => void)[]>();
  const images: FakeImage[] = [];
  const tilemaps: {
    orientation: number;
    orientationAtCreate?: number;
    tilesets: unknown[][];
    tiles?: number[][];
    depth?: number;
    position?: [number, number];
  }[] = [];
  const emit = (event: string, arg?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(arg);
  };
  const scene = {
    textures: { exists: (key: string) => loaded.has(key) },
    load: {
      image(key: string, url: string) {
        pending.push([key, url]);
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
        for (const [key, url] of pending.splice(0)) {
          if (missing.includes(key)) emit('loaderror', { key, src: url });
          else loaded.set(key, url);
        }
        emit('complete');
      },
    },
    make: {
      tilemap() {
        const record = { orientation: 0, tilesets: [] as unknown[][] };
        tilemaps.push(record);
        return {
          get orientation() {
            return record.orientation;
          },
          set orientation(value: number) {
            record.orientation = value;
          },
          addTilesetImage(...args: unknown[]) {
            record.tilesets.push(args);
            return { name: args[0] };
          },
          createBlankLayer() {
            record.orientationAtCreate = record.orientation;
            return {
              putTilesAt(tiles: number[][]) {
                record.tiles = tiles;
              },
              putTileAt(gid: number, x: number, y: number) {
                record.tiles![y]![x] = gid;
              },
              removeTileAt(x: number, y: number) {
                record.tiles![y]![x] = -1;
              },
              setDepth(depth: number) {
                record.depth = depth;
                return this;
              },
              setPosition(x: number, y: number) {
                record.position = [x, y];
                return this;
              },
            };
          },
        };
      },
    },
    add: {
      image(x: number, y: number, texture: string) {
        const image: FakeImage = {
          x,
          y,
          texture,
          depth: 0,
          visible: true,
          origin: [0.5, 0.5],
          setOrigin(originX, originY) {
            image.origin = [originX, originY];
            return image;
          },
          setDepth(depth) {
            image.depth = depth;
            return image;
          },
          setVisible(visible) {
            image.visible = visible;
            return image;
          },
        };
        images.push(image);
        return image;
      },
    },
  };
  return { scene: scene as unknown as Phaser.Scene, images, loaded, tilemaps };
}

export function facingLoader(without?: string): AssetLoader {
  return {
    resolve: (id: string) => {
      const facings: Partial<Record<'E' | 'N' | 'S' | 'W', string>> = {
        E: `${id}_E.png`,
        N: `${id}_N.png`,
        W: `${id}_W.png`,
        S: `${id}_S.png`,
      };
      const missing = without?.startsWith(`${id}:`)
        ? (without.slice(id.length + 1) as keyof typeof facings)
        : undefined;
      if (missing) delete facings[missing];
      return {
        url: `https://game.test/${id}_E.png`,
        file: `${id}_E.png`,
        license: {},
        meta: {
          sprite: {
            drawn_view: 'iso',
            facings,
          },
        },
      };
    },
  } as unknown as AssetLoader;
}
