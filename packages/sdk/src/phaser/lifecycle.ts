import type Phaser from 'phaser';

import type { Runtime } from '../core/runtime.js';

export interface PhaserLifecycle {
  pause(): void;
  resume(): void;
  dispose(): void;
  restartScene(data?: unknown): void;
}

export function bindLifecycle<D, S>(_runtime: Runtime<D, S>, game: Phaser.Game, levelKey: string): PhaserLifecycle {
  let disposed = false;

  return {
    pause() {
      if (disposed) return;
      game.loop.sleep();
      game.scene.pause(levelKey);
    },
    resume() {
      if (disposed) return;
      game.scene.resume(levelKey);
      // The SDK frame callback owns rendering in every build, so Phaser stays asleep.
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      game.destroy(true);
    },
    restartScene(data?: unknown) {
      if (disposed) return;
      game.scene.getScene(levelKey).scene.restart(data as object | undefined);
    },
  };
}
