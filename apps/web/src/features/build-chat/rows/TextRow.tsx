import { speak } from '@ogm/voice-client';

import type { StreamedChatMessage } from '../stream';

export function TextRow({ message }: { message: StreamedChatMessage }) {
  const attachments = message.attachments ?? [];
  if (!message.text && attachments.length === 0) return null;
  return (
    <article className={`build-chat-row text ${message.actor}`} data-optimistic={message.optimistic || undefined}>
      {message.text ? <p>{message.text}</p> : null}
      {attachments.length > 0 ? (
        <ul className="build-chat-attachments">
          {attachments.map(({ id, name }) => (
            <li key={id}>
              <span>{name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {message.actor === 'agent' ? (
        <button className="build-chat-read tap-secondary" type="button" onClick={() => speak(message.text!)}>
          Read aloud
        </button>
      ) : null}
    </article>
  );
}
