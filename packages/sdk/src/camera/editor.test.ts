import { OrthographicCamera } from 'three';
import { describe, expect, it } from 'vitest';

import { EditorCamera } from './editor.js';

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
});
