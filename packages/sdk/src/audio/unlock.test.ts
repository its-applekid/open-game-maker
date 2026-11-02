import { describe, expect, it, vi } from 'vitest';

import { createAudio } from './index.js';
import { FakeAudioContext, FakeWindow, asWindow, contextConstructor } from './test/fake-audio.js';

function setup(state: AudioContextState | 'interrupted' = 'suspended') {
  const context = new FakeAudioContext();
  context.state = state;
  const win = new FakeWindow();
  const audio = createAudio({ rng: () => 0.5, win: asWindow(win), AudioContextCtor: contextConstructor(context) });
  return { audio, context, win };
}

describe('audio unlock', () => {
  it('unlocks on pointerup and kicks a silent one-frame buffer', async () => {
    const { audio, context, win } = setup();
    win.navigator.audioSession = { type: 'ambient' };

    win.dispatchEvent(new Event('pointerup'));
    await vi.waitFor(() => expect(audio.status()).toBe('on'));

    expect(context.resumeCalls).toBe(1);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.starts).toEqual([[0, 0]]);
    expect(win.navigator.audioSession.type).toBe('playback');
  });

  it('resumes an interrupted iOS context', async () => {
    const { audio, context } = setup('interrupted');
    await audio.unlock();
    expect(context.resumeCalls).toBe(1);
  });

  it('does nothing while the document is hidden', async () => {
    const { audio, context, win } = setup();
    win.document.hidden = true;
    await audio.unlock();
    expect(context.resumeCalls).toBe(0);
    expect(context.sources).toHaveLength(0);
  });

  it('suspends in a hidden tab and resumes when visible again', async () => {
    const { context, win } = setup('running');
    win.document.hidden = true;
    win.document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(context.suspendCalls).toBe(1));

    win.document.hidden = false;
    win.document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(context.resumeCalls).toBe(1));
  });

  it('serializes a rapid hide and show around a pending suspension', async () => {
    const { context, win } = setup('running');
    let finishSuspend!: () => void;
    const suspended = new Promise<void>((resolve) => {
      finishSuspend = resolve;
    });
    const suspend = vi.spyOn(context, 'suspend').mockImplementation(async () => {
      await suspended;
      context.state = 'suspended';
    });
    const resume = vi.spyOn(context, 'resume');

    win.document.hidden = true;
    win.document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(suspend).toHaveBeenCalledOnce());
    win.document.hidden = false;
    win.document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(resume).not.toHaveBeenCalled();

    finishSuspend();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    expect(context.state).toBe('running');
  });
});
