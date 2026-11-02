import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_REPAIR_CONFIG, loadRepairConfig } from '../src/config.js';

describe('repair config', () => {
  it('loads the shipped single source of repair limits', () => {
    expect(loadRepairConfig(join(import.meta.dirname, '..', 'repair.config.json'))).toEqual(DEFAULT_REPAIR_CONFIG);
  });

  it('warns without exposing a path and uses documented defaults when absent', () => {
    const warn = vi.fn();

    expect(loadRepairConfig(join(import.meta.dirname, 'missing.json'), warn)).toEqual(DEFAULT_REPAIR_CONFIG);
    expect(warn).toHaveBeenCalledWith('repair config missing; using documented defaults');
  });

  it('accepts measured policy values without a code change', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'repair-config-')), 'repair.config.json');
    writeFileSync(path, JSON.stringify({ attempts: 3, reservationFraction: 0.25, wallClockMinutes: 12, pollMs: 7000 }));

    expect(loadRepairConfig(path)).toEqual({
      attempts: 3,
      reservationFraction: 0.25,
      wallClockMinutes: 12,
      pollMs: 7000,
    });
  });
});
