import type { RigInputMapping } from '@ogm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputMerger } from './merger.js';

const mapping: RigInputMapping = {
  keyboard: {},
  touch: 'two-stick',
  gamepad: {},
  pointerLock: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('pointer input', () => {
  it('requests pointer lock only from pointerdown on fine pointers', () => {
    const canvas = document.createElement('canvas');
    const requestPointerLock = vi.fn();
    Object.defineProperty(canvas, 'requestPointerLock', { configurable: true, value: requestPointerLock });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    const merger = new InputMerger({ localPlayerIndex: 0, mapping, canvas });

    canvas.dispatchEvent(new MouseEvent('mousemove'));
    expect(requestPointerLock).not.toHaveBeenCalled();
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));
    expect(requestPointerLock).toHaveBeenCalledOnce();
    merger.dispose();
  });

  it('never requests pointer lock on coarse pointers', () => {
    const canvas = document.createElement('canvas');
    const requestPointerLock = vi.fn();
    Object.defineProperty(canvas, 'requestPointerLock', { configurable: true, value: requestPointerLock });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const merger = new InputMerger({ localPlayerIndex: 0, mapping, canvas });

    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));

    expect(requestPointerLock).not.toHaveBeenCalled();
    merger.dispose();
  });
});
