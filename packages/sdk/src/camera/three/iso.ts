import { Vector3 } from 'three';

import { makeThreeRig, setOrthographicFrustum, type ThreeRigDeps } from './base.js';

const ISO = new Vector3(1, 1.1, 1).normalize();

export function createIsoRig(deps: ThreeRigDeps) {
  return makeThreeRig('iso', deps, {
    projection: 'orthographic',
    occlusion: 'cutaway',
    update({ camera, deps: rigDeps, dt, focus, target }) {
      focus.lerp(target, rigDeps.reduceMotion ? 1 : Math.min(1, dt * 5));
      camera.position.copy(focus).addScaledVector(ISO, 30);
      camera.up.set(0, 1, 0);
      camera.lookAt(focus);
      setOrthographicFrustum(camera, rigDeps, 10);
    },
  });
}
