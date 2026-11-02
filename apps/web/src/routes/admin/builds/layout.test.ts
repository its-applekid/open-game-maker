import { describe, expect, it } from 'vitest';

import { layoutTimeline } from './layout';

const fixture = {
  phases: [
    { phase: 'dispatch', at: '2026-11-01T00:00:00.000Z' },
    { phase: 'implement', at: '2026-11-01T00:00:02.000Z' },
    { phase: 'build_test', at: '2026-11-01T00:01:02.000Z' },
    { phase: 'done', at: '2026-11-01T00:01:10.000Z' },
  ],
  activities: [
    {
      activity: 'playtesting',
      startedAt: '2026-11-01T00:00:10.000Z',
      endedAt: '2026-11-01T00:00:20.000Z',
    },
    {
      activity: 'audio',
      startedAt: '2026-11-01T00:00:55.000Z',
      endedAt: null,
    },
  ],
  generatedAt: '2026-11-01T00:01:10.000Z',
};

describe('timeline layout', () => {
  it('sizes phases proportionally and nests activities inside implementation', () => {
    const result = layoutTimeline(fixture, 700);

    expect(result.phases.slice(0, 3).map(({ width }) => width)).toEqual([20, 600, 80]);
    const implement = result.phases[1]!;
    expect(
      result.activities.every(({ x, width }) => x >= implement.x && x + width <= implement.x + implement.width),
    ).toBe(true);
  });

  it('marks an unmatched activity open and closes it at the implementation boundary', () => {
    const result = layoutTimeline(fixture, 700);
    const open = result.activities.find(({ label }) => label === 'Audio');

    expect(open).toMatchObject({ open: true });
    expect(open!.x + open!.width).toBeLessThanOrEqual(result.phases[1]!.x + result.phases[1]!.width);
  });
});
