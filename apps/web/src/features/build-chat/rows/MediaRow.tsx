import { useState } from 'react';

import type { StreamedChatMessage } from '../stream';

export function MediaRow({ message }: { message: StreamedChatMessage }) {
  const [failed, setFailed] = useState(false);
  const media = message.media;
  if (!media) return <TextFallback message={message} />;
  const label = message.text || (message.kind === 'clip' ? 'Build clip' : 'Build image');
  const style = { aspectRatio: `${media.width} / ${media.height}` };

  return (
    <figure className={`build-chat-row media ${failed ? 'failed' : ''}`}>
      <div className="build-chat-media-frame" style={style}>
        {failed ? <span role="img" aria-label={`${label} unavailable`} /> : null}
        {message.kind === 'clip' ? (
          <video
            aria-label={label}
            controls
            muted
            playsInline
            poster={media.poster}
            preload="metadata"
            src={media.url}
            onError={() => setFailed(true)}
          />
        ) : (
          <img alt={label} src={media.url} onError={() => setFailed(true)} />
        )}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function TextFallback({ message }: { message: StreamedChatMessage }) {
  return message.text ? <p className="build-chat-row text agent">{message.text}</p> : null;
}
