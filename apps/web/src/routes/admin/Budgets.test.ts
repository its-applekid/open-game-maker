import { describe, expect, it } from 'vitest';

import { buildSettingsPatch, formatEditableUnits, parseSlot, parseUnits } from './Budgets';

describe('admin budget unit conversion', () => {
  it('converts friendly units to micro-dollars without drift', () => {
    expect(parseUnits('2.5', 1_000_000)).toBe(2_500_000);
    expect(parseUnits(formatEditableUnits(2_500_000, 1_000_000), 1_000_000)).toBe(2_500_000);
    expect(parseUnits(formatEditableUnits(255_000, 100_000), 100_000)).toBe(255_000);
  });

  it('rejects negative, blank, and fractional micro-dollar values', () => {
    expect(parseUnits('-1', 1_000_000)).toBeNull();
    expect(parseUnits('', 1_000_000)).toBeNull();
    expect(parseUnits('0.0000001', 1_000_000)).toBeNull();
  });

  it('requires an explicit zero for concurrency slots', () => {
    expect(parseSlot('')).toBeNull();
    expect(parseSlot('   ')).toBeNull();
    expect(parseSlot('0')).toBe(0);
  });

  it('omits an unchanged allowance-derived platform cap', () => {
    const patch = buildSettingsPatch({
      resetZone: 'UTC',
      cap: '2.55',
      capDirty: false,
      microUsdPerUnit: 100_000,
      newSlots: '2',
      editSlots: '1',
    });

    expect(patch).toEqual({ resetZone: 'UTC', slots: { new_game: 2, edit: 1 } });
    expect(patch).not.toHaveProperty('platformCapMicroUsd');
  });

  it('sends an explicitly edited platform cap', () => {
    expect(
      buildSettingsPatch({
        resetZone: 'UTC',
        cap: '2.55',
        capDirty: true,
        microUsdPerUnit: 100_000,
        newSlots: '2',
        editSlots: '1',
      }),
    ).toEqual({ resetZone: 'UTC', platformCapMicroUsd: 255_000, slots: { new_game: 2, edit: 1 } });
  });
});
