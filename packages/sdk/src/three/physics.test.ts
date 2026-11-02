import type { Runtime } from '../core/runtime.js';
import { describe, expect, it, vi } from 'vitest';

import { createPhysics } from './physics.js';

function runtimeFixture() {
  let step: ((dt: number, frames: never[]) => void) | undefined;
  return {
    runtime: {
      onStep(callback: typeof step) {
        step = callback;
        return () => {
          step = undefined;
        };
      },
    } as unknown as Runtime<unknown, unknown>,
    advance(count = 1) {
      for (let index = 0; index < count; index += 1) step?.(1 / 60, []);
    },
  };
}

describe('createPhysics', () => {
  it('steps only when the runtime steps', async () => {
    const fixture = runtimeFixture();
    const physics = await createPhysics(fixture.runtime);
    const step = vi.spyOn(physics.world, 'step');

    expect(step).not.toHaveBeenCalled();
    fixture.advance(3);

    expect(step).toHaveBeenCalledTimes(3);
    physics.dispose();
  });

  it('restores a snapshot and deterministically replays falling-body motion', async () => {
    const fixture = runtimeFixture();
    const physics = await createPhysics(fixture.runtime);
    const rigidBody = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
    physics.world.createCollider(physics.rapier.ColliderDesc.ball(0.5), rigidBody);
    fixture.advance(30);
    const snapshot = physics.snapshot();
    const handle = rigidBody.handle;

    fixture.advance(30);
    const firstY = physics.world.getRigidBody(handle)!.translation().y;
    physics.restore(snapshot);
    fixture.advance(30);
    const replayY = physics.world.getRigidBody(handle)!.translation().y;

    expect(replayY).toBeCloseTo(firstY, 6);
    physics.dispose();
  });
});
