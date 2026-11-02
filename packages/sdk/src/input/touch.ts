import type { ActionValue, RigInputMapping } from '@ogm/contracts';

export class TouchInput {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mode: RigInputMapping['touch'],
    private readonly emit: (actions: Record<string, ActionValue>) => void,
  ) {
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  dispose(): void {
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
  }

  private readonly onTouchStart = (event: TouchEvent) => {
    if (event.changedTouches.length === 0) return;
    event.preventDefault();
    const touch = event.changedTouches[0]!;
    if (this.mode === 'tap') this.emit({ tap: true });
    else this.emit({ aim: this.normalized(touch.clientX, touch.clientY) });
  };

  private readonly onTouchMove = (event: TouchEvent) => {
    if (event.changedTouches.length === 0 || this.mode === 'tap') return;
    event.preventDefault();
    const touch = event.changedTouches[0]!;
    this.emit({ aim: this.normalized(touch.clientX, touch.clientY) });
  };

  private normalized(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0,
      y: bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0,
    };
  }
}
