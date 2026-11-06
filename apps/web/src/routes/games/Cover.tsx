import type { GameSummary } from './types';

type CoverGame = Pick<GameSummary, 'title' | 'coverUrl'>;

export function Cover({ game }: { game: CoverGame }) {
  if (game.coverUrl) {
    return <img className="game-cover-image" src={game.coverUrl} alt="" loading="lazy" />;
  }

  return (
    <div className="game-cover-placeholder" aria-hidden="true">
      <span>{game.title}</span>
    </div>
  );
}
