import { describe, expect, it } from 'vitest';

import { projectStage, type ProjectionInput } from '../../src/jobs/projection.js';

const running = { ogmState: 'running' } as const;

// The T02 §4 job state projection, row by row: these are the words the creator reads (R27).
const rows: [string, ProjectionInput, string, string][] = [
  ['lifecycle queued', { ...running, lifecycle: 'queued' }, 'waiting_capacity', 'Waiting for robot capacity'],
  ['lifecycle waiting', { ...running, lifecycle: 'waiting' }, 'waiting_capacity', 'Waiting for robot capacity'],
  ['lifecycle retrying', { ...running, lifecycle: 'retrying' }, 'waiting_capacity', 'Waiting for robot capacity'],
  [
    'provider limited (paused-usage-limit)',
    { ...running, trackerState: 'in-progress', reasonLabels: ['paused-usage-limit'], lifecycle: 'running' },
    'waiting_provider',
    'Waiting for robot capacity',
  ],
  ['lifecycle running', { ...running, lifecycle: 'running' }, 'building', 'Building'],
  ['lifecycle allocated', { ...running, lifecycle: 'allocated' }, 'building', 'Building'],
  ['tracker in-progress alone', { ...running, trackerState: 'in-progress' }, 'building', 'Building'],
  [
    'tracker ci-wait',
    { ...running, trackerState: 'ci-wait', lifecycle: 'running' },
    'final_tests',
    'Running final tests',
  ],
  ['tracker rework', { ...running, trackerState: 'rework', lifecycle: 'running' }, 'fixing', 'Fixing a problem'],
  ['tracker human-review', { ...running, trackerState: 'human-review' }, 'ready', 'Ready to try'],
  ['tracker budget-exhausted', { ...running, trackerState: 'budget-exhausted' }, 'out_of_budget', 'Out of budget'],
  ['tracker error', { ...running, trackerState: 'error' }, 'failed', 'Something went wrong'],
  ['tracker cancelled', { ...running, trackerState: 'cancelled' }, 'cancelled', 'Stopped'],
  ['lifecycle cancelled', { ...running, lifecycle: 'cancelled' }, 'cancelled', 'Stopped'],
  [
    'paused-decision',
    { ...running, trackerState: 'in-progress', reasonLabels: ['paused-decision'], lifecycle: 'paused' },
    'paused',
    'Waiting for your answer',
  ],
  ['paused-agent', { ...running, trackerState: 'in-progress', reasonLabels: ['paused-agent'] }, 'paused', 'Paused'],
  ['tracker merging', { ...running, trackerState: 'merging' }, 'done', 'Done'],
  ['tracker done', { ...running, trackerState: 'done' }, 'done', 'Done'],
  ['merged PR', { ...running, prMerged: true, trackerState: 'human-review' }, 'done', 'Done'],
  ['OGM queued', { ogmState: 'queued', lifecycle: 'running' }, 'queued_ogm', 'Waiting for a free slot'],
  ['OGM paused for budget', { ogmState: 'paused_budget', lifecycle: 'running' }, 'out_of_budget', 'Out of budget'],
];

describe('projectStage', () => {
  it.each(rows)('%s', (_name, input, stage, text) => {
    expect(projectStage(input)).toEqual({ stage, text });
  });

  it.each([
    ['done', 'done', 'Done'],
    ['failed', 'failed', 'Something went wrong'],
    ['cancelled', 'cancelled', 'Stopped'],
  ] as const)('OGM %s wins over every aiur signal', (ogmState, stage, text) => {
    expect(
      projectStage({
        ogmState,
        lifecycle: 'running',
        trackerState: 'ci-wait',
        spendCapReached: true,
        reasonLabels: ['paused-decision'],
      }),
    ).toEqual({ stage, text });
  });

  it('the spend cap wins over the tracker label and lifecycle', () => {
    expect(projectStage({ ...running, spendCapReached: true, trackerState: 'ci-wait', lifecycle: 'running' })).toEqual({
      stage: 'out_of_budget',
      text: 'Out of budget',
    });
  });

  it('a decisive tracker label wins over lifecycle', () => {
    expect(projectStage({ ...running, trackerState: 'human-review', lifecycle: 'running' }).stage).toBe('ready');
  });

  it('keeps the previous stage and text for an unknown combination, never "failed"', () => {
    const previous = { stage: 'final_tests', text: 'Running final tests' } as const;
    expect(projectStage({ ...running, trackerState: 'something-new', previous })).toEqual(previous);
    expect(projectStage({ ...running, previous })).toEqual(previous);
    expect(projectStage({ ...running, trackerState: 'constructor', lifecycle: 'toString' as never, previous })).toEqual(
      previous,
    );
  });

  it('with no signal and no previous stage, waits for capacity', () => {
    expect(projectStage({ ...running })).toEqual({ stage: 'waiting_capacity', text: 'Waiting for robot capacity' });
  });
});
