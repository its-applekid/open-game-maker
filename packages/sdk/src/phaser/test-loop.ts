import type Phaser from 'phaser';

import type { Runtime } from '../core/runtime.js';

export interface RenderLoop {
  renderOnce(): void;
  calls(): number;
  frameMs(): number;
}

/** Phaser remains a view: the SDK clock decides when its update/render pass runs. */
export function installSdkRenderLoop<D, S>(runtime: Runtime<D, S>, game: Phaser.Game): RenderLoop {
  let renderCalls = 0;
  let elapsedMs = 0;
  let lastFrameMs = 0;

  game.loop.sleep();
  game.loop.lastTime = 0;

  const renderOnce = () => {
    lastFrameMs = runtime.clock.dt * 1000;
    elapsedMs += lastFrameMs;
    game.loop.step(elapsedMs);
    renderCalls += 1;
  };

  runtime.onFrame(renderOnce);
  return {
    renderOnce,
    calls: () => renderCalls,
    frameMs: () => lastFrameMs,
  };
}
