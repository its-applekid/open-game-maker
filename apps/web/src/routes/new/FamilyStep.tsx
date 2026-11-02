import { Icon } from '../../components/Icon';
import type { PickerFamily } from './catalog';

const FAMILY_ICONS: Record<string, string> = {
  'chunky-low-poly': 'lowpoly',
  'pixel-art': 'bit16',
  'flat-cartoon': 'cartoon',
  'isometric-2d': 'iso',
  sketch: 'sketch',
};

export function FamilyStep({ families, onOpen }: { families: PickerFamily[]; onOpen(id: string): void }) {
  return families.map((family) => (
    <button
      className="new-option tap-primary"
      type="button"
      data-style-family={family.id}
      onClick={() => onOpen(family.id)}
      key={family.id}
    >
      <Icon name={FAMILY_ICONS[family.id] ?? 'other'} className="new-option-icon" />
      <span>{family.label}</span>
    </button>
  ));
}
