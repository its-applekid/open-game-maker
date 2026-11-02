import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

import { PhaserEditorCamera } from './editor.js';

function pointer(type: string, options: { id: number; x: number; y: number; button?: number; pointerType?: string }) {
  const event = new MouseEvent(type, { button: options.button ?? 0, clientX: options.x, clientY: options.y });
  Object.defineProperties(event, {
    pointerId: { value: options.id },
    pointerType: { value: options.pointerType ?? 'mouse' },
  });
  return event;
}

function setup() {
  const camera = {
    zoom: 2,
    scrollX: 100,
    scrollY: 50,
    stopFollow: vi.fn(),
    setZoom: vi.fn((zoom: number) => {
      camera.zoom = zoom;
    }),
  };
  const canvas = document.createElement('canvas');
  const capturedPointers = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => capturedPointers.add(pointerId));
  const hasPointerCapture = vi.fn((pointerId: number) => capturedPointers.has(pointerId));
  const releasePointerCapture = vi.fn((pointerId: number) => capturedPointers.delete(pointerId));
  Object.defineProperties(canvas, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  });
  const editor = new PhaserEditorCamera(camera as unknown as Phaser.Cameras.Scene2D.Camera, canvas);
  return { camera, canvas, editor, setPointerCapture, releasePointerCapture };
}

describe('PhaserEditorCamera', () => {
  // Free mode hands the 2D camera to the watcher: it must stop following and pan/zoom only while enabled.
  it('stops following and pans with a right-button drag only while enabled', () => {
    const { camera, canvas, editor } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0, button: 2 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 1, x: 40, y: 20, button: 2 }));
    expect([camera.scrollX, camera.scrollY]).toEqual([100, 50]);

    editor.enable();
    expect(camera.stopFollow).toHaveBeenCalledOnce();
    canvas.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0, button: 2 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 1, x: 40, y: 20, button: 2 }));
    expect([camera.scrollX, camera.scrollY]).toEqual([80, 40]);
    canvas.dispatchEvent(pointer('pointerup', { id: 1, x: 40, y: 20, button: 2 }));

    canvas.dispatchEvent(pointer('pointerdown', { id: 2, x: 0, y: 0, pointerType: 'touch' }));
    canvas.dispatchEvent(pointer('pointermove', { id: 2, x: -20, y: 0, pointerType: 'touch' }));
    expect(camera.scrollX).toBe(90);

    editor.disable();
    canvas.dispatchEvent(pointer('pointermove', { id: 2, x: -60, y: 0, pointerType: 'touch' }));
    expect(camera.scrollX).toBe(90);
  });

  it('clamps wheel zoom around the enabled zoom and restores it on disable', () => {
    const { camera, canvas, editor } = setup();
    editor.enable();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100_000 }));
    expect(camera.zoom).toBeCloseTo(2.8);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100_000 }));
    expect(camera.zoom).toBeCloseTo(0.7);
    editor.disable();
    expect(camera.zoom).toBe(2);
    expect(editor.active).toBe(false);
  });

  it('clears captured drags when capture is lost or the camera is disabled', () => {
    const { camera, canvas, editor, setPointerCapture, releasePointerCapture } = setup();
    editor.enable();

    canvas.dispatchEvent(pointer('pointerdown', { id: 3, x: 0, y: 0, button: 1 }));
    expect(setPointerCapture).toHaveBeenCalledWith(3);
    canvas.dispatchEvent(pointer('pointermove', { id: 3, x: 20, y: 0, button: 1 }));
    expect(camera.scrollX).toBe(90);

    canvas.dispatchEvent(pointer('lostpointercapture', { id: 3, x: 20, y: 0, button: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 3, x: 40, y: 0 }));
    expect(camera.scrollX).toBe(90);

    canvas.dispatchEvent(pointer('pointerdown', { id: 4, x: 0, y: 0, button: 2 }));
    editor.disable();
    expect(releasePointerCapture).toHaveBeenCalledWith(4);
  });
});
