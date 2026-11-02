import type { CameraRig, RigInputMapping, Vec3 } from '@ogm/contracts';
import type Phaser from 'phaser';

type CameraPreset = (scene: Phaser.Scene, camera: Phaser.Cameras.Scene2D.Camera) => CameraRig;

const movementInput: RigInputMapping = {
  keyboard: { w: 'move.up', a: 'move.left', s: 'move.down', d: 'move.right' },
  touch: 'stick',
  gamepad: { leftStick: 'move' },
  pointerLock: false,
};

const fixedInput: RigInputMapping = {
  keyboard: {},
  touch: 'tap',
  gamepad: {},
  pointerLock: false,
};

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

function followingRig(id: 'topdown' | 'side', scene: Phaser.Scene, camera: Phaser.Cameras.Scene2D.Camera): CameraRig {
  const proxy = { x: 0, y: 0 };
  let target: { position(): Vec3 } | undefined;

  if (id === 'topdown') {
    const zoom = scene.data.get('camera.zoom');
    if (typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0) camera.setZoom(zoom);
  } else {
    const bounds = levelBounds(scene);
    camera.setDeadzone(camera.width / 4, camera.height / 3);
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  return {
    id,
    dimension: '2d',
    occlusion: 'none',
    inputMapping: movementInput,
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

const topdown: CameraPreset = (scene, camera) => followingRig('topdown', scene, camera);
const side: CameraPreset = (scene, camera) => followingRig('side', scene, camera);

const fixed: CameraPreset = (scene, camera) => {
  const size = logicalSize(scene);
  camera.stopFollow();
  camera.setBounds(0, 0, size.width, size.height);
  return {
    id: 'fixed',
    dimension: '2d',
    occlusion: 'none',
    inputMapping: fixedInput,
    attach() {},
    update() {},
    worldToScreen: (point) => worldToScreen(camera, point),
  };
};

export const cameraPresets: Record<'topdown' | 'side' | 'fixed', CameraPreset> = {
  topdown,
  side,
  fixed,
};
