import type { StyleChoice } from './catalog';

export function FamilyStep({
  choices,
  selected,
  onToggle,
}: {
  choices: StyleChoice[];
  selected: string[];
  onToggle(id: string): void;
}) {
  return choices.map((choice) => (
    <button
      className="new-option new-family-option tap-primary"
      type="button"
      aria-pressed={selected.includes(choice.id)}
      onClick={() => onToggle(choice.id)}
      key={choice.id}
    >
      <span className="new-family-previews" aria-hidden={choice.packs.every((pack) => !pack.thumbnailUrl)}>
        {choice.packs
          .filter((pack) => pack.thumbnailUrl)
          .slice(0, 3)
          .map((pack) => (
            <img key={pack.id} src={pack.thumbnailUrl!} alt={`${pack.name} preview`} />
          ))}
      </span>
      <span>{choice.label}</span>
    </button>
  ));
}
