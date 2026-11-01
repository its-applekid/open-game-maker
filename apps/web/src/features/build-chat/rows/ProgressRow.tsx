import type { StreamedChatMessage } from '../stream';

export function ProgressRow({ message }: { message: StreamedChatMessage }) {
  return message.text ? <p className="build-chat-row progress">{message.text}</p> : null;
}
