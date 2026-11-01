import { describe, expect, it } from 'vitest';

import { dayKey, nextReset } from '../src/budget/reset.js';

describe('budget reset', () => {
  it('finds the next local midnight across the fall DST transition', () => {
    expect(nextReset(new Date('2026-11-01T06:59:00Z'), 'America/Los_Angeles').toISOString()).toBe(
      '2026-11-01T07:00:00.000Z',
    );
    expect(nextReset(new Date('2026-11-01T08:30:00Z'), 'America/Los_Angeles').toISOString()).toBe(
      '2026-11-02T08:00:00.000Z',
    );
  });

  it('handles UTC and falls back to UTC for an invalid configured zone', () => {
    expect(dayKey(new Date('2026-11-01T23:59:00Z'), 'UTC')).toBe('2026-11-01');
    expect(nextReset(new Date('2026-11-01T23:59:00Z'), 'UTC').toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(nextReset(new Date('2026-11-01T23:59:00Z'), 'not/a-zone').toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });
});
