import type { ActionFrame } from '@ogm/contracts';
import { OrthographicCamera, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';

import { createRig } from '../index.js';

const emptyFrame: ActionFrame = { playerIndex: 0, tick: 1, source: 'keyboard', actions: {} };

function target(position: [number, number, number]) {
  return { position: () => position };
}

describe('Three camera rigs', () => {
  it.each([
    ['iso', OrthographicCamera],
    ['topdown', OrthographicCamera],
    ['side', OrthographicCamera],
    ['follow', PerspectiveCamera],
    ['fps', PerspectiveCamera],
    ['orbit', PerspectiveCamera],
    ['fixed', OrthographicCamera],
  ] as const)('creates and updates the %s rig', (view, CameraClass) => {
    const rig = createRig(view, '3d', {
      three: { scene: new Scene(), viewport: () => ({ width: 800, height: 450 }) },
    });

    rig.attach(target([5, 0, 5]), 0);
    rig.update(1, emptyFrame);

    expect(rig.camera).toBeInstanceOf(CameraClass);
    expect(rig.camera.position.toArray()).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(rig.worldToScreen(view === 'fps' ? [5, 1.6, 0] : [5, 0, 5])).not.toBeNull();
  });

  it('places the iso camera along the proven isometric vector', () => {
    const rig = createRig('iso', '3d', {
      three: { scene: new Scene(), viewport: () => ({ width: 800, height: 450 }) },
    });
    rig.attach(target([5, 0, 5]), 0);

    rig.update(1, emptyFrame);

    expect(rig.camera.position.toArray()).toMatchSnapshot();
    expect(rig.camera.quaternion.toArray()).toMatchSnapshot();
  });

  it('uses pointer deltas to turn first-person cameras', () => {
    const rig = createRig('fps', '3d', { three: { scene: new Scene() } });
    rig.attach(target([0, 0, 0]), 0);
    rig.update(1 / 60, { ...emptyFrame, source: 'pointer', actions: { look: { x: 100, y: -50 } } });

    const first = rig.camera.quaternion.clone();
    rig.update(1 / 60, { ...emptyFrame, tick: 2, source: 'pointer', actions: { look: { x: 100, y: 0 } } });

    expect(rig.camera.position.y).toBeCloseTo(1.6);
    expect(rig.camera.quaternion.equals(first)).toBe(false);
    expect(rig.inputMapping.pointerLock).toBe(true);
  });

  it('rejects points behind the camera', () => {
    const rig = createRig('fixed', '3d', {
      three: {
        scene: new Scene(),
        fixedPose: { position: [0, 0, 10], target: [0, 0, 0] },
      },
    });
    rig.attach(target([0, 0, 0]), 0);
    rig.update(1, emptyFrame);

    expect(rig.worldToScreen([0, 0, 20])).toBeNull();
  });
});
