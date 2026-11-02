import { Icon } from '../../components/Icon';

const ICON_ALIASES: Record<string, string> = {
  space: 'spaceW',
  single: 'solo',
  multi: 'party',
  fixed: 'strategy',
  follow: 'racing',
  fps: 'shooter',
  orbit: 'spaceW',
  side: 'platformer',
  topdown: 'strategy',
};

export function OptionTile({
  id,
  label,
  pressed,
  onToggle,
}: {
  id: string;
  label: string;
  pressed: boolean;
  onToggle(): void;
}) {
  return (
    <button className="new-option tap-primary" type="button" aria-pressed={pressed} onClick={onToggle}>
      <Icon name={ICON_ALIASES[id] ?? id} className="new-option-icon" />
      <span>{label}</span>
    </button>
  );
}
