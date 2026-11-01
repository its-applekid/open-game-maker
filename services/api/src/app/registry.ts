import type { Context } from 'hono';

import type { Principal } from '@ogm/contracts';

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

// Seams filled by later contexts from their `setup(deps)`: OGM-011 adds the session resolver,
// OGM-012 sets the game resolver, OGM-013 the ticket job resolver.
export interface Registry {
  principalResolvers: Resolver[];
  gameResolver: GameResolver | null;
  ticketJobResolver: TicketJobResolver | null;
}

export function createRegistry(): Registry {
  return { principalResolvers: [], gameResolver: null, ticketJobResolver: null };
}

// `null` until a game resolver is registered; callers answer 403 `game_unresolved`.
export async function resolveGame(registry: Registry, gameId: string): Promise<GameInfo | null> {
  return registry.gameResolver ? registry.gameResolver(gameId) : null;
}
