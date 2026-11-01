import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sound = vi.hoisted(() => ({
  ext: vi.fn(),
  extLoop: vi.fn(),
  extSilence: vi.fn(),
  titleReady: Promise.resolve(null),
}));
vi.mock('../../lib/sound', () => sound);

import { TitleTown, TOWN_SRC } from './TitleTown';

const frameOf = (c: HTMLElement) => c.querySelector('iframe');
const town = (c: HTMLElement) => c.querySelector('.title-town')!;

// a message as the browser delivers it: the source is the window that posted it
function post(data: unknown, source: Window | null) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(sound).forEach((f) => typeof f === 'function' && f.mockClear());
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountActive() {
  const view = render(<TitleTown active />);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('TitleTown', () => {
  it('creates the town frame only while the title is active, hidden from touch and assistive tech', async () => {
    const view = render(<TitleTown active={false} />);
    expect(frameOf(view.container)).toBeNull();

    view.rerender(<TitleTown active />);
    await act(async () => {
      await Promise.resolve();
    });

    const f = frameOf(view.container)!;
    expect(f.tabIndex).toBe(-1);
    expect(town(view.container)).toHaveAttribute('aria-hidden', 'true');
    expect(f.getAttribute('src')).toBe(TOWN_SRC);
  });

  it('paints the poster first and removes it after the town is ready and the fade is done', async () => {
    const { container } = await mountActive();
    expect(container.querySelector('.t-poster img')).not.toBeNull();

    post('town-ready', frameOf(container)!.contentWindow);

    expect(town(container)).toHaveClass('live');
    expect(container.querySelector('.t-poster')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1200));
    expect(container.querySelector('.t-poster')).toBeNull();
  });

  it('hides the poster at once under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const { container } = await mountActive();

    post('town-ready', frameOf(container)!.contentWindow);
    act(() => vi.advanceTimersByTime(0));

    expect(container.querySelector('.t-poster')).toBeNull();
  });

  it('ignores a town-ready from any window but the town frame', async () => {
    const { container } = await mountActive();

    post('town-ready', window);
    act(() => vi.advanceTimersByTime(2000));

    expect(town(container)).not.toHaveClass('live');
    expect(container.querySelector('.t-poster')).not.toBeNull();
  });

  it('plays the town effects and loops on the host audio', async () => {
    const { container } = await mountActive();
    const source = frameOf(container)!.contentWindow;

    post({ sfx: ['tick', 0.5, 1.2] }, source);
    post({ loop: ['fire', 0.3] }, source);

    expect(sound.ext).toHaveBeenCalledWith('/town/models/sounds/tick.mp3', 0.5, 1.2);
    expect(sound.extLoop).toHaveBeenCalledWith('/town/models/sounds/fire.mp3', 0.3);
  });

  it('removes the frame and silences its loops when the title is left', async () => {
    const view = await mountActive();
    sound.extSilence.mockClear();

    view.rerender(<TitleTown active={false} />);

    expect(frameOf(view.container)).toBeNull();
    expect(view.container.querySelector('.t-poster')).toBeNull();
    expect(sound.extSilence).toHaveBeenCalled();
  });

  it('passes a tap on the town through to it, but not a tap on a button', async () => {
    const view = render(
      <>
        <TitleTown active />
        <button type="button">Start</button>
      </>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const f = frameOf(view.container)!;
    f.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
    const postMessage = vi.spyOn(f.contentWindow!, 'postMessage');

    fireEvent.pointerDown(document.body, { clientX: 100, clientY: 50 });
    fireEvent.pointerDown(view.getByRole('button'), { clientX: 100, clientY: 50 });

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ tap: [0.5, 0.5] }, location.origin);
  });
});
