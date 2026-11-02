import type { ActionFrame, Vec3 } from '@ogm/contracts';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

import { cameraPresets } from './camera-presets.js';

const frame: ActionFrame = { playerIndex: 0, tick: 1, source: 'keyboard', actions: {} };

function setup() {
  const followed: { x: number; y: number }[] = [];
  const camera = {
    width: 640,
    height: 360,
    zoom: 2,
    worldView: { x: 100, y: 50, contains: (x: number, y: number) => x >= 100 && x <= 420 && y >= 50 && y <= 230 },
    startFollow: vi.fn((target: { x: number; y: number }) => followed.push(target)),
    stopFollow: vi.fn(),
    setDeadzone: vi.fn(),
    setBounds: vi.fn(),
    setZoom: vi.fn(),
  };
  const values = new Map<string, unknown>([
    ['camera.zoom', 1.5],
    ['level.bounds', { x: 0, y: 0, width: 1280, height: 720 }],
  ]);
  const scene = {
    data: { get: (key: string) => values.get(key) },
    scale: { gameSize: { width: 640, height: 360 } },
  };
  return { camera, followed, scene };
}

describe('cameraPresets', () => {
  it('configures topdown follow, zoom, and stick input', () => {
    const { camera, scene } = setup();
    const rig = cameraPresets.topdown(
      scene as unknown as Phaser.Scene,
      camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );

    rig.attach({ position: () => [16, 24, 0] }, 0);
    rig.update(1 / 60, frame);

    expect(camera.startFollow).toHaveBeenCalledWith(expect.any(Object), true, 0.1, 0.1);
    expect(camera.setZoom).toHaveBeenCalledWith(1.5);
    expect(rig.inputMapping.touch).toBe('stick');
  });

  it('configures side follow with a logical dead zone and level bounds', () => {
    const { camera, scene } = setup();
    const rig = cameraPresets.side(
      scene as unknown as Phaser.Scene,
      camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );

    rig.attach({ position: () => [16, 24, 0] }, 0);

    expect(camera.setDeadzone).toHaveBeenCalledWith(160, 120);
    expect(camera.setBounds).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(rig.inputMapping.touch).toBe('stick');
  });

  it('keeps fixed cameras detached and bounded to the logical size', () => {
    const { camera, scene } = setup();
    const rig = cameraPresets.fixed(
      scene as unknown as Phaser.Scene,
      camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );

    rig.attach({ position: () => [16, 24, 0] }, 0);

    expect(camera.startFollow).not.toHaveBeenCalled();
    expect(camera.setBounds).toHaveBeenCalledWith(0, 0, 640, 360);
    expect(rig.inputMapping.touch).toBe('tap');
  });

  it('projects visible world points and rejects offscreen points', () => {
    const { camera, scene } = setup();
    const rig = cameraPresets.fixed(
      scene as unknown as Phaser.Scene,
      camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );

    expect(rig.worldToScreen([150, 75, 0])).toEqual({ x: 100, y: 50 });
    expect(rig.worldToScreen([500, 75, 0] satisfies Vec3)).toBeNull();
  });
});
