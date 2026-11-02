import { Vector3 } from 'three';

import { applyLook, makeThreeRig, type ThreeRigDeps } from './base.js';

export function createFollowRig(deps: ThreeRigDeps) {
  return makeThreeRig('follow', deps, {
    projection: 'perspective',
    occlusion: 'fade',
    update({ camera, deps: rigDeps, dt, frame, focus, look, state, target }) {
      applyLook(state, frame, dt, look);
      focus.lerp(target, rigDeps.reduceMotion ? 1 : Math.min(1, dt * 5));
      const offset = new Vector3(-Math.sin(state.yaw) * 6, 2.5, Math.cos(state.yaw) * 6);
      const desired = focus.clone().add(offset);
      camera.position.lerp(desired, rigDeps.reduceMotion ? 1 : Math.min(1, dt * 5));
      camera.up.set(0, 1, 0);
      camera.lookAt(focus.clone().add(new Vector3(0, state.pitch, 0)));
    },
  });
}
