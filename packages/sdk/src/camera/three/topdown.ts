import { makeThreeRig, setOrthographicFrustum, type ThreeRigDeps } from './base.js';

export function createTopdownRig(deps: ThreeRigDeps) {
  return makeThreeRig('topdown', deps, {
    projection: 'orthographic',
    occlusion: 'none',
    update({ camera, deps: rigDeps, target }) {
      camera.position.set(target.x, target.y + 30, target.z + 0.001);
      camera.up.set(0, 0, -1);
      camera.lookAt(target);
      setOrthographicFrustum(camera, rigDeps, 10);
    },
  });
}
