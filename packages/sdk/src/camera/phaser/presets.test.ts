import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

import { phaserCameraPresets } from './presets.js';

function setup() {
  const camera = {
    width: 640,
    height: 360,
    zoom: 2,
    worldView: { x: 0, y: 0, contains: () => true },
    startFollow: vi.fn(),
    stopFollow: vi.fn(),
    setDeadzone: vi.fn(),
    setBounds: vi.fn(),
    setZoom: vi.fn(),
    centerOn: vi.fn(),
  };
  const values = new Map<string, unknown>([
    ['camera.zoom', 1.5],
    ['level.bounds', { x: 0, y: 0, width: 1280, height: 720 }],
  ]);
  const scene = {
    data: { get: (key: string) => values.get(key) },
    scale: { gameSize: { width: 640, height: 360 } },
  };
  return { camera, scene };
}

describe('phaserCameraPresets', () => {
  it.each(['iso', 'topdown'] as const)('configures the %s follow preset', (view) => {
    const { camera, scene } = setup();
    const rig = phaserCameraPresets[view](
      scene as unknown as Phaser.Scene,
      camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );

    rig.attach({ position: () => [16, 24, 0] }, 0);

    expect(camera.startFollow).toHaveBeenCalledWith(expect.any(Object), true, 0.1, 0.1);
    expect(camera.setBounds).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(camera.setZoom).toHaveBeenCalledWith(1.5);
  });

  it('configures the side deadzone and keeps fixed detached', () => {
    const sideSetup = setup();
    phaserCameraPresets.side(
      sideSetup.scene as unknown as Phaser.Scene,
      sideSetup.camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );
    expect(sideSetup.camera.setDeadzone).toHaveBeenCalledWith(192, 216);

    const fixedSetup = setup();
    const fixed = phaserCameraPresets.fixed(
      fixedSetup.scene as unknown as Phaser.Scene,
      fixedSetup.camera as unknown as Phaser.Cameras.Scene2D.Camera,
    );
    fixed.attach({ position: () => [16, 24, 0] }, 0);
    expect(fixedSetup.camera.startFollow).not.toHaveBeenCalled();
    expect(fixedSetup.camera.centerOn).toHaveBeenCalledWith(320, 180);
  });
});
