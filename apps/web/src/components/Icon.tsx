import { ICONS } from '../icons';

// The SVG comes only from the constant ICONS table, never from user input.
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}
