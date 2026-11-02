import { makeThreeRig, setOrthographicFrustum, type ThreeRigDeps } from './base.js';

export function createSideRig(deps: ThreeRigDeps) {
  return makeThreeRig('side', deps, {
    projection: 'orthographic',
    occlusion: 'none',
    update({ camera, deps: rigDeps, dt, focus, target }) {
      focus.x += (target.x - focus.x) * Math.min(1, dt * 5);
      focus.y = target.y;
      focus.z = target.z;
      camera.position.set(focus.x, focus.y + 2, focus.z + 30);
      camera.up.set(0, 1, 0);
      camera.lookAt(focus);
      setOrthographicFrustum(camera, rigDeps, 8);
    },
  });
}
