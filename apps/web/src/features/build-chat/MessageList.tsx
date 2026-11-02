import { useEffect, useRef } from 'react';

import { rowFor } from './rows';
import type { StreamedChatMessage } from './stream';

export function MessageList({ messages }: { messages: StreamedChatMessage[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && pinned.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={listRef}
      className="build-chat-messages"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      onScroll={(event) => {
        const list = event.currentTarget;
        pinned.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 32;
      }}
    >
      {messages.map((message) => {
        const Row = rowFor(message.kind);
        return <Row key={message.id} message={message} messages={messages} />;
      })}
    </div>
  );
}
