import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeAudioContext } from '../../test/audio-mock';

type Sound = typeof import('./index');

// lib/sound keeps one context per module instance: load a fresh copy for each test.
async function loadSound(): Promise<{ sound: Sound; ctx: FakeAudioContext }> {
  vi.resetModules();
  const sound = await import('./index');
  return { sound, ctx: FakeAudioContext.last! };
}

const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(8)));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  (navigator as unknown as { audioSession: { type: string } }).audioSession = { type: 'auto' };
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('unlock', () => {
  it('keeps playing on the iPhone silent switch and resumes the suspended context', async () => {
    const { sound, ctx } = await loadSound();

    sound.unlock();

    expect((navigator as unknown as { audioSession: { type: string } }).audioSession.type).toBe('playback');
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it('runs on the first tap release, the event iOS accepts', async () => {
    const { ctx } = await loadSound();

    window.dispatchEvent(new Event('pointerup'));

    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it('does not resume a hidden tab', async () => {
    const { sound, ctx } = await loadSound();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    sound.unlock();

    expect(ctx.resume).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('ext', () => {
  it('plays nothing before the context is unlocked', async () => {
    const { sound, ctx } = await loadSound();
    fetchMock.mockClear();

    sound.ext('/town/models/sounds/tick.mp3', 0.5, 1);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.sources.filter((s) => s.start.mock.calls.length > 0)).toHaveLength(0);
  });

  it('plays the effect on the host context at the posted rate once unlocked', async () => {
    const { sound, ctx } = await loadSound();
    sound.unlock();
    await flush();
    const before = ctx.sources.length;

    sound.ext('/town/models/sounds/tick.mp3', 0.5, 1.25);
    await flush();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith('/town/models/sounds/tick.mp3');
    const played = ctx.sources.slice(before);
    expect(played).toHaveLength(1);
    expect(played[0]!.playbackRate.value).toBe(1.25);
    expect(played[0]!.start).toHaveBeenCalled();
  });

  it('silences every town loop when the town goes away', async () => {
    const { sound, ctx } = await loadSound();
    sound.unlock();
    await flush();
    const before = ctx.gains.length;

    sound.extLoop('/town/models/sounds/fire.mp3', 0.4);
    sound.extLoop('/town/models/sounds/wind.mp3', 0.7);
    const loops = ctx.gains.slice(before);
    expect(loops.map((g) => g.gain.value)).toEqual([0.4, 0.7]);

    sound.extSilence();

    expect(loops.map((g) => g.gain.value)).toEqual([0, 0]);
  });
});

describe('mute and volume', () => {
  it('persists mute and unmutes when the volume is raised from silence', async () => {
    const { sound } = await loadSound();

    sound.setMuted(true);
    expect(sound.status()).toBe('off');
    expect(localStorage.getItem('ogm.sound')).toBe('off');

    sound.setVolume(0.4);

    expect(sound.status()).not.toBe('off');
    expect(localStorage.getItem('ogm.volume')).toBe('0.4');
  });

  it('starts muted after a reload when the player muted it', async () => {
    localStorage.setItem('ogm.sound', 'off');
    const { sound } = await loadSound();

    expect(sound.status()).toBe('off');
  });
});
