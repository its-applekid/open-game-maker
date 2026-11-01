import type { BuildChatMessage } from '@ogm/contracts';

export type StreamedChatMessage = Omit<BuildChatMessage, 'id' | 'kind'> & {
  id: string;
  kind: string;
  optimistic?: boolean;
};

type EventSourceFactory = (url: string) => EventSource;

export function reduceMessages(messages: StreamedChatMessage[], incoming: StreamedChatMessage): StreamedChatMessage[] {
  const withoutDuplicate = messages.filter((message) => message.id !== incoming.id);
  const reconciled = incoming.optimistic
    ? withoutDuplicate
    : withoutDuplicate.filter((message) => !matchesOptimistic(message, incoming));
  return [...reconciled, incoming].sort((left, right) => left.id.localeCompare(right.id));
}

export function chatStreamUrl(jobId: string, since: number): string {
  return `/api/v1/jobs/${encodeURIComponent(jobId)}/chat?since=${since}`;
}

export function subscribeChat(
  jobId: string,
  initialSince: number,
  onMessage: (message: StreamedChatMessage, sequence: number) => void,
  makeEventSource: EventSourceFactory = (url) => new EventSource(url),
): () => void {
  let since = initialSince;
  let source: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryAttempt = 0;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    const current = makeEventSource(chatStreamUrl(jobId, since));
    source = current;
    current.onopen = () => {
      retryAttempt = 0;
    };
    current.addEventListener('message', (event) => {
      if (stopped) return;
      const message = event as MessageEvent<string>;
      try {
        const parsed = JSON.parse(message.data) as StreamedChatMessage;
        const sequence = Number(message.lastEventId);
        if (Number.isSafeInteger(sequence) && sequence >= 0) since = Math.max(since, sequence);
        onMessage(parsed, since);
      } catch {
        // A malformed row is isolated to this event; the next valid row can still advance the chat.
      }
    });
    current.onerror = () => {
      if (stopped || source !== current) return;
      current.close();
      source = undefined;
      const delay = Math.min(1_000 * 2 ** retryAttempt, 30_000);
      retryAttempt += 1;
      retry = setTimeout(open, delay);
    };
  };

  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
  };
}

function matchesOptimistic(left: StreamedChatMessage, right: StreamedChatMessage): boolean {
  if (!left.optimistic || right.actor !== 'creator' || left.actor !== right.actor || left.text !== right.text)
    return false;
  return Math.abs(Date.parse(left.at) - Date.parse(right.at)) <= 5_000;
}
