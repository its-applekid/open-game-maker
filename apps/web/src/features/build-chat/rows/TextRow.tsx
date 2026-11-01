import { speak } from '@ogm/voice-client';

import type { StreamedChatMessage } from '../stream';

export function TextRow({ message }: { message: StreamedChatMessage }) {
  if (!message.text) return null;
  return (
    <article className={`build-chat-row text ${message.actor}`} data-optimistic={message.optimistic || undefined}>
      <p>{message.text}</p>
      {message.actor === 'agent' ? (
        <button className="build-chat-read tap-secondary" type="button" onClick={() => speak(message.text!)}>
          Read aloud
        </button>
      ) : null}
    </article>
  );
}
