import type Phaser from 'phaser';

/**
 * The 2D free camera for bridge `editor.camera` free mode: wheel zoom clamped to 0.35..1.4 of the zoom it was
 * enabled at, and middle/right-button or one-finger drag to pan, matching the 3D `EditorCamera`.
 */
export class PhaserEditorCamera {
  private enabled = false;
  private baseZoom = 1;
  private drag: { id: number; x: number; y: number } | undefined;

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  get active(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.camera.stopFollow();
    this.baseZoom = this.camera.zoom;
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.drag = undefined;
    this.camera.setZoom(this.baseZoom);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const desired = this.camera.zoom * Math.exp(-event.deltaY * 0.001);
    this.camera.setZoom(Math.max(this.baseZoom * 0.35, Math.min(this.baseZoom * 1.4, desired)));
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.drag) return;
    if (event.pointerType !== 'touch' && event.button !== 1 && event.button !== 2) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.drag?.id !== event.pointerId) return;
    this.camera.scrollX -= (event.clientX - this.drag.x) / this.camera.zoom;
    this.camera.scrollY -= (event.clientY - this.drag.y) / this.camera.zoom;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId) this.drag = undefined;
  };
}
