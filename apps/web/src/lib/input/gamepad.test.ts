import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Input = typeof import('./gamepad');

// A fake pad and a hand-cranked animation frame: each frame() call runs one poll at time t.
let pad: { index: number; axes: number[]; buttons: { pressed: boolean; value: number }[] };
let pending: FrameRequestCallback | null = null;
let input: Input;
let stop: () => void;
let keys: string[];

const setButton = (i: number, pressed: boolean) => {
  pad.buttons[i] = { pressed, value: pressed ? 1 : 0 };
};
const frame = (t: number) => {
  const cb = pending!;
  pending = null;
  cb(t);
};

beforeEach(async () => {
  vi.resetModules();
  input = await import('./gamepad');
  pad = { index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null] });
  keys = [];
  document.body.innerHTML = '<button id="start">Start</button>';
  document.querySelector<HTMLButtonElement>('#start')!.focus();
  document.addEventListener('keydown', record);
  stop = input.startGamepadPoller();
});

afterEach(() => {
  stop();
  document.removeEventListener('keydown', record);
  vi.unstubAllGlobals();
});

function record(e: KeyboardEvent) {
  keys.push(`${(e.target as HTMLElement).id || 'body'}:${e.key}`);
}

describe('gamepad poller', () => {
  it('turns an A press into one Enter on the focused control', () => {
    frame(0);
    setButton(0, true);
    frame(16);

    expect(keys).toEqual(['start:Enter']);
  });

  it('does not repeat a held button', () => {
    setButton(0, true);
    for (let i = 0; i < 10; i++) frame(i * 16);

    expect(keys).toEqual(['start:Enter']);
  });

  it('clicks the focused button so A activates it like a real Enter', () => {
    const click = vi.fn();
    document.querySelector('#start')!.addEventListener('click', click);
    setButton(0, true);
    frame(0);

    expect(click).toHaveBeenCalledOnce();
  });

  it('sends nothing to the menus in play mode but still hands frames to the game', () => {
    const frames: number[] = [];
    input.onFrame((f) => frames.push(f.t));
    input.setPlayMode(true);

    setButton(0, true);
    pad.axes[0] = -0.9;
    frame(0);
    frame(16);

    expect(keys).toEqual([]);
    expect(frames).toEqual([0, 16]);
  });

  it('moves left once on a stick push, then repeats after 400 ms', () => {
    pad.axes[0] = -0.9;
    frame(0);
    frame(200);
    expect(keys).toEqual(['start:ArrowLeft']);

    frame(400);
    frame(450);
    frame(520);
    expect(keys).toEqual(['start:ArrowLeft', 'start:ArrowLeft', 'start:ArrowLeft']);
  });

  it('ignores a stick inside the dead zone', () => {
    pad.axes[1] = 0.3;
    frame(0);

    expect(keys).toEqual([]);
  });
});
