import type { FamilyBudgetSettings } from '@ogm/contracts';

type UnitSettings = Pick<FamilyBudgetSettings, 'unitLabel' | 'microUsdPerUnit'>;

// The family's friendly unit (D-BUDGET-UNIT): one decimal, never dollars.
export function toUnits(microUsd: number, settings: UnitSettings): { units: number; label: string } {
  return { units: Math.round((microUsd / settings.microUsdPerUnit) * 10) / 10, label: settings.unitLabel };
}
