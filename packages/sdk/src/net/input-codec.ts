import type { ActionFrame, ActionValue, GameManifest, InputFrame } from '@ogm/contracts';

import { NET_LIMITS, packJson } from './codec.js';

type Actions = GameManifest['inputs']['actions'];
type StampedInputFrame = InputFrame & { playerIndex: number };

export function assertInputFrameSize(frame: InputFrame): void {
  packJson(
    { seq: frame.seq, tick: frame.tick, axes: frame.axes, buttons: frame.buttons },
    NET_LIMITS.inputBytes,
    'input',
  );
}

export function encodeInputFrame(frame: ActionFrame, actions: Actions, seq: number): InputFrame {
  const axes: number[] = [];
  let buttons = 0;
  let buttonIndex = 0;

  for (const [name, kind] of Object.entries(actions)) {
    const value = frame.actions[name];
    if (kind === 'button') {
      if (buttonIndex >= 32) throw new RangeError('manifest inputs produce at most 32 encoded buttons');
      if (value === true) buttons += 2 ** buttonIndex;
      buttonIndex += 1;
      continue;
    }

    if (kind === 'stick') {
      const stick = isStick(value) ? value : { x: 0, y: 0 };
      axes.push(quantizeAxis(stick.x), quantizeAxis(stick.y));
    } else {
      axes.push(quantizeAxis(typeof value === 'number' ? value : 0));
    }
  }

  if (axes.length > 8) throw new RangeError('manifest inputs produce at most 8 encoded axes');

  const encoded = { seq, tick: frame.tick, axes, buttons };
  assertInputFrameSize(encoded);
  return encoded;
}

export function decodeInputFrame(frame: StampedInputFrame, actions: Actions): ActionFrame {
  const decoded: Record<string, ActionValue> = {};
  let axisIndex = 0;
  let buttonIndex = 0;

  for (const [name, kind] of Object.entries(actions)) {
    if (kind === 'button') {
      decoded[name] = Math.floor(frame.buttons / 2 ** buttonIndex) % 2 === 1;
      buttonIndex += 1;
    } else if (kind === 'stick') {
      decoded[name] = { x: frame.axes[axisIndex] ?? 0, y: frame.axes[axisIndex + 1] ?? 0 };
      axisIndex += 2;
    } else {
      decoded[name] = frame.axes[axisIndex] ?? 0;
      axisIndex += 1;
    }
  }

  return {
    playerIndex: frame.playerIndex,
    tick: frame.tick,
    source: 'network',
    actions: decoded,
  };
}

function quantizeAxis(value: number): number {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  return Math.trunc(clamped * 127) / 127;
}

function isStick(value: ActionValue | undefined): value is { x: number; y: number } {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value;
}
