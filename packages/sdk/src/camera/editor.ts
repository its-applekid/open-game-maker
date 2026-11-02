import type { CameraRig, Vec3 } from '@ogm/contracts';
import type { Camera } from 'three';
import { OrthographicCamera, Vector3 } from 'three';

import { defaultInputMapping } from './mapping.js';
import { projectWorldToScreen } from './projection.js';

export interface EditorCameraOptions {
  camera: Camera;
  canvas: HTMLCanvasElement;
  view: 'iso' | 'topdown';
  viewport?: () => { width: number; height: number };
}

export class EditorCamera implements CameraRig {
  readonly id;
  readonly dimension = '3d' as const;
  readonly occlusion = 'none' as const;
  readonly inputMapping;
  private readonly center = new Vector3();
  private fitZoom = 1;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private readonly touches = new Map<number, { x: number; y: number }>();
  private previousPinch: { x: number; y: number; distance: number } | undefined;
  private followed: { position(): Vec3 } | undefined;

  constructor(private readonly options: EditorCameraOptions) {
    this.id = options.view;
    this.inputMapping = defaultInputMapping(options.view);
    options.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    options.canvas.addEventListener('pointerdown', this.onPointerDown);
    options.canvas.addEventListener('pointermove', this.onPointerMove);
    options.canvas.addEventListener('pointerup', this.onPointerUp);
    options.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.applyPose();
  }

  get camera(): Camera {
    return this.options.camera;
  }

  attach(): void {}

  update(): void {
    if (this.followed) this.center.fromArray(this.followed.position());
    this.applyPose();
  }

  /** Track `target` each update (bridge `editor.camera` follow); `undefined` leaves the camera where it is, free. */
  follow(target: { position(): Vec3 } | undefined): void {
    this.followed = target;
    this.update();
  }

  fit(bounds: { min: Vec3; max: Vec3 }): void {
    this.center.fromArray(bounds.min).add(new Vector3().fromArray(bounds.max)).multiplyScalar(0.5);
    if (this.options.camera instanceof OrthographicCamera) {
      const width = Math.max(1, bounds.max[0] - bounds.min[0]);
      const depth = Math.max(1, bounds.max[2] - bounds.min[2]);
      const span = Math.max(width, depth);
      const frustumSpan = Math.max(1, this.options.camera.right - this.options.camera.left);
      this.fitZoom = frustumSpan / span;
      this.options.camera.zoom = this.fitZoom;
      this.options.camera.updateProjectionMatrix();
    }
    this.applyPose();
  }

  worldToScreen(point: Vec3): { x: number; y: number } | null {
    return projectWorldToScreen(this.options.camera, point);
  }

  dispose(): void {
    const canvas = this.options.canvas;
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!(this.options.camera instanceof OrthographicCamera)) return;
    const desired = this.options.camera.zoom * Math.exp(-event.deltaY * 0.001);
    this.options.camera.zoom = Math.max(this.fitZoom * 0.35, Math.min(this.fitZoom * 1.4, desired));
    this.options.camera.updateProjectionMatrix();
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      this.options.canvas.setPointerCapture?.(event.pointerId);
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.updatePinch();
      return;
    }
    if (event.button !== 1 && event.button !== 2) return;
    this.dragging = true;
    this.options.canvas.setPointerCapture?.(event.pointerId);
    this.lastPointer = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && this.touches.has(event.pointerId)) {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.applyPinch();
      return;
    }
    if (!this.dragging) return;
    this.pan(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
    this.lastPointer = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.options.canvas.hasPointerCapture?.(event.pointerId)) {
      this.options.canvas.releasePointerCapture(event.pointerId);
    }
    if (event.pointerType === 'touch') {
      this.touches.delete(event.pointerId);
      this.updatePinch();
    } else {
      this.dragging = false;
    }
  };

  private pan(dx: number, dy: number): void {
    const camera = this.options.camera;
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    const forward = new Vector3();
    camera.getWorldDirection(forward);
    forward.setY(0).normalize();
    const scale = 0.02 / (camera instanceof OrthographicCamera ? camera.zoom : 1);
    this.center.addScaledVector(right, -dx * scale).addScaledVector(forward, dy * scale);
    this.applyPose();
  }

  private updatePinch(): void {
    if (this.touches.size !== 2) {
      this.previousPinch = undefined;
      return;
    }
    const [first, second] = [...this.touches.values()];
    this.previousPinch = {
      x: (first!.x + second!.x) / 2,
      y: (first!.y + second!.y) / 2,
      distance: Math.hypot(first!.x - second!.x, first!.y - second!.y),
    };
  }

  private applyPinch(): void {
    if (this.touches.size !== 2) return;
    const [first, second] = [...this.touches.values()];
    const next = {
      x: (first!.x + second!.x) / 2,
      y: (first!.y + second!.y) / 2,
      distance: Math.hypot(first!.x - second!.x, first!.y - second!.y),
    };
    if (this.previousPinch) {
      this.pan(next.x - this.previousPinch.x, next.y - this.previousPinch.y);
      if (this.options.camera instanceof OrthographicCamera && this.previousPinch.distance > 0) {
        const desired = this.options.camera.zoom * (next.distance / this.previousPinch.distance);
        this.options.camera.zoom = Math.max(this.fitZoom * 0.35, Math.min(this.fitZoom * 1.4, desired));
        this.options.camera.updateProjectionMatrix();
      }
    }
    this.previousPinch = next;
  }

  private applyPose(): void {
    const camera = this.options.camera;
    if (this.options.view === 'topdown') {
      camera.position.set(this.center.x, this.center.y + 30, this.center.z + 0.001);
      camera.up.set(0, 0, -1);
    } else {
      camera.position.copy(this.center).add(new Vector3(15, 16.5, 15));
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(this.center);
    camera.updateMatrixWorld();
  }
}
