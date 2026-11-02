import type { ActionFrame, RigInputMapping } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { InputMerger, type InputBridge } from './merger.js';

const mapping: RigInputMapping = {
  keyboard: {
    KeyW: 'move.up',
    KeyA: 'move.left',
    KeyS: 'move.down',
    KeyD: 'move.right',
    Escape: 'host.pause',
  },
  touch: 'stick',
  gamepad: { leftStick: 'move' },
  pointerLock: false,
};

function setup() {
  let hostListener: ((frame: ActionFrame) => void) | undefined;
  const send = vi.fn();
  const bridge: InputBridge = {
    on: (_type, listener) => {
      hostListener = listener;
      return () => {
        hostListener = undefined;
      };
    },
    send,
  };
  const canvas = document.createElement('canvas');
  const merger = new InputMerger({ localPlayerIndex: 0, mapping, canvas, bridge, maxLocalPlayers: 2 });
  return { bridge, canvas, host: (frame: ActionFrame) => hostListener?.(frame), merger, send };
}

describe('InputMerger', () => {
  it('merges local keyboard with host gamepad and gives gamepad action ties priority', () => {
    const { canvas, host, merger } = setup();
    host({ playerIndex: 0, tick: 0, source: 'gamepad', actions: { jump: true, move: { x: 0.5, y: 0 } } });
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));

    expect(merger.sample(7)).toEqual([
      {
        playerIndex: 0,
        tick: 7,
        source: 'gamepad',
        actions: { jump: true, move: { x: 0.5, y: 0 } },
      },
    ]);
  });

  it('keeps host players separate and drops indexes outside the configured local count', () => {
    const { host, merger } = setup();
    host({ playerIndex: 1, tick: 0, source: 'gamepad', actions: { jump: true } });
    host({ playerIndex: 2, tick: 0, source: 'gamepad', actions: { jump: true } });

    expect(merger.sample(2).map(({ playerIndex }) => playerIndex)).toEqual([0, 1]);
    expect(merger.dropped).toBe(1);
  });

  it('delivers injected input on the next tick only', () => {
    const { merger } = setup();
    merger.inject({ playerIndex: 0, tick: 0, source: 'keyboard', actions: { use: true } });

    expect(merger.sample(3)[0]!.actions.use).toBe(true);
    expect(merger.sample(4)[0]!.actions.use).toBeUndefined();
  });

  it('forwards Escape as a raw key without producing an action', () => {
    const { canvas, merger, send } = setup();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));

    expect(send).toHaveBeenCalledWith('input.rawKey', { code: 'Escape', down: true });
    expect(merger.sample(1)[0]!.actions).toEqual({});
  });
});
