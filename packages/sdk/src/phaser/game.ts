import type { GameManifest } from '@ogm/contracts';
import Phaser from 'phaser';

import { installSdkRenderLoop } from './test-loop.js';
import type { RenderInfo, Runtime } from '../core/runtime.js';

export interface PhaserGameOptions {
  parent: HTMLElement;
  presentation: GameManifest['presentation'];
  scenes: Phaser.Types.Scenes.SceneType[];
  test?: boolean;
  renderer?: 'auto' | 'canvas' | 'webgl';
}

export interface PhaserGameHandle {
  game: Phaser.Game;
  renderOnce(): void;
  info(): RenderInfo;
}

function waitUntilReady(game: Phaser.Game): Promise<void> {
  if (game.isBooted) return Promise.resolve();
  return new Promise((resolve) => game.events.once(Phaser.Core.Events.READY, resolve));
}

function rendererBackend(game: Phaser.Game): string {
  if (game.renderer.type === Phaser.WEBGL) return 'webgl';
  if (game.renderer.type === Phaser.CANVAS) return 'canvas';
  return 'headless';
}

export async function createPhaserGame<D, S>(
  runtime: Runtime<D, S>,
  options: PhaserGameOptions,
): Promise<PhaserGameHandle> {
  const { minLogical, fit } = options.presentation;
  const renderer =
    options.renderer === 'canvas' ? Phaser.CANVAS : options.renderer === 'webgl' ? Phaser.WEBGL : Phaser.AUTO;
  const game = new Phaser.Game({
    type: renderer,
    parent: options.parent,
    width: minLogical.w,
    height: minLogical.h,
    scale: {
      mode: fit === 'fixed' ? Phaser.Scale.FIT : Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: minLogical.w,
      height: minLogical.h,
    },
    scene: options.scenes,
    backgroundColor: '#161922',
  });

  await waitUntilReady(game);
  const loop = installSdkRenderLoop(runtime, game);

  if (fit === 'responsive') {
    const resize = ({ w, h }: { w: number; h: number }) => {
      if (w > 0 && h > 0) game.scale.resize(w, h);
    };
    runtime.host.viewport.onChange(resize);
  }

  return {
    game,
    renderOnce: loop.renderOnce,
    info: () => ({
      calls: loop.calls(),
      triangles: 0,
      frameMs: loop.frameMs(),
      textureBytes: 0,
      backend: rendererBackend(game),
    }),
  };
}
