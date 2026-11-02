import { useEffect, useState } from 'react';

import type { GameManifest } from '@ogm/contracts';

import { FocusZone } from '../../lib/input';
import { EDITOR_FOCUS_ZONES } from './focus';

type PaletteProps = {
  palette: GameManifest['palette'];
  category?: string;
  onCategory?(id: string): void;
  onPick(prefab: string): void;
};

export function Palette({ palette, category, onCategory, onPick }: PaletteProps) {
  const [localCategory, setLocalCategory] = useState(palette.categories[0]?.id ?? '');
  const active = category ?? localCategory;
  useEffect(() => {
    if (!palette.categories.some((candidate) => candidate.id === active)) {
      setLocalCategory(palette.categories[0]?.id ?? '');
    }
  }, [active, palette.categories]);
  const chooseCategory = (id: string) => {
    setLocalCategory(id);
    onCategory?.(id);
  };

  return (
    <FocusZone id={EDITOR_FOCUS_ZONES.palette} className="editor-palette">
      <div className="palette-tabs" role="tablist" aria-label="Palette">
        {palette.categories.map((candidate) => (
          <button
            className="tap-secondary"
            type="button"
            role="tab"
            key={candidate.id}
            aria-selected={candidate.id === active}
            onClick={() => chooseCategory(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="palette-items">
        {palette.items
          .filter((item) => item.category === active)
          .map((item) => (
            <button
              className="palette-item tap-primary"
              type="button"
              key={item.prefab}
              title={item.hint}
              onPointerDown={() => onPick(item.prefab)}
              onClick={() => onPick(item.prefab)}
            >
              {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
              <span>{item.label}</span>
            </button>
          ))}
      </div>
    </FocusZone>
  );
}
