import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api/client';
import type { GameSummary } from './types';

type GamesResponse = GameSummary[] | { games: GameSummary[] };

export function useGames() {
  return useQuery({
    queryKey: ['games'],
    queryFn: async () => unwrapGames(await api<GamesResponse>('/games')),
  });
}

export function unwrapGames(response: GamesResponse): GameSummary[] {
  return Array.isArray(response) ? response : response.games;
}
