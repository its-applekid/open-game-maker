import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatStreamUrl, reduceMessages, subscribeChat, type StreamedChatMessage } from './stream';

function message(id: string, text: string): StreamedChatMessage {
  return {
    id,
    job_id: 'j_1',
    at: '2026-11-01T09:00:00Z',
    actor: 'agent',
    kind: 'text',
    text,
  };
}

describe('chat stream state', () => {
  afterEach(() => vi.useRealTimers());

  it('orders by id and deduplicates a resent message', () => {
    const b = message('m_b', 'second');
    const a = message('m_a', 'first');
    const reduced = [b, a, b].reduce(reduceMessages, [] as StreamedChatMessage[]);

    expect(reduced.map(({ id }) => id)).toEqual(['m_a', 'm_b']);
  });

  it('reconnects from the last received SSE sequence', () => {
    vi.useFakeTimers();
    const sources: FakeEventSource[] = [];
    const makeEventSource = vi.fn((url: string) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source as unknown as EventSource;
    });
    const stop = subscribeChat('j_1', 0, vi.fn(), makeEventSource);

    sources[0].message(message('m_a', 'first'), '3');
    sources[0].messageRaw('{', '9');
    sources[0].onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);

    sources[1].onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_999);

    expect(makeEventSource).toHaveBeenNthCalledWith(1, chatStreamUrl('j_1', 0));
    expect(makeEventSource).toHaveBeenNthCalledWith(2, chatStreamUrl('j_1', 3));
    expect(makeEventSource).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(makeEventSource).toHaveBeenNthCalledWith(3, chatStreamUrl('j_1', 3));
    stop();
  });
});

class FakeEventSource {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly close = vi.fn();
  private listener?: (event: Event) => void;

  constructor(readonly url: string) {}

  addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
    this.listener = typeof listener === 'function' ? listener : (event) => listener.handleEvent(event);
  }

  message(value: StreamedChatMessage, lastEventId: string) {
    this.listener?.(new MessageEvent('message', { data: JSON.stringify(value), lastEventId }));
  }

  messageRaw(data: string, lastEventId: string) {
    this.listener?.(new MessageEvent('message', { data, lastEventId }));
  }
}
