import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

import { bindLifecycle } from './lifecycle.js';
import type { Runtime } from '../core/runtime.js';

function setup(build: Runtime<unknown, unknown>['build'] = 'draft') {
  const restart = vi.fn();
  const game = {
    loop: { sleep: vi.fn(), wake: vi.fn() },
    scene: {
      pause: vi.fn(),
      resume: vi.fn(),
      getScene: vi.fn(() => ({ scene: { restart } })),
    },
    destroy: vi.fn(),
  };
  const lifecycle = bindLifecycle({ build } as Runtime<unknown, unknown>, game as unknown as Phaser.Game, 'level');
  return { game, lifecycle, restart };
}

describe('bindLifecycle', () => {
  it('sleeps and pauses the selected scene', () => {
    const { game, lifecycle } = setup();

    lifecycle.pause();

    expect(game.loop.sleep).toHaveBeenCalledOnce();
    expect(game.scene.pause).toHaveBeenCalledWith('level');
  });

  it('resumes the scene without waking the autonomous loop', () => {
    const { game, lifecycle } = setup('test');

    lifecycle.resume();

    expect(game.scene.resume).toHaveBeenCalledWith('level');
    expect(game.loop.wake).not.toHaveBeenCalled();
  });

  it('destroys once and ignores a later scene restart', () => {
    const { game, lifecycle, restart } = setup();

    lifecycle.dispose();
    lifecycle.dispose();
    lifecycle.restartScene({ width: 1280 });

    expect(game.destroy).toHaveBeenCalledOnce();
    expect(game.destroy).toHaveBeenCalledWith(true);
    expect(restart).not.toHaveBeenCalled();
  });

  it('forwards restart data while active', () => {
    const { lifecycle, restart } = setup();

    lifecycle.restartScene({ width: 1280 });

    expect(restart).toHaveBeenCalledWith({ width: 1280 });
  });
});
