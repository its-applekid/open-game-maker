import type { ActionFrame } from '@ogm/contracts';
import { OrthographicCamera, PerspectiveCamera, Scene, Vector3 } from 'three';
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
    expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true);
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
    expect(rig.camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(0);
  });

  it('keeps side targets inside a dead band and snaps when reduced motion is enabled', () => {
    const position: [number, number, number] = [0, 0, 0];
    const rig = createRig('side', '3d', { three: { scene: new Scene() } });
    rig.attach(target(position), 0);
    rig.update(1, emptyFrame);
    const initialX = rig.camera.position.x;

    position[0] = 1;
    rig.update(1, emptyFrame);
    expect(rig.camera.position.x).toBe(initialX);
    position[0] = 5;
    rig.update(1, emptyFrame);
    expect(rig.camera.position.x).toBe(3);

    const reducedPosition: [number, number, number] = [0, 0, 0];
    const reduced = createRig('side', '3d', { three: { scene: new Scene(), reduceMotion: true } });
    reduced.attach(target(reducedPosition), 0);
    reduced.update(1 / 60, emptyFrame);
    reducedPosition[0] = 5;
    reduced.update(1 / 60, emptyFrame);
    expect(reduced.camera.position.x).toBe(5);
  });

  it('maps movement into camera-relative world axes', () => {
    const rig = createRig('iso', '3d', { three: { scene: new Scene() } });
    const mapped = rig.mapInput({ ...emptyFrame, actions: { move: { x: 0, y: 1 } } });

    expect(mapped.actions.move).toMatchObject({
      x: expect.closeTo(-Math.SQRT1_2),
      y: expect.closeTo(-Math.SQRT1_2),
    });

    const fixed = createRig('fixed', '3d', {
      three: {
        scene: new Scene(),
        fixedPose: { position: [0, 10, 10], target: [0, 0, 0] },
      },
    });
    expect(fixed.mapInput({ ...emptyFrame, actions: { move: { x: 0, y: 1 } } }).actions.move).toEqual({
      x: 0,
      y: -1,
    });
  });

  it('applies manifest keyboard overrides through the public factory', () => {
    const rig = createRig(
      'fps',
      '3d',
      { three: { scene: new Scene() } },
      { manifestInputs: { keyboard: { Space: 'attack' } } },
    );

    expect(rig.inputMapping.keyboard.Space).toBe('attack');
    expect(rig.inputMapping.keyboard.KeyW).toBe('move.up');
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
