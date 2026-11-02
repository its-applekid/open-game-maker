import type { CameraRig, Vec3 } from '@ogm/contracts';
import type Phaser from 'phaser';

import { defaultInputMapping } from '../mapping.js';

export type PhaserCameraPreset = (scene: Phaser.Scene, camera: Phaser.Cameras.Scene2D.Camera) => CameraRig;

function logicalSize(scene: Phaser.Scene): { width: number; height: number } {
  return scene.scale.gameSize;
}

function levelBounds(scene: Phaser.Scene): { x: number; y: number; width: number; height: number } {
  const candidate = scene.data.get('level.bounds') as Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
  const logical = logicalSize(scene);
  return {
    x: candidate?.x ?? 0,
    y: candidate?.y ?? 0,
    width: candidate?.width ?? logical.width,
    height: candidate?.height ?? logical.height,
  };
}

function worldToScreen(camera: Phaser.Cameras.Scene2D.Camera, point: Vec3): { x: number; y: number } | null {
  if (!camera.worldView.contains(point[0], point[1])) return null;
  return {
    x: (point[0] - camera.worldView.x) * camera.zoom,
    y: (point[1] - camera.worldView.y) * camera.zoom,
  };
}

function followingRig(
  id: 'iso' | 'topdown' | 'side',
  scene: Phaser.Scene,
  camera: Phaser.Cameras.Scene2D.Camera,
): CameraRig {
  const proxy = { x: 0, y: 0 };
  let target: { position(): Vec3 } | undefined;
  const bounds = levelBounds(scene);
  const zoom = scene.data.get('camera.zoom');
  camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  if (typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0) camera.setZoom(zoom);
  if (id === 'side') camera.setDeadzone(camera.width * 0.3, camera.height * 0.6);

  return {
    id,
    dimension: '2d',
    occlusion: 'none',
    inputMapping: defaultInputMapping(id),
    attach(nextTarget) {
      target = nextTarget;
      const [x, y] = nextTarget.position();
      proxy.x = x;
      proxy.y = y;
      camera.startFollow(proxy, true, 0.1, 0.1);
    },
    update() {
      if (!target) return;
      const [x, y] = target.position();
      proxy.x = x;
      proxy.y = y;
    },
    worldToScreen: (point) => worldToScreen(camera, point),
  };
}

const iso: PhaserCameraPreset = (scene, camera) => followingRig('iso', scene, camera);
const topdown: PhaserCameraPreset = (scene, camera) => followingRig('topdown', scene, camera);
const side: PhaserCameraPreset = (scene, camera) => followingRig('side', scene, camera);

const fixed: PhaserCameraPreset = (scene, camera) => {
  const size = logicalSize(scene);
  const zoom = scene.data.get('camera.zoom');
  camera.stopFollow();
  camera.setBounds(0, 0, size.width, size.height);
  if (typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0) camera.setZoom(zoom);
  camera.centerOn(size.width / 2, size.height / 2);
  return {
    id: 'fixed',
    dimension: '2d',
    occlusion: 'none',
    inputMapping: defaultInputMapping('fixed'),
    attach() {},
    update() {},
    worldToScreen: (point) => worldToScreen(camera, point),
  };
};

export const phaserCameraPresets: Record<'iso' | 'topdown' | 'side' | 'fixed', PhaserCameraPreset> = {
  iso,
  topdown,
  side,
  fixed,
};
