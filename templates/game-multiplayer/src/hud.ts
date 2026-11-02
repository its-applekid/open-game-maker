import type { HudModel } from '@ogm/contracts';

import type { PlayerState } from './state.js';

/** One player's HUD, read only from that player's entry. Each client draws `hud(localPlayerIndex)`. */
export function hud(players: ReadonlyMap<number, PlayerState>, playerIndex: number): HudModel {
  const player = players.get(playerIndex);
  return { player: playerIndex + 1, onGround: player?.onGround ?? false };
}
