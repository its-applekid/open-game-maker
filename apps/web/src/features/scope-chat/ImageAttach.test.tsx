import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fitImageWithin, ImageAttach } from './ImageAttach';

afterEach(() => cleanup());

describe('ImageAttach', () => {
  it('fits the longest edge within 2048 pixels without stretching', () => {
    expect(fitImageWithin(3000, 1000)).toEqual({ width: 2048, height: 683 });
    expect(fitImageWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('refuses non-image files before attempting a resize', async () => {
    const resize = vi.fn();
    render(<ImageAttach resize={resize} onReady={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Choose a drawing'), {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] },
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Choose an image file'));
    expect(resize).not.toHaveBeenCalled();
  });

  it('passes the resized image to the scope transport callback', async () => {
    const resized = new Blob(['resized'], { type: 'image/webp' });
    const onReady = vi.fn();
    render(<ImageAttach resize={vi.fn().mockResolvedValue(resized)} onReady={onReady} />);

    fireEvent.change(screen.getByLabelText('Choose a drawing'), {
      target: { files: [new File(['image'], 'drawing.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(resized));
  });
});
