import type { RigInputMapping } from '@ogm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputMerger } from './merger.js';

const mapping: RigInputMapping = {
  keyboard: {},
  touch: 'two-stick',
  gamepad: {},
  pointerLock: true,
};

afterEach(() => {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it('falls back when pointer lock throws synchronously', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: vi.fn(() => {
        throw new DOMException('denied');
      }),
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const merger = new InputMerger({ localPlayerIndex: 0, mapping, canvas });

    expect(() => canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }))).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    merger.dispose();
  });

  it('captures drag pointers and releases an owned pointer lock when disabled', () => {
    const canvas = document.createElement('canvas');
    const capture = vi.fn();
    const release = vi.fn();
    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: capture },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: release },
    });
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: canvas });
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exitPointerLock });
    const merger = new InputMerger({ localPlayerIndex: 0, mapping, canvas });
    const down = new MouseEvent('pointerdown', { button: 2 });
    Object.defineProperty(down, 'pointerId', { value: 7 });
    const up = new MouseEvent('pointerup');
    Object.defineProperty(up, 'pointerId', { value: 7 });

    canvas.dispatchEvent(down);
    canvas.dispatchEvent(up);
    merger.setPointerLock(false);

    expect(capture).toHaveBeenCalledWith(7);
    expect(release).toHaveBeenCalledWith(7);
    expect(exitPointerLock).toHaveBeenCalledOnce();
    merger.dispose();
  });
});
