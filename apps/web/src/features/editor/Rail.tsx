import type { GameManifest } from '@ogm/contracts/browser';

import { FocusZone } from '../../lib/input';
import { EDITOR_FOCUS_ZONES } from './focus';

type Category = GameManifest['palette']['categories'][number];
type Item = GameManifest['palette']['items'][number];

export function Rail({
  categories,
  items = [],
  active,
  onChange,
}: {
  categories: Category[];
  items?: Item[];
  active?: string;
  onChange(id: string): void;
}) {
  return (
    <FocusZone id={EDITOR_FOCUS_ZONES.rail} className="editor-rail">
      {categories.map((category) => {
        const thumbnail = items.find((item) => item.category === category.id)?.thumbnail;
        return (
          <button
            className="tap-secondary"
            type="button"
            key={category.id}
            aria-pressed={category.id === active}
            aria-label={category.label}
            onClick={() => onChange(category.id)}
          >
            {thumbnail ? (
              <img src={thumbnail} alt="" />
            ) : (
              <span className="rail-letter" aria-hidden="true">
                {category.label.slice(0, 1)}
              </span>
            )}
            <span>{category.label}</span>
          </button>
        );
      })}
    </FocusZone>
  );
}
