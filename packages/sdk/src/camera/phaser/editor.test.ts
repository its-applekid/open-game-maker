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
  const editor = new PhaserEditorCamera(camera as unknown as Phaser.Cameras.Scene2D.Camera, canvas);
  return { camera, canvas, editor };
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
});
