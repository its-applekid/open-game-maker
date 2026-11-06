import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyLink, playPath } from './CopyLink';

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CopyLink', () => {
  it('is an icon-only control labelled with the game it links to', () => {
    render(<CopyLink id="g_1" slug="castle-game" title="Castle Game" />);

    const control = screen.getByRole('button', { name: 'Copy link to Castle Game' });
    expect(control).toHaveTextContent('');
    expect(control.querySelector('svg')).not.toBeNull();
  });

  it('copies the shareable /play/<slug> address', async () => {
    render(<CopyLink id="g_1" slug="castle-game" title="Castle Game" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to Castle Game' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/castle-game`));
    expect(screen.getByRole('button', { name: 'Copy link to Castle Game' })).toHaveAttribute('data-copied', 'true');
  });

  it('stays a harmless no-op where the clipboard API is unavailable', () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    render(<CopyLink id="g_1" slug="castle-game" title="Castle Game" />);

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Copy link to Castle Game' }))).not.toThrow();
    expect(screen.getByRole('button', { name: 'Copy link to Castle Game' })).not.toHaveAttribute('data-copied');
  });

  it('falls back to the id form for a game without a slug', async () => {
    render(<CopyLink id="g_1" title="Castle Game" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to Castle Game' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/g_1`));
  });
});

describe('playPath', () => {
  it('prefers the slug and encodes it', () => {
    expect(playPath({ id: 'g_1', slug: 'castle game' })).toBe('/play/castle%20game');
    expect(playPath({ id: 'g_1', slug: null })).toBe('/play/g_1');
  });
});
