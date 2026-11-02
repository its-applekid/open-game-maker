import type { ComponentType } from 'react';

export type GameExtraProps = {
  gameId: string;
  branchId: string;
  mode: 'play' | 'edit';
};

export type GameExtra = {
  id: string;
  placement: 'topbar' | 'hud' | 'overlay';
  Component: ComponentType<GameExtraProps>;
};

/** Additive seam owned by OGM-077 and OGM-078. */
export const gameExtras: GameExtra[] = [];
