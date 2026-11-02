import type { ActionFrame, CameraRig, Vec3, ViewId } from '@ogm/contracts';
import type { Camera, Scene } from 'three';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';

import { defaultInputMapping } from '../mapping.js';
import { OcclusionController, type OcclusionKind } from '../occlusion.js';
import { projectWorldToScreen } from '../projection.js';

export interface ThreeRigDeps {
  scene: Scene;
  camera?: Camera;
  viewport?: () => { width: number; height: number };
  reduceMotion?: boolean;
  fixedPose?: { position: Vec3; target: Vec3 };
  occlusion?: OcclusionKind;
}

export interface ThreeCameraRig extends CameraRig {
  readonly camera: Camera;
  dispose(): void;
}

export interface RigUpdateContext {
  camera: Camera;
  deps: ThreeRigDeps;
  dt: number;
  focus: Vector3;
  frame: ActionFrame;
  look: { x: number; y: number };
  state: { yaw: number; pitch: number; distance: number };
  target: Vector3;
}

export type RigUpdater = (context: RigUpdateContext) => void;

function makeCamera(projection: 'orthographic' | 'perspective', viewport: ThreeRigDeps['viewport']): Camera {
  const size = viewport?.() ?? { width: 1, height: 1 };
  const aspect = size.height > 0 ? size.width / size.height : 1;
  return projection === 'orthographic'
    ? new OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 200)
    : new PerspectiveCamera(50, aspect, 0.1, 200);
}

export function setOrthographicFrustum(camera: Camera, deps: ThreeRigDeps, halfHeight = 10): void {
  if (!(camera instanceof OrthographicCamera)) return;
  const viewport = deps.viewport?.() ?? { width: 1, height: 1 };
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function frameLook(frame: ActionFrame): { x: number; y: number } {
  const value = frame.actions.look;
  return value && typeof value === 'object' ? value : { x: 0, y: 0 };
}

export function applyLook(
  state: RigUpdateContext['state'],
  frame: ActionFrame,
  dt: number,
  look: { x: number; y: number },
): void {
  const scale = frame.source === 'pointer' ? 0.002 : dt * 2.5;
  state.yaw -= look.x * scale;
  state.pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, state.pitch - look.y * scale));
}

export function makeThreeRig(
  id: ViewId,
  deps: ThreeRigDeps,
  options: { projection: 'orthographic' | 'perspective'; occlusion: OcclusionKind; update: RigUpdater },
): ThreeCameraRig {
  const cameraMatchesProjection =
    (options.projection === 'orthographic' && deps.camera instanceof OrthographicCamera) ||
    (options.projection === 'perspective' && deps.camera instanceof PerspectiveCamera);
  const camera = cameraMatchesProjection ? deps.camera! : makeCamera(options.projection, deps.viewport);
  const controller = new OcclusionController(deps.occlusion ?? options.occlusion, deps.scene);
  const focus = new Vector3();
  const state = { yaw: 0, pitch: 0.25, distance: 7 };
  let targetAdapter: { position(): Vec3 } | undefined;

  return {
    id,
    dimension: '3d',
    camera,
    occlusion: controller.kind,
    inputMapping: defaultInputMapping(id),
    attach(target) {
      targetAdapter = target;
      focus.fromArray(target.position());
    },
    update(dt, frame) {
      if (!targetAdapter) return;
      const target = new Vector3().fromArray(targetAdapter.position());
      if (deps.reduceMotion) focus.copy(target);
      options.update({ camera, deps, dt, focus, frame, look: frameLook(frame), state, target });
      camera.updateMatrixWorld();
      controller.update(camera, target, dt);
    },
    worldToScreen(point) {
      const viewport = deps.viewport?.() ?? { width: 1, height: 1 };
      return projectWorldToScreen(camera, point, viewport);
    },
    dispose() {
      controller.restore();
    },
  };
}
