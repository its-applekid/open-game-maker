import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageList } from './MessageList';
import type { StreamedChatMessage } from './stream';

const base = {
  job_id: 'j_1',
  at: '2026-11-01T09:00:00Z',
  actor: 'agent' as const,
};

afterEach(() => cleanup());

describe('MessageList', () => {
  it('renders reserved media, progress, and a read-only checkpoint', () => {
    const messages: StreamedChatMessage[] = [
      {
        ...base,
        id: 'm_1',
        kind: 'image',
        text: 'The new room',
        media: { url: 'https://example.test/room.webp', width: 640, height: 360 },
      },
      { ...base, id: 'm_2', kind: 'progress', actor: 'system', text: 'Wiring the door' },
      {
        ...base,
        id: 'm_3',
        kind: 'checkpoint',
        checkpoint: {
          decision_id: 'd_1',
          question: 'Which door?',
          options: [{ id: 'wood', label: 'Wooden', media_id: 'm_1' }],
          status: 'open',
        },
      },
    ];

    render(<MessageList messages={messages} />);

    expect(screen.getByRole('img', { name: 'The new room' }).parentElement).toHaveStyle({
      aspectRatio: '640 / 360',
    });
    expect(screen.getByText('Wiring the door')).toBeInTheDocument();
    expect(screen.getByText('Which door?')).toBeInTheDocument();
    expect(screen.getByText('Wooden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wooden' })).not.toBeInTheDocument();
  });

  it('falls back to text for an unknown kind', () => {
    render(<MessageList messages={[{ ...base, id: 'm_4', kind: 'future', text: 'Still readable' }]} />);
    expect(screen.getByText('Still readable')).toBeInTheDocument();
  });

  it('keeps a failed media row reserved and captioned', () => {
    render(
      <MessageList
        messages={[
          {
            ...base,
            id: 'm_failed',
            kind: 'image',
            text: 'Door preview',
            media: { url: 'https://example.test/missing.webp', width: 640, height: 360 },
          },
        ]}
      />,
    );

    const image = screen.getByRole('img', { name: 'Door preview' });
    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'Door preview unavailable' }).parentElement).toHaveStyle({
      aspectRatio: '640 / 360',
    });
    expect(screen.getByText('Door preview')).toBeInTheDocument();
  });

  it('keeps a pinned list at the bottom but leaves a reader who scrolled up alone', () => {
    const first = { ...base, id: 'm_1', kind: 'text', text: 'First' };
    const second = { ...base, id: 'm_2', kind: 'text', text: 'Second' };
    const third = { ...base, id: 'm_3', kind: 'text', text: 'Third' };
    const { rerender } = render(<MessageList messages={[first]} />);
    const list = screen.getByRole('log');
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 100 },
    });

    list.scrollTop = 400;
    fireEvent.scroll(list);
    rerender(<MessageList messages={[first, second]} />);
    expect(list.scrollTop).toBe(500);

    list.scrollTop = 100;
    fireEvent.scroll(list);
    rerender(<MessageList messages={[first, second, third]} />);
    expect(list.scrollTop).toBe(100);
  });
});
