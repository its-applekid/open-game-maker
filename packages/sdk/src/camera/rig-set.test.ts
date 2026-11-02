import type { ActionFrame, CameraRig, ViewId } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { RigSet } from './rig-set.js';

function frame(playerIndex: number): ActionFrame {
  return { playerIndex, tick: 1, source: 'keyboard', actions: {} };
}

function fakeRig(id: ViewId = 'iso'): CameraRig {
  return {
    id,
    dimension: '3d',
    occlusion: 'none',
    inputMapping: { keyboard: {}, touch: 'stick', gamepad: {}, pointerLock: false },
    attach: vi.fn(),
    update: vi.fn(),
    worldToScreen: vi.fn(() => ({ x: 0, y: 0 })),
  };
}

describe('RigSet', () => {
  it('keeps one rig per local player and routes only that player frame', () => {
    const rigs = [fakeRig(), fakeRig()];
    const set = new RigSet((index) => rigs[index]!);

    expect(set.for(0)).toBe(set.for(0));
    set.update(1 / 60, [frame(0), frame(1)]);

    expect(rigs[0]!.update).toHaveBeenCalledWith(1 / 60, frame(0));
    expect(rigs[1]!.update).toHaveBeenCalledWith(1 / 60, frame(1));
  });

  it('switches to a player view without discarding the editor camera', () => {
    const editor = fakeRig('topdown');
    const player = fakeRig('follow');
    const set = new RigSet(() => player, editor);

    expect(set.active).toBe(editor);
    set.viewAsPlayer(0);
    expect(set.active).toBe(player);
    set.viewAsPlayer(null);
    expect(set.active).toBe(editor);
  });

  it('uses the configured local player when no editor is active', () => {
    const rigs = [fakeRig('iso'), fakeRig('follow')];
    const set = new RigSet((index) => rigs[index]!, undefined, 1);

    expect(set.active).toBe(rigs[1]);
    set.setLocalPlayerIndex(0);
    expect(set.active).toBe(rigs[0]);
  });

  it('disposes each created rig and the editor once', () => {
    const player = { ...fakeRig(), dispose: vi.fn() };
    const editor = { ...fakeRig('topdown'), dispose: vi.fn() };
    const set = new RigSet(() => player, editor);
    set.for(0);

    set.dispose();

    expect(player.dispose).toHaveBeenCalledOnce();
    expect(editor.dispose).toHaveBeenCalledOnce();
  });
});
