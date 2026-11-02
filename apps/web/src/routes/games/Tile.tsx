import { Icon } from '../../components/Icon';
import { Cover } from './Cover';
import { gameTags, type GameSummary, type JobView } from './types';

type TileProps = {
  game: GameSummary;
  job?: JobView;
  selected: boolean;
  tabIndex: number;
  onClick(): void;
  onFocus(): void;
};

export function Tile({ game, job, selected, tabIndex, onClick, onFocus }: TileProps) {
  const tags = gameTags(game).slice(0, 4);
  const label = game.tagline ? `${game.title}: ${game.tagline}` : game.title;

  return (
    <button
      type="button"
      className="game-tile"
      aria-label={label}
      aria-pressed={selected}
      tabIndex={tabIndex}
      onClick={onClick}
      onFocus={onFocus}
    >
      <span className="game-cover">
        <Cover game={game} />
        {job && <span className="game-building-chip">{jobLabel(job)}</span>}
        {!game.publishedReleaseId && <span className="game-new-badge">New</span>}
      </span>
      <span className="game-tile-meta">
        <strong>{game.title}</strong>
        {tags.length > 0 && (
          <span className="game-tag-icons" aria-label={tags.join(', ')}>
            {tags.map((tag) => (
              <Icon key={tag} name={tag} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

export function jobLabel(job: JobView): string {
  const words = job.friendlyState ?? job.stageText ?? job.state.replaceAll('_', ' ');
  return job.progressPercent == null ? words : `${words} ${job.progressPercent}%`;
}
