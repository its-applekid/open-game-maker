import { Vector3 } from 'three';

import { applyLook, makeThreeRig, type ThreeRigDeps } from './base.js';

export function createFpsRig(deps: ThreeRigDeps) {
  return makeThreeRig('fps', deps, {
    projection: 'perspective',
    occlusion: 'none',
    update({ camera, dt, frame, look, state, target }) {
      applyLook(state, frame, dt, look);
      camera.position.copy(target).add(new Vector3(0, 1.6, 0));
      const forward = new Vector3(
        Math.sin(state.yaw) * Math.cos(state.pitch),
        Math.sin(state.pitch),
        -Math.cos(state.yaw) * Math.cos(state.pitch),
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(camera.position.clone().add(forward));
    },
  });
}
