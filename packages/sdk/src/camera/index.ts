import type { CameraRig, ViewId } from '@ogm/contracts';
import type Phaser from 'phaser';

import { EditorCamera, type EditorCameraOptions } from './editor.js';
import { defaultInputMapping } from './mapping.js';
import { phaserCameraPresets } from './phaser/presets.js';
import { RigSet, type RigFactory } from './rig-set.js';
import { createFixedRig } from './three/fixed.js';
import { createFollowRig } from './three/follow.js';
import { createFpsRig } from './three/fps.js';
import { createIsoRig } from './three/iso.js';
import { createOrbitRig } from './three/orbit.js';
import { createSideRig } from './three/side.js';
import { createTopdownRig } from './three/topdown.js';
import type { ThreeCameraRig, ThreeRigDeps } from './three/base.js';

export interface PhaserRigDeps {
  scene: Phaser.Scene;
  camera?: Phaser.Cameras.Scene2D.Camera;
}

export type RigDeps = { three: ThreeRigDeps } | { phaser: PhaserRigDeps };

const threeFactories = {
  iso: createIsoRig,
  topdown: createTopdownRig,
  side: createSideRig,
  follow: createFollowRig,
  fps: createFpsRig,
  orbit: createOrbitRig,
  fixed: createFixedRig,
} satisfies Record<ViewId, (deps: ThreeRigDeps) => ThreeCameraRig>;

export function createRig(view: ViewId, dimension: '3d', deps: { three: ThreeRigDeps }): ThreeCameraRig;
export function createRig(view: ViewId, dimension: '2d', deps: { phaser: PhaserRigDeps }): CameraRig;
export function createRig(view: ViewId, dimension: '2d' | '3d', deps: RigDeps): CameraRig {
  if (dimension === '3d') {
    if (!('three' in deps)) throw new TypeError('three rig dependencies are required for a 3d view');
    return threeFactories[view](deps.three);
  }
  if (!('phaser' in deps)) throw new TypeError('phaser rig dependencies are required for a 2d view');
  const camera = deps.phaser.camera ?? deps.phaser.scene.cameras.main;
  const supported = view === 'iso' || view === 'topdown' || view === 'side' || view === 'fixed';
  const rig = phaserCameraPresets[supported ? view : 'fixed'](deps.phaser.scene, camera);
  if (supported) return rig;
  return { ...rig, id: view, inputMapping: defaultInputMapping(view) };
}

export { defaultInputMapping, EditorCamera, RigSet };
export type { EditorCameraOptions, RigFactory, ThreeCameraRig, ThreeRigDeps };
export { OcclusionController, type OcclusionKind } from './occlusion.js';
export { phaserCameraPresets, type PhaserCameraPreset } from './phaser/presets.js';
