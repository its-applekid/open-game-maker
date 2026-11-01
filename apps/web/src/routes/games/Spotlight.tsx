import type { Branch } from './types';
import { gameTags, type GameSummary, type JobView } from './types';
import { jobLabel } from './Tile';

type SpotlightProps = {
  game: GameSummary;
  branches: Branch[];
  job?: JobView;
  onPlay(branchId: string): void;
  onEdit(branchId: string): void;
  onClose(): void;
};

export function Spotlight({ game, branches, job, onPlay, onEdit, onClose }: SpotlightProps) {
  const activeBranch = branches.find((branch) => branch.name === 'main') ?? branches[0];
  const canOpen = Boolean(activeBranch?.latestBuildId) && job?.kind !== 'new_game';
  const tags = gameTags(game);

  return (
    <section className="games-spotlight" aria-live="polite" aria-label={`${game.title} spotlight`}>
      <div className="games-spotlight-copy">
        <p className="games-eyebrow">Selected game</p>
        <h1>{game.title}</h1>
        {game.tagline && <p className="games-tagline">{game.tagline}</p>}
        {tags.length > 0 && (
          <ul className="games-tags" aria-label="Tags">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        {job && <p className="games-spotlight-job">{jobLabel(job)}</p>}
      </div>
      <div className="games-versions">
        <span>Versions</span>
        <ul>
          {branches.map((branch) => (
            <li
              key={branch.id}
              aria-label={branch.name}
              aria-current={branch.id === activeBranch?.id ? 'true' : undefined}
            >
              {branch.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="games-spotlight-actions">
        <button
          type="button"
          className="tap-primary games-play"
          disabled={!canOpen}
          aria-label={`Play ${game.title}`}
          onClick={() => activeBranch && onPlay(activeBranch.id)}
        >
          Play
        </button>
        <button
          type="button"
          className="tap-primary games-edit"
          disabled={!canOpen}
          aria-label={`Edit ${game.title}`}
          onClick={() => activeBranch && onEdit(activeBranch.id)}
        >
          Edit
        </button>
        <button
          type="button"
          className="tap-secondary games-close"
          aria-label={`Close ${game.title}`}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </section>
  );
}
