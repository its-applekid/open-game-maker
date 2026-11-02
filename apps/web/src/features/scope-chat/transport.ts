import type { AgreedScope, ScopeChoices } from '@ogm/contracts';

import { api } from '../../lib/api/client';
import { subscribeChat, type StreamedChatMessage } from '../build-chat/stream';

export type ScopeSessionResponse = {
  sessionId: string;
  status: 'open' | 'agreed' | 'abandoned';
  chatJobId: string;
  choices?: ScopeChoices;
  scope?: AgreedScope;
};

export type ScopeTransport = {
  createSession(gameId: string, choices: ScopeChoices): Promise<{ sessionId: string; jobId: string }>;
  getSession(gameId: string, sessionId: string): Promise<ScopeSessionResponse>;
  postText(jobId: string, text: string, attachments?: string[]): Promise<StreamedChatMessage>;
  subscribe(jobId: string, onMessage: (message: StreamedChatMessage) => void): () => void;
};

export const scopeTransport: ScopeTransport = {
  createSession: (gameId, choices) =>
    api(`/games/${encodeURIComponent(gameId)}/scope/sessions`, {
      method: 'POST',
      json: { choices },
    }),
  getSession: (gameId, sessionId) =>
    api(`/games/${encodeURIComponent(gameId)}/scope/sessions/${encodeURIComponent(sessionId)}`),
  postText: (jobId, text, attachments) =>
    api(`/jobs/${encodeURIComponent(jobId)}/chat`, {
      method: 'POST',
      json: { ...(text ? { text } : {}), ...(attachments ? { attachments } : {}) },
    }),
  subscribe: (jobId, onMessage) => subscribeChat(jobId, 0, onMessage),
};
