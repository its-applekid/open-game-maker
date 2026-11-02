import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Offers } from './Offers';

afterEach(() => cleanup());

describe('Offers', () => {
  it('renders only the refusal options returned by admission', () => {
    const onChoose = vi.fn();
    render(<Offers offers={['trim', 'queue']} onChoose={onChoose} />);

    expect(screen.getByRole('button', { name: 'Trim it' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Queue for the reset' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Split it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask an admin' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Queue for the reset' }));
    expect(onChoose).toHaveBeenCalledWith('queue');
  });
});
