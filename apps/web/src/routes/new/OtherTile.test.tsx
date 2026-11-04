import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OtherTile } from './OtherTile';

afterEach(() => cleanup());

describe('OtherTile dictation', () => {
  it('marks a picked Other tile for limit feedback', () => {
    render(<OtherTile title="Vibe" value="Moonlit" full limitFeedback={1} onChange={vi.fn()} onFull={vi.fn()} />);

    const tile = screen.getByText('“Moonlit”').closest('.new-other');
    expect(tile).toHaveClass('new-limit-shake');
    expect(tile).toHaveAttribute('data-limit-feedback', '1');
  });

  it('keeps a final transcript editable until Add', () => {
    let listener: ((transcript: { kind: 'partial' | 'final'; text: string }) => void) | undefined;
    const onChange = vi.fn();
    const dictation = {
      pressStart: vi.fn(),
      pressEnd: vi.fn(),
      on: vi.fn((_event: 'transcript', next: typeof listener) => {
        listener = next;
        return vi.fn();
      }),
    };
    render(<OtherTile title="Vibe" full={false} onChange={onChange} onFull={vi.fn()} dictation={dictation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    act(() => listener?.({ kind: 'final', text: 'Moonlit and cozy' }));

    const transcript = screen.getByRole('textbox', { name: 'Your own vibe' });
    expect(transcript).toHaveValue('Moonlit and cozy');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(transcript, { target: { value: 'Moonlit and quiet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith('Moonlit and quiet');
  });

  it('ends dictation and removes its listener when unmounted', () => {
    const off = vi.fn();
    const dictation = {
      pressStart: vi.fn(),
      pressEnd: vi.fn(),
      on: vi.fn(() => off),
    };
    const view = render(
      <OtherTile title="Vibe" full={false} onChange={vi.fn()} onFull={vi.fn()} dictation={dictation} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(screen.getByRole('button', { name: 'Say it' })).toBeEnabled();
    view.unmount();

    expect(dictation.pressEnd).toHaveBeenCalledOnce();
    expect(off).toHaveBeenCalledOnce();
  });
});
