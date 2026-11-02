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

  it('places and splits activities across every work interval', () => {
    const result = layoutTimeline(
      {
        phases: [
          { phase: 'dispatch', at: '2026-11-01T00:00:00.000Z' },
          { phase: 'work', at: '2026-11-01T00:00:02.000Z' },
          { phase: 'review', at: '2026-11-01T00:00:12.000Z' },
          { phase: 'work', at: '2026-11-01T00:00:20.000Z' },
          { phase: 'review', at: '2026-11-01T00:00:50.000Z' },
          { phase: 'done', at: '2026-11-01T00:01:00.000Z' },
        ],
        activities: [
          {
            activity: 'audio',
            startedAt: '2026-11-01T00:00:25.000Z',
            endedAt: '2026-11-01T00:00:35.000Z',
          },
          {
            activity: 'playtesting',
            startedAt: '2026-11-01T00:00:05.000Z',
            endedAt: '2026-11-01T00:00:35.000Z',
          },
        ],
        generatedAt: '2026-11-01T00:01:00.000Z',
      },
      600,
    );

    expect(result.activities.filter(({ label }) => label === 'Audio')).toEqual([
      expect.objectContaining({ x: 250, width: 100 }),
    ]);
    expect(result.activities.filter(({ label }) => label === 'Playtesting')).toEqual([
      expect.objectContaining({ x: 50, width: 70 }),
      expect.objectContaining({ x: 200, width: 150 }),
    ]);
    const workSegments = result.phases.filter(({ label }) => label === 'work');
    expect(
      result.activities.every(({ x, width }) =>
        workSegments.some((work) => x >= work.x && x + width <= work.x + work.width),
      ),
    ).toBe(true);
  });
});
