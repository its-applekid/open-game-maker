import type { CreditsDocument } from '@ogm/contracts/browser';

import { api } from '../../lib/api/client';

export function getCredits(gameId?: string, buildId?: string): Promise<CreditsDocument> {
  if ((gameId === undefined) !== (buildId === undefined)) throw new TypeError('gameId and buildId must be paired');
  const query = gameId === undefined ? '' : `?${new URLSearchParams({ gameId, buildId: buildId as string })}`;
  return api<CreditsDocument>(`/credits${query}`);
}
