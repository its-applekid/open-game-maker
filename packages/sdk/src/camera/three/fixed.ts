import { Vector3 } from 'three';

import { makeThreeRig, setOrthographicFrustum, type ThreeRigDeps } from './base.js';

export function createFixedRig(deps: ThreeRigDeps) {
  return makeThreeRig('fixed', deps, {
    projection: 'orthographic',
    occlusion: 'none',
    update({ camera, deps: rigDeps }) {
      camera.position.fromArray(rigDeps.fixedPose?.position ?? [10, 10, 10]);
      camera.up.set(0, 1, 0);
      camera.lookAt(new Vector3().fromArray(rigDeps.fixedPose?.target ?? [0, 0, 0]));
      setOrthographicFrustum(camera, rigDeps, 10);
    },
  });
}
