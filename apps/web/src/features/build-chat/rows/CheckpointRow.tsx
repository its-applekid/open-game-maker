import type { StreamedChatMessage } from '../stream';

export function CheckpointRow({
  message,
  messages,
}: {
  message: StreamedChatMessage;
  messages: StreamedChatMessage[];
}) {
  const checkpoint = message.checkpoint;
  if (!checkpoint) return message.text ? <p className="build-chat-row checkpoint">{message.text}</p> : null;

  return (
    <article className="build-chat-row checkpoint" aria-label="Builder question">
      <strong>{checkpoint.question}</strong>
      <div className="build-chat-options">
        {checkpoint.options.map((option) => {
          const media = messages.find(({ id }) => id === option.media_id)?.media;
          return (
            <div className="build-chat-option" key={option.id}>
              {media ? <img alt="" src={media.poster ?? media.url} /> : null}
              <span>{option.label}</span>
            </div>
          );
        })}
      </div>
      <small>{checkpoint.status === 'open' ? 'Waiting for your answer' : checkpoint.status}</small>
    </article>
  );
}
