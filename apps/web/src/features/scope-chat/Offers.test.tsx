import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Offers } from './Offers';

afterEach(() => cleanup());

describe('Offers', () => {
  it('renders only the refusal options returned by admission', () => {
    const onChoose = vi.fn();
    render(<Offers offers={['queue', 'ask_admin']} onChoose={onChoose} />);

    expect(screen.getByRole('button', { name: 'Queue for the reset' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ask an admin' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Queue for the reset' }));
    expect(onChoose).toHaveBeenCalledWith('queue');
  });
});
