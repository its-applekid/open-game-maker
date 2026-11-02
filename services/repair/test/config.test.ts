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
});
