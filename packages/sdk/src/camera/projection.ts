import type { Vec3 } from '@ogm/contracts';
import type { Camera } from 'three';
import { Vector3 } from 'three';

export function projectWorldToScreen(camera: Camera, point: Vec3): { x: number; y: number } | null {
  camera.updateMatrixWorld();
  const world = new Vector3().fromArray(point);
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  if (world.clone().sub(camera.position).dot(direction) <= 0) return null;
  const projected = world.project(camera);
  if (projected.z < -1 || projected.z > 1) return null;
  return {
    x: (projected.x + 1) / 2,
    y: (1 - projected.y) / 2,
  };
}
