import { useQuery } from '@tanstack/react-query';

import type { GameCommand, GameCommandsPage } from '@ogm/contracts';

import { queryClient } from '../../app/query';
import { api } from '../../lib/api/client';
import { answerCheckpoint } from '../build-chat/checkpoints';

// The game's open aiur Commands (M3). Polling matches the build list: a Command opened by a running agent shows up
// without a reload.
const POLL_MS = 30_000;
const EMPTY: GameCommand[] = [];

export const gameCommandsQueryKey = (gameId: string) => ['game-commands', gameId] as const;

export function useGameCommands(gameId: string | null | undefined) {
  const query = useQuery({
    queryKey: gameCommandsQueryKey(gameId ?? ''),
    enabled: Boolean(gameId),
    queryFn: () => api<GameCommandsPage>(`/games/${encodeURIComponent(gameId!)}/commands`),
    refetchInterval: POLL_MS,
    retry: false,
  });
  return { ...query, commands: query.data?.commands ?? EMPTY };
}

export async function answerCommand(gameId: string, command: GameCommand, optionId: string): Promise<void> {
  await answerCheckpoint(command.job_id, command.checkpoint_id, optionId);
  await queryClient.invalidateQueries({ queryKey: gameCommandsQueryKey(gameId) });
}
