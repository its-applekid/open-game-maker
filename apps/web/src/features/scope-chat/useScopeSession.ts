import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgreedScope, ScopeChoices } from '@ogm/contracts';

import { ApiError } from '../../lib/api/client';
import { reduceMessages, type StreamedChatMessage } from '../build-chat/stream';
import { scopeTransport, type ScopeTransport } from './transport';

export type ScopeTurn = { id: string; who: 'you' | 'builder'; text: string };
export type ScopeStatus = 'connecting' | 'open' | 'agreed' | 'revising' | 'unavailable' | 'error';

export function useScopeSession(gameId: string, choices: ScopeChoices, transport: ScopeTransport = scopeTransport) {
  const [sessionId, setSessionId] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const [scope, setScope] = useState<AgreedScope>();
  const [messages, setMessages] = useState<StreamedChatMessage[]>([]);
  const [status, setStatus] = useState<ScopeStatus>('connecting');
  const [error, setError] = useState('');
  const revisionBase = useRef<string | undefined>(undefined);
  const latestScope = useRef<string | undefined>(undefined);
  const choicesKey = JSON.stringify(choices);

  useEffect(() => {
    let current = true;
    let stopStream: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const refresh = async (id: string) => {
      const session = await transport.getSession(gameId, id);
      if (!current) return;
      if (session.status === 'agreed' && session.scope) {
        const next = JSON.stringify(session.scope);
        if (revisionBase.current !== undefined && revisionBase.current === next) return;
        if (revisionBase.current === undefined && latestScope.current === next) return;
        revisionBase.current = undefined;
        latestScope.current = next;
        setScope(session.scope);
        setStatus('agreed');
        setError('');
      } else if (session.status === 'abandoned') {
        setStatus('error');
        setError('This scope conversation was closed.');
      } else {
        setStatus(revisionBase.current === undefined ? 'open' : 'revising');
        setError('');
      }
    };

    void transport
      .createSession(gameId, JSON.parse(choicesKey) as ScopeChoices)
      .then(({ sessionId: createdSessionId, jobId: createdJobId }) => {
        if (!current) return;
        setSessionId(createdSessionId);
        setJobId(createdJobId);
        setStatus('open');
        stopStream = transport.subscribe(createdJobId, (message) => {
          if (current) setMessages((existing) => reduceMessages(existing, message));
        });
        void refresh(createdSessionId).catch(handleError);
        poll = setInterval(() => void refresh(createdSessionId).catch(handleError), 2_000);
      })
      .catch(handleError);

    function handleError(cause: unknown) {
      if (!current) return;
      if (cause instanceof ApiError && (cause.status === 402 || cause.status === 404 || cause.status === 503)) {
        setStatus('unavailable');
        setError('The builder is unavailable right now. Try again later.');
      } else {
        setStatus('error');
        setError('The builder lost the conversation. Try again.');
      }
    }

    return () => {
      current = false;
      clearInterval(poll);
      stopStream?.();
    };
  }, [choicesKey, gameId, transport]);

  const addMessage = useCallback(
    (message: StreamedChatMessage) => setMessages((existing) => reduceMessages(existing, message)),
    [],
  );

  const send = useCallback(
    async (text: string) => {
      if (!jobId) return;
      addMessage(await transport.postText(jobId, text));
    },
    [addMessage, jobId, transport],
  );

  const requestRevision = useCallback(
    async (instruction: string) => {
      if (!jobId || !scope) return;
      const previous = scope;
      revisionBase.current = JSON.stringify(previous);
      setScope(undefined);
      setStatus('revising');
      try {
        addMessage(await transport.postText(jobId, instruction));
      } catch (cause) {
        revisionBase.current = undefined;
        setScope(previous);
        setStatus('agreed');
        throw cause;
      }
    },
    [addMessage, jobId, scope, transport],
  );

  const turns: ScopeTurn[] = messages.flatMap((message) =>
    message.text && message.actor !== 'system'
      ? [{ id: message.id, who: message.actor === 'creator' ? ('you' as const) : ('builder' as const), text: message.text }]
      : [],
  );

  return { sessionId, jobId, scope, turns, status, error, send, requestRevision, addMessage };
}
