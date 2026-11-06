import { describe, expect, it } from 'vitest';

import { DAEMON_LABEL_SUFFIXES, isDaemonLabel, LABELS } from '../src/index.js';

describe('isDaemonLabel', () => {
  it('recognises aiur’s own labels under the default agent prefix and under a game daemon’s slug prefix', () => {
    expect(isDaemonLabel('agent:todo')).toBe(true);
    expect(isDaemonLabel('castle-run:ci-wait')).toBe(true);
    expect(isDaemonLabel('castle-run:blocked')).toBe(true);
    expect(isDaemonLabel('space-castle:paused')).toBe(true);
    expect(isDaemonLabel('Agent: Human Review')).toBe(true);
  });

  it('leaves the labels a game repo carries for other reasons alone', () => {
    for (const label of ['bug', 'complexity:3', 'feature:gm-j_01J', 'source:report', 'flake', 'ci-wait']) {
      expect(isDaemonLabel(label)).toBe(false);
    }
  });

  it('covers every label in the template set under a daemon prefix', () => {
    const prefixed = LABELS.filter((label) => label.name.startsWith('agent:')).map((label) =>
      label.name.replace(/^agent:/, 'castle-run:'),
    );
    expect(prefixed.length).toBeGreaterThan(0);
    for (const label of prefixed) expect(isDaemonLabel(label)).toBe(true);
    expect(DAEMON_LABEL_SUFFIXES).toContain('watch');
  });
});
