import { Vector3 } from 'three';

import { applyLook, makeThreeRig, type ThreeRigDeps } from './base.js';

export function createOrbitRig(deps: ThreeRigDeps) {
  return makeThreeRig('orbit', deps, {
    projection: 'perspective',
    occlusion: 'none',
    update({ camera, dt, frame, look, state, target }) {
      applyLook(state, frame, dt, look);
      const zoom = frame.actions.zoom;
      if (typeof zoom === 'number') state.distance = Math.max(2, Math.min(30, state.distance - zoom * dt * 8));
      const cosPitch = Math.cos(state.pitch);
      camera.position
        .copy(target)
        .add(
          new Vector3(
            -Math.sin(state.yaw) * cosPitch * state.distance,
            Math.sin(state.pitch) * state.distance,
            Math.cos(state.yaw) * cosPitch * state.distance,
          ),
        );
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
    },
  });
}
