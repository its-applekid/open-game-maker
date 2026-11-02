import type { CSSProperties } from 'react';

import type { GameSummary } from './types';

export function Cover({ game }: { game: GameSummary }) {
  if (game.coverUrl) {
    return <img className="game-cover-image" src={game.coverUrl} alt="" loading="lazy" />;
  }

  const style = { '--game-hue': familyHue(game.familyId) } as CSSProperties;
  return (
    <div className="game-cover-placeholder" style={style} aria-hidden="true">
      <span>{game.title}</span>
    </div>
  );
}

function familyHue(familyId: string | undefined): string {
  let hue = 0;
  for (const char of familyId ?? '') hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return String(hue);
}
