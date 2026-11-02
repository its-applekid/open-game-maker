import type { ActionValue } from '@ogm/contracts';

export interface PointerInputOptions {
  canvas: HTMLCanvasElement;
  pointerLock: boolean;
  emit(actions: Record<string, ActionValue>): void;
  aim?: (clientX: number, clientY: number) => ActionValue | null;
}

export class PointerInput {
  private dragging = false;
  private enabled: boolean;
  private last = { x: 0, y: 0 };
  private pointerLockErrorLogged = false;

  constructor(private readonly options: PointerInputOptions) {
    this.enabled = options.pointerLock;
    options.canvas.addEventListener('pointerdown', this.onPointerDown);
    options.canvas.addEventListener('pointermove', this.onPointerMove);
    options.canvas.addEventListener('pointerup', this.onPointerUp);
    options.canvas.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  setPointerLock(enabled: boolean): void {
    this.enabled = enabled && this.options.pointerLock;
  }

  dispose(): void {
    const canvas = this.options.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    this.dragging = true;
    this.last = { x: event.clientX, y: event.clientY };
    if (!this.enabled || event.button !== 0 || globalThis.matchMedia?.('(pointer: coarse)').matches) return;
    const request = this.options.canvas.requestPointerLock?.();
    if (request && typeof request.catch === 'function') request.catch(() => this.onPointerLockError());
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const locked = document.pointerLockElement === this.options.canvas;
    if (locked || this.dragging) {
      const x = locked ? event.movementX : event.clientX - this.last.x;
      const y = locked ? event.movementY : event.clientY - this.last.y;
      if (x !== 0 || y !== 0) this.options.emit({ look: { x, y } });
    }
    const aim = this.options.aim?.(event.clientX, event.clientY);
    if (aim !== null && aim !== undefined) this.options.emit({ aim });
    this.last = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = () => {
    this.dragging = false;
  };

  private readonly onPointerLockError = () => {
    if (this.pointerLockErrorLogged) return;
    this.pointerLockErrorLogged = true;
    console.warn('pointer lock unavailable; using drag look');
  };
}
