import type { Camera, Material, Mesh, Object3D, Scene } from 'three';
import { Raycaster, Vector3 } from 'three';

export type OcclusionKind = 'none' | 'cutaway' | 'fade' | 'collide';

type CutawayState = { scaleY: number; castShadow: boolean };
type FadeState = { opacity: number; transparent: boolean };

function occluders(scene: Scene): Object3D[] {
  const tagged: Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.occluder === true) tagged.push(object);
  });
  return tagged;
}

function materials(object: Object3D): Material[] {
  const material = (object as Mesh).material as Material | Material[] | undefined;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

export class OcclusionController {
  private readonly raycaster = new Raycaster();
  private readonly cutawayState = new Map<Object3D, CutawayState>();
  private readonly fadeState = new Map<Material, FadeState>();

  constructor(
    readonly kind: OcclusionKind,
    private readonly scene: Scene,
    private readonly bandWidth = 1.25,
  ) {}

  update(camera: Camera, target: Vector3, dt: number): void {
    if (this.kind === 'cutaway') this.updateCutaway(camera, target, dt);
    else if (this.kind === 'fade') this.updateFade(camera, target);
    else if (this.kind === 'collide') this.updateCollision(camera, target);
  }

  restore(): void {
    for (const [object, state] of this.cutawayState) {
      object.scale.y = state.scaleY;
      object.castShadow = state.castShadow;
    }
    this.cutawayState.clear();
    for (const [material, state] of this.fadeState) {
      const mutable = material as Material & { opacity: number; transparent: boolean };
      mutable.opacity = state.opacity;
      mutable.transparent = state.transparent;
      mutable.needsUpdate = true;
    }
    this.fadeState.clear();
  }

  private updateCutaway(camera: Camera, target: Vector3, dt: number): void {
    const cameraLine = new Vector3(camera.position.x - target.x, 0, camera.position.z - target.z);
    const lengthSquared = cameraLine.lengthSq();
    const alpha = Math.min(1, Math.max(0, dt * 5));

    for (const object of occluders(this.scene)) {
      const state = this.cutawayState.get(object) ?? {
        scaleY: object.scale.y,
        castShadow: object.castShadow,
      };
      const position = object.getWorldPosition(new Vector3());
      const offsetX = position.x - target.x;
      const offsetZ = position.z - target.z;
      const along = lengthSquared === 0 ? -1 : (offsetX * cameraLine.x + offsetZ * cameraLine.z) / lengthSquared;
      const distance = Math.hypot(offsetX - cameraLine.x * along, offsetZ - cameraLine.z * along);
      const isBetween = along > 0 && along < 1 && distance <= this.bandWidth;

      if (isBetween) {
        this.cutawayState.set(object, state);
        object.scale.y += (0.28 - object.scale.y) * alpha;
        object.castShadow = false;
      } else if (this.cutawayState.has(object)) {
        object.scale.y += (state.scaleY - object.scale.y) * alpha;
        if (Math.abs(object.scale.y - state.scaleY) < 1e-6) {
          object.scale.y = state.scaleY;
          object.castShadow = state.castShadow;
          this.cutawayState.delete(object);
        }
      }
    }
  }

  private updateFade(camera: Camera, target: Vector3): void {
    for (const [material, state] of this.fadeState) {
      const mutable = material as Material & { opacity: number; transparent: boolean };
      mutable.opacity = state.opacity;
      mutable.transparent = state.transparent;
      mutable.needsUpdate = true;
    }
    this.fadeState.clear();

    const direction = camera.position.clone().sub(target);
    const distance = direction.length();
    if (distance === 0) return;
    this.scene.updateMatrixWorld(true);
    this.raycaster.set(target, direction.normalize());
    this.raycaster.far = distance;
    const hit = this.raycaster.intersectObjects(occluders(this.scene), true)[0];
    if (!hit) return;

    for (const material of materials(hit.object)) {
      const mutable = material as Material & { opacity: number; transparent: boolean };
      this.fadeState.set(material, { opacity: mutable.opacity, transparent: mutable.transparent });
      mutable.transparent = true;
      mutable.opacity = 0.25;
      mutable.needsUpdate = true;
    }
  }

  private updateCollision(camera: Camera, target: Vector3): void {
    const direction = camera.position.clone().sub(target);
    const distance = direction.length();
    if (distance === 0) return;
    this.scene.updateMatrixWorld(true);
    this.raycaster.set(target, direction.normalize());
    this.raycaster.far = distance;
    const hit = this.raycaster.intersectObjects(occluders(this.scene), true)[0];
    if (hit) camera.position.copy(target).add(direction.setLength(Math.max(0.2, hit.distance - 0.2)));
  }
}
