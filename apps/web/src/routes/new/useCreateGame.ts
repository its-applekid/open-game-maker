import { useCallback, useRef } from 'react';

import { api } from '../../lib/api/client';
import { getRepoVisibilityDefault } from '../../lib/api/auth';
import { choiceLabels, type NewGameChoices } from './options';

type GameResponse = { id: string };

export function useCreateGame() {
  const game = useRef<Promise<string> | undefined>(undefined);
  return useCallback((choices: NewGameChoices, requiresPrivate = false) => {
    if (game.current) return game.current;
    const titleParts = [
      choiceLabels('vibe', choices.vibe).at(0),
      choiceLabels('genre', choices.genre).at(0),
    ].filter((part): part is string => Boolean(part));
    game.current = api<GameResponse>('/games', {
      method: 'POST',
      json: {
        title: titleParts.join(' ') || 'New game',
        repoVisibility: requiresPrivate ? 'private' : getRepoVisibilityDefault(),
      },
    })
      .then(({ id }) => id)
      .catch((error: unknown) => {
        game.current = undefined;
        throw error;
      });
    return game.current;
  }, []);
}
