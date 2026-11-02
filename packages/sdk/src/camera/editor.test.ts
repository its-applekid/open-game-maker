import { OrthographicCamera } from 'three';
import { describe, expect, it } from 'vitest';

import { EditorCamera } from './editor.js';

function pointer(
  type: string,
  options: { id: number; pointerType?: string; x: number; y: number; button?: number },
): Event {
  const event = new MouseEvent(type, {
    button: options.button ?? 0,
    clientX: options.x,
    clientY: options.y,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.id },
    pointerType: { value: options.pointerType ?? 'mouse' },
  });
  return event;
}

describe('EditorCamera', () => {
  it('zooms from wheel input and clamps around the fitted zoom', () => {
    const canvas = document.createElement('canvas');
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    const editor = new EditorCamera({ camera, canvas, view: 'iso' });
    editor.fit({ min: [-5, 0, -5], max: [5, 4, 5] });
    const fitted = camera.zoom;

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(camera.zoom).toBeGreaterThan(fitted);

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100_000 }));
    expect(camera.zoom).toBeCloseTo(fitted * 0.35);
    editor.dispose();
  });

  // Follow is the watcher's view of the player; Free must stop tracking and keep the last view for panning.
  it('tracks a followed target each update and stays put once released', () => {
    const canvas = document.createElement('canvas');
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    const editor = new EditorCamera({ camera, canvas, view: 'topdown' });
    let position: [number, number, number] = [4, 0, 2];
    editor.follow({ position: () => position });
    expect([camera.position.x, camera.position.z]).toEqual([4, expect.closeTo(2, 2)]);

    position = [6, 0, -3];
    editor.update();
    expect([camera.position.x, camera.position.z]).toEqual([6, expect.closeTo(-3, 2)]);

    editor.follow(undefined);
    position = [-8, 0, 8];
    editor.update();
    expect(camera.position.x).toBe(6);
    editor.dispose();
  });

  it('pans with a middle-button drag', () => {
    const canvas = document.createElement('canvas');
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    const editor = new EditorCamera({ camera, canvas, view: 'iso' });
    const before = camera.position.clone();

    canvas.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0, button: 1 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 1, x: 40, y: 0, button: 1 }));
    canvas.dispatchEvent(pointer('pointerup', { id: 1, x: 40, y: 0, button: 1 }));

    expect(camera.position.equals(before)).toBe(false);
    editor.dispose();
  });

  it('pinch-zooms with two touch pointers', () => {
    const canvas = document.createElement('canvas');
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    const editor = new EditorCamera({ camera, canvas, view: 'topdown' });

    canvas.dispatchEvent(pointer('pointerdown', { id: 1, pointerType: 'touch', x: 0, y: 0 }));
    canvas.dispatchEvent(pointer('pointerdown', { id: 2, pointerType: 'touch', x: 100, y: 0 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 2, pointerType: 'touch', x: 150, y: 0 }));

    expect(camera.zoom).toBeCloseTo(1.4);
    editor.dispose();
  });
});
