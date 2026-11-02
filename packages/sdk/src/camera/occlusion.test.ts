import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { OcclusionController } from './occlusion.js';

function wall(x: number, z: number) {
  const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial({ opacity: 1 }));
  mesh.position.set(x, 1, z);
  mesh.userData.occluder = true;
  mesh.castShadow = true;
  mesh.updateMatrixWorld();
  return mesh;
}

describe('OcclusionController', () => {
  it('cuts only tagged walls between the target and camera, then restores them', () => {
    const scene = new Scene();
    const between = wall(2, 2);
    const elsewhere = wall(-2, 2);
    scene.add(between, elsewhere);
    const camera = new PerspectiveCamera();
    camera.position.set(5, 5, 5);
    const controller = new OcclusionController('cutaway', scene);

    controller.update(camera, new Vector3(0, 0, 0), 1);
    expect(between.scale.y).toBeCloseTo(0.28);
    expect(between.castShadow).toBe(false);
    expect(elsewhere.scale.y).toBe(1);

    controller.update(camera, new Vector3(4, 0, 0), 1);
    expect(between.scale.y).toBe(1);
    expect(between.castShadow).toBe(true);
  });

  it('fades only the first hit mesh and restores it after the ray clears', () => {
    const scene = new Scene();
    const between = wall(0, 2);
    const elsewhere = wall(4, 2);
    scene.add(between, elsewhere);
    scene.updateMatrixWorld(true);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 5);
    const controller = new OcclusionController('fade', scene);

    controller.update(camera, new Vector3(0, 1, 0), 1);
    expect((between.material as MeshBasicMaterial).opacity).toBeCloseTo(0.25);
    expect((elsewhere.material as MeshBasicMaterial).opacity).toBe(1);

    camera.position.set(5, 1, 5);
    camera.updateMatrixWorld();
    controller.update(camera, new Vector3(5, 1, 0), 1);
    expect((between.material as MeshBasicMaterial).opacity).toBe(1);
  });

  it('shortens a colliding camera to the first tagged obstacle', () => {
    const scene = new Scene();
    scene.add(wall(0, 2));
    scene.updateMatrixWorld(true);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 5);
    const controller = new OcclusionController('collide', scene);

    controller.update(camera, new Vector3(0, 1, 0), 1);

    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.position.z).toBeLessThan(2);
  });
});
