import type { BuildChatMessage } from '@ogm/contracts';

import './checkpoint-card.css';

type Budget = { used: number; max: 1 | 3 };

export type CheckpointCardProps = {
  message: BuildChatMessage;
  mediaById?: (id: string) => BuildChatMessage | undefined;
  budget?: Budget;
  onAnswer: (optionId: string) => void;
};

type Option = NonNullable<BuildChatMessage['checkpoint']>['options'][number];

function OptionContents({
  option,
  recommended,
  mediaById,
}: {
  option: Option;
  recommended: boolean;
  mediaById?: CheckpointCardProps['mediaById'];
}) {
  const media = option.media_id === undefined ? undefined : mediaById?.(option.media_id)?.media;
  return (
    <>
      {media && (
        <span className="checkpoint-option-media" aria-hidden="true">
          {media.duration_ms === undefined ? (
            <img alt="" src={media.url} />
          ) : (
            <video muted playsInline poster={media.poster} preload="metadata" src={media.url} />
          )}
        </span>
      )}
      <span className="checkpoint-option-label">{option.label}</span>
      {recommended && <span className="checkpoint-recommended">Builder&apos;s pick</span>}
    </>
  );
}

export function CheckpointCard({ message, mediaById, budget, onAnswer }: CheckpointCardProps) {
  const checkpoint = message.checkpoint;
  if (!checkpoint) return null;
  const options = [...checkpoint.options].sort(
    (left, right) => Number(right.id === checkpoint.recommend) - Number(left.id === checkpoint.recommend),
  );
  const linked = checkpoint.decision_id !== '';
  const showOptions = checkpoint.status !== 'moot';

  return (
    <article className={`checkpoint-card checkpoint-${checkpoint.status}`} aria-labelledby={`checkpoint-${message.id}`}>
      <h3 id={`checkpoint-${message.id}`}>{checkpoint.question}</h3>
      {checkpoint.blocking && checkpoint.status === 'open' && (
        <p className="checkpoint-note">The builder is waiting on this</p>
      )}
      {checkpoint.status === 'moot' && <p className="checkpoint-state">No longer needed</p>}
      {checkpoint.status === 'open' && !linked && <p className="checkpoint-state">Waiting for the builder to ask</p>}
      {showOptions && (
        <div className="checkpoint-options">
          {options.map((option) => {
            const recommended = option.id === checkpoint.recommend;
            if (checkpoint.status === 'open' && !linked) {
              return (
                <div className="checkpoint-option" key={option.id} style={{ minHeight: '64px' }}>
                  <OptionContents option={option} recommended={recommended} mediaById={mediaById} />
                </div>
              );
            }
            const selected = checkpoint.status === 'answered' && option.id === checkpoint.option_id;
            return (
              <button
                aria-label={option.label}
                aria-pressed={selected}
                className="checkpoint-option"
                disabled={checkpoint.status !== 'open'}
                key={option.id}
                onClick={() => onAnswer(option.id)}
                style={{ minHeight: '64px' }}
                type="button"
              >
                <OptionContents option={option} recommended={recommended} mediaById={mediaById} />
              </button>
            );
          })}
        </div>
      )}
      {budget && (
        <p className="checkpoint-budget">
          Checkpoint {budget.used} of {budget.max}
        </p>
      )}
    </article>
  );
}
