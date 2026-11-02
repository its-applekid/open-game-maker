import { useEffect, useMemo, useRef, useState } from 'react';

import type { Job } from '@ogm/contracts';

import { api } from '../../lib/api/client';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { reduceMessages, subscribeChat, type StreamedChatMessage } from './stream';

export function Chat({
  job,
  onBack,
  onMessages,
}: {
  job: Job;
  onBack(): void;
  onMessages?(jobId: string, messages: StreamedChatMessage[]): void;
}) {
  const [messages, setMessages] = useState<StreamedChatMessage[]>([]);
  const since = useRef(0);

  useEffect(() => {
    setMessages([]);
    since.current = 0;
    return subscribeChat(job.id, since.current, (message, sequence) => {
      since.current = Math.max(since.current, sequence);
      setMessages((current) => reduceMessages(current, message));
    });
  }, [job.id]);

  useEffect(() => onMessages?.(job.id, messages), [job.id, messages, onMessages]);

  const addMessage = (message: StreamedChatMessage) => setMessages((current) => reduceMessages(current, message));
  const removeMessage = (messageId: string) => setMessages((current) => current.filter(({ id }) => id !== messageId));
  const voiceTarget = useMemo(
    () => ({
      kind: 'build' as const,
      game_id: job.gameId,
      job_id: job.id,
      ticket: job.aiurIssueNumber === null ? '' : String(job.aiurIssueNumber),
      creator_id: job.creatorId,
    }),
    [job.aiurIssueNumber, job.creatorId, job.gameId, job.id],
  );

  return (
    <section className="build-chat-chat" aria-label={`${job.plan.title} build chat`}>
      <header className="build-chat-chat-head">
        <button className="build-chat-back tap-secondary" type="button" onClick={onBack}>
          Back
        </button>
        <h3>{job.plan.title}</h3>
      </header>
      <MessageList messages={messages} />
      <Composer
        jobId={job.id}
        voiceTarget={voiceTarget}
        postText={postChatText}
        onOptimistic={addMessage}
        onPosted={addMessage}
        onFailed={removeMessage}
      />
    </section>
  );
}

async function postChatText(jobId: string, text: string, attachments?: string[]): Promise<StreamedChatMessage> {
  return api<StreamedChatMessage>(`/jobs/${encodeURIComponent(jobId)}/chat`, {
    method: 'POST',
    json: { ...(text ? { text } : {}), ...(attachments ? { attachments } : {}) },
  });
}
