import type { Context } from 'hono';

import type { AiurClient } from '@ogm/aiur-client';
import type { JobState, Principal } from '@ogm/contracts';

import type { ApiBindings } from './types.js';

export type Resolver = (c: Context<ApiBindings>) => Promise<Principal | null>;
export type GameInfo = { familyId: string; ownerId: string; visibility: string };
export type GameResolver = (gameId: string) => Promise<GameInfo | null>;
// The job filed as issue `identifier` in game repo `repo`, with what its after_create bundle needs (OGM-036).
export type TicketJob = {
  jobId: string;
  gameId: string;
  repo: string;
  kind: 'new_game' | 'feature' | 'repair';
  game: { title: string; family: string; pov: string; genre: string; multiplayer: boolean };
  diagnostics?: { reportId: string; bundleKey: string };
};
export type TicketJobResolver = (repo: string, identifier: string) => Promise<TicketJob | null>;
export type RepoProvisioner = {
  provision(game: {
    id: string;
    title: string;
    owner: { login: string; installationId: string };
    visibility: 'public' | 'private';
  }): Promise<{ owner: string; repo: string; url: string }>;
};
export type MailSender = {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
};
// What the build chat needs about a job (OGM-013 owns the jobs table and registers the directory).
// `aiur` is null until the job is filed as an issue on a game daemon.
export type ChatJob = {
  jobId: string;
  gameId: string;
  familyId: string;
  ownerId: string;
  state: JobState;
  aiur: { daemonSlug: string; ticket: string } | null;
};
export interface ChatJobDirectory {
  get(jobId: string): Promise<ChatJob | null>;
  // Jobs in `filed`, `running` or `paused_budget` with a ticket: the ones the progress poller reads.
  active(): Promise<ChatJob[]>;
}
export type AiurClientResolver = (
  daemonSlug: string,
) => Pick<AiurClient, 'message' | 'progress'> | null | Promise<Pick<AiurClient, 'message' | 'progress'> | null>;
export type UserDirectory = {
  emailForUser(userId: string): Promise<string | null>;
  userIdForEmail(email: string): Promise<string | null>;
};
export interface IssueStateWriter {
  setStateLabel(repo: string, issue: number, state: 'cancelled'): Promise<void>;
}

// Seams filled by contexts from `setup(deps)`: auth adds session, user-directory and mail
// providers; accounts/games add repository provisioning and game lookup; jobs adds the ticket/chat directories;
// the daemon directory adds per-daemon aiur clients.
export interface Registry {
  principalResolvers: Resolver[];
  gameResolver: GameResolver | null;
  repoProvisioner: RepoProvisioner | null;
  mailSender: MailSender | null;
  userDirectory: UserDirectory | null;
  ticketJobResolver: TicketJobResolver | null;
  chatJobs: ChatJobDirectory | null;
  aiurClientFor: AiurClientResolver | null;
  issueStateWriter: IssueStateWriter | null;
}

export function createRegistry(): Registry {
  return {
    principalResolvers: [],
    gameResolver: null,
    repoProvisioner: null,
    mailSender: null,
    userDirectory: null,
    ticketJobResolver: null,
    chatJobs: null,
    aiurClientFor: null,
    issueStateWriter: null,
  };
}

// `null` until a game resolver is registered; callers answer 403 `game_unresolved`.
export async function resolveGame(registry: Registry, gameId: string): Promise<GameInfo | null> {
  return registry.gameResolver ? registry.gameResolver(gameId) : null;
}
