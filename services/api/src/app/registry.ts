import type { Context } from 'hono';

import type { Principal } from '@ogm/contracts';

import type { ApiBindings } from './types.js';

export type Resolver = (c: Context<ApiBindings>) => Promise<Principal | null>;
export type GameInfo = { familyId: string; ownerId: string; visibility: string };
export type GameResolver = (gameId: string) => Promise<GameInfo | null>;

// Seams filled by later contexts from their `setup(deps)`: OGM-011 adds the session resolver,
// OGM-012 sets the game resolver.
export interface Registry {
  principalResolvers: Resolver[];
  gameResolver: GameResolver | null;
}

export function createRegistry(): Registry {
  return { principalResolvers: [], gameResolver: null };
}

// `null` until a game resolver is registered; callers answer 403 `game_unresolved`.
export async function resolveGame(registry: Registry, gameId: string): Promise<GameInfo | null> {
  return registry.gameResolver ? registry.gameResolver(gameId) : null;
}
