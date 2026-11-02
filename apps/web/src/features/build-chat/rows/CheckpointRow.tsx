import { useEffect, useState } from 'react';

import { api } from '../../../lib/api/client';
import { CheckpointCard, type CheckpointBudget } from '../checkpoint-card';
import type { StreamedChatMessage } from '../stream';

export function CheckpointRow({
  message,
  messages,
}: {
  message: StreamedChatMessage;
  messages: StreamedChatMessage[];
}) {
  const checkpoint = message.checkpoint;
  const [budget, setBudget] = useState<CheckpointBudget>();
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    let active = true;
    void api<CheckpointBudget>(`/jobs/${encodeURIComponent(message.job_id)}/checkpoints/budget`)
      .then((next) => {
        if (active) setBudget(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [message.job_id, messages.length, checkpoint?.status]);

  if (!checkpoint) return message.text ? <p className="build-chat-row checkpoint">{message.text}</p> : null;

  const answer = async (optionId: string) => {
    setAnswering(true);
    try {
      await api(`/jobs/${encodeURIComponent(message.job_id)}/checkpoints/${encodeURIComponent(message.id)}/answer`, {
        method: 'POST',
        json: { option_id: optionId },
      });
    } catch {
      setAnswering(false);
    }
  };

  return (
    <CheckpointCard
      message={message}
      mediaById={(id) => messages.find((candidate) => candidate.id === id)}
      budget={budget}
      busy={answering}
      onAnswer={(optionId) => void answer(optionId)}
    />
  );
}
