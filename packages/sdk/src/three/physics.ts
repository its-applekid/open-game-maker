import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from '@ogm/contracts';

import type { Runtime } from '../core/runtime.js';

let initialized: Promise<void> | undefined;

function initialize(): Promise<void> {
  initialized ??= RAPIER.init();
  return initialized;
}

export interface PhysicsHandle {
  readonly rapier: typeof RAPIER;
  readonly world: RAPIER.World;
  snapshot(): Uint8Array;
  restore(bytes: Uint8Array): void;
  dispose(): void;
}

export async function createPhysics(
  runtime: Runtime<unknown, unknown>,
  options: { gravity?: Vec3 } = {},
): Promise<PhysicsHandle> {
  await initialize();
  const [x, y, z] = options.gravity ?? [0, -9.81, 0];
  let world = new RAPIER.World({ x, y, z });
  world.timestep = 1 / 60;
  let disposed = false;
  const stop = runtime.onStep(() => {
    if (!disposed) world.step();
  });

  return {
    rapier: RAPIER,
    get world() {
      return world;
    },
    snapshot() {
      return world.takeSnapshot();
    },
    restore(bytes) {
      const restored = RAPIER.World.restoreSnapshot(bytes);
      restored.timestep = 1 / 60;
      world.free();
      world = restored;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      world.free();
    },
  };
}
