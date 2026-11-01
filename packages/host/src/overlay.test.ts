import { afterEach, describe, expect, it, vi } from 'vitest';

import { TouchOverlay } from './overlay.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function pointer(type: string, values: { pointerId: number; clientX: number; clientY: number }): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, values);
  return event;
}

describe('TouchOverlay', () => {
  it('renders a pass-through stick and accessible button targets', () => {
    const layer = document.createElement('div');
    document.body.append(layer);
    const overlay = new TouchOverlay({
      layer,
      inputs: { actions: { move: 'stick', jump: 'button', use: 'button' } },
      touch: 'stick',
      playerIndex: 0,
      onFrame: vi.fn(),
      coarsePointer: () => true,
    });
    const jump = layer.querySelector<HTMLElement>('[aria-label="jump"]')!;
    const use = layer.querySelector<HTMLElement>('[aria-label="use"]')!;
    expect(layer.style.pointerEvents).toBe('none');
    expect(layer.querySelector('[data-stick="move"]')).not.toBeNull();
    expect(jump.style.width).toBe('64px');
    expect(use.style.width).toBe('44px');
    overlay.dispose();
  });

  it('emits normalized stick movement and reset frames', () => {
    const layer = document.createElement('div');
    const onFrame = vi.fn();
    const overlay = new TouchOverlay({
      layer,
      inputs: { actions: { move: 'stick' } },
      touch: 'stick',
      playerIndex: 0,
      onFrame,
      coarsePointer: () => true,
      now: () => 10,
    });
    const stick = layer.querySelector<HTMLElement>('[data-stick="move"]')!;
    stick.setPointerCapture = vi.fn();
    stick.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
    stick.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 40, clientY: 10 }));
    expect(onFrame).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'touch', actions: { move: { x: 0.6, y: 0 } } }),
    );
    stick.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 40, clientY: 10 }));
    expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ actions: { move: { x: 0, y: 0 } } }));
    overlay.dispose();
  });

  it('hides for two seconds after keyboard input', () => {
    vi.useFakeTimers();
    const layer = document.createElement('div');
    const overlay = new TouchOverlay({
      layer,
      inputs: { actions: { jump: 'button' } },
      touch: 'stick',
      playerIndex: 0,
      onFrame: vi.fn(),
      coarsePointer: () => true,
      now: () => Date.now(),
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(layer.hidden).toBe(true);
    vi.advanceTimersByTime(2_001);
    expect(layer.hidden).toBe(false);
    overlay.dispose();
  });

  it('neutralizes active touch input while another input source is active', () => {
    vi.useFakeTimers();
    const layer = document.createElement('div');
    const onFrame = vi.fn();
    const overlay = new TouchOverlay({
      layer,
      inputs: { actions: { jump: 'button' } },
      touch: 'stick',
      playerIndex: 0,
      onFrame,
      coarsePointer: () => true,
      now: () => Date.now(),
    });
    const jump = layer.querySelector<HTMLButtonElement>('[aria-label="jump"]')!;
    jump.setPointerCapture = vi.fn();
    jump.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ actions: { jump: false } }));
    const callsAfterReset = onFrame.mock.calls.length;

    vi.advanceTimersByTime(251);

    expect(onFrame).toHaveBeenCalledTimes(callsAfterReset);
    overlay.dispose();
  });

  it('continues button input when pointer capture is unavailable', () => {
    const layer = document.createElement('div');
    const onFrame = vi.fn();
    const overlay = new TouchOverlay({
      layer,
      inputs: { actions: { jump: 'button' } },
      touch: 'stick',
      playerIndex: 0,
      onFrame,
      coarsePointer: () => true,
    });
    const jump = layer.querySelector<HTMLButtonElement>('[aria-label="jump"]')!;
    jump.setPointerCapture = vi.fn(() => {
      throw new DOMException('not active', 'InvalidStateError');
    });

    jump.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));

    expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ actions: { jump: true } }));
    overlay.dispose();
  });

  it('leaves tap-mode games without host controls', () => {
    const layer = document.createElement('div');
    const overlay = new TouchOverlay({
      layer,
      inputs: { actions: { jump: 'button' } },
      touch: 'tap',
      playerIndex: 0,
      onFrame: vi.fn(),
      coarsePointer: () => true,
    });
    expect(layer.childElementCount).toBe(0);
    overlay.dispose();
  });
});
