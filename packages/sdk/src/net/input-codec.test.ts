import type { ActionFrame, GameManifest, InputFrame } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { assertInputFrameSize, decodeInputFrame, encodeInputFrame } from './input-codec.js';

type Actions = GameManifest['inputs']['actions'];

describe('net input codec', () => {
  it('round-trips declared sticks and buttons in manifest order', () => {
    const actions: Actions = { move: 'stick', jump: 'button', attack: 'button' };
    const frame: ActionFrame = {
      playerIndex: 1,
      tick: 120,
      source: 'keyboard',
      actions: { move: { x: 0.5, y: -1 }, jump: true, attack: false },
    };

    const encoded = encodeInputFrame(frame, actions, 7);

    expect(encoded).toEqual({ seq: 7, tick: 120, axes: [63 / 127, -1], buttons: 1 });
    expect(decodeInputFrame({ ...encoded, playerIndex: 1 }, actions)).toEqual({
      playerIndex: 1,
      tick: 120,
      source: 'network',
      actions: { move: { x: 63 / 127, y: -1 }, jump: true, attack: false },
    });
  });

  it('clamps axes and keeps the thirty-second button non-negative', () => {
    const actions = Object.fromEntries([
      ['move', 'axis'],
      ...Array.from({ length: 32 }, (_, index) => [`button${index}`, 'button']),
    ]) as Actions;
    const frame: ActionFrame = {
      playerIndex: 0,
      tick: 1,
      source: 'gamepad',
      actions: { move: 2, button31: true },
    };

    const encoded = encodeInputFrame(frame, actions, 1);
    const decoded = decodeInputFrame({ ...encoded, playerIndex: 0 }, actions);

    expect(encoded.axes).toEqual([1]);
    expect(encoded.buttons).toBe(2 ** 31);
    expect(decoded.actions.button31).toBe(true);
  });

  it('rejects more than eight declared axes', () => {
    const actions = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`axis${index}`, 'axis'])) as Actions;
    const frame: ActionFrame = { playerIndex: 0, tick: 0, source: 'gamepad', actions: {} };

    expect(() => encodeInputFrame(frame, actions, 1)).toThrow('at most 8 encoded axes');
  });

  it('rejects more than thirty-two declared buttons', () => {
    const actions = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`button${index}`, 'button']),
    ) as Actions;
    const frame: ActionFrame = { playerIndex: 0, tick: 0, source: 'gamepad', actions: {} };

    expect(() => encodeInputFrame(frame, actions, 1)).toThrow('at most 32 encoded buttons');
  });

  it('rejects an input frame whose JSON form exceeds 256 bytes', () => {
    const oversized = {
      seq: 1,
      tick: 1,
      axes: Array.from({ length: 30 }, () => 0.1234567890123456),
      buttons: 0,
    } as InputFrame;

    expect(() => assertInputFrameSize(oversized)).toThrow('maximum is 256');
  });

  it('measures the client input fields without server stamps', () => {
    const stamped = {
      seq: 1,
      tick: 1,
      axes: [],
      buttons: 0,
      playerIndex: 7,
      from: 'server-added-identity'.repeat(20),
    };

    expect(() => assertInputFrameSize(stamped)).not.toThrow();
  });
});
