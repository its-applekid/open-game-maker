import type { GameManifest } from '@ogm/contracts/browser';

import { FocusZone } from '../../lib/input';
import { EDITOR_FOCUS_ZONES } from './focus';

type Category = GameManifest['palette']['categories'][number];

export function Rail({
  categories,
  active,
  onChange,
}: {
  categories: Category[];
  active?: string;
  onChange(id: string): void;
}) {
  return (
    <FocusZone id={EDITOR_FOCUS_ZONES.rail} className="editor-rail">
      {categories.map((category) => (
        <button
          className="tap-secondary"
          type="button"
          key={category.id}
          aria-pressed={category.id === active}
          aria-label={category.label}
          onClick={() => onChange(category.id)}
        >
          {category.label.slice(0, 1)}
        </button>
      ))}
    </FocusZone>
  );
}
