import { describe, expect, it } from 'vitest';

import { requireAdmin } from './guard';

describe('admin guard', () => {
  it.each(['admin', 'maintainer'] as const)('admits %s sessions', (platformRole) => {
    expect(requireAdmin({ platformRole })).toBe('ok');
  });

  it('redirects ordinary and missing sessions', () => {
    expect(requireAdmin({ platformRole: 'none' })).toBe('redirect');
    expect(requireAdmin(null)).toBe('redirect');
  });
});
