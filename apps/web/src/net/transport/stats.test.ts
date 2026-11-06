import { describe, expect, it } from 'vitest';

import { JitterEstimator, LossEstimator, RttEstimator, WindowedStats } from './stats';

/**
 * The estimator table of the #498 research (§7.2). Each case states the guard it holds: what breaks if the production
 * change is reverted.
 */
describe('transport statistics', () => {
  it('reports the minimum recent round trip, not the mean', () => {
    const rtt = new RttEstimator(10);
    for (const sample of [120, 90, 60, 65, 61, 64, 62, 63]) rtt.add(sample);
    // A mean filter would report 73 here; a queue or a retransmit only ever adds delay, so the minimum is the path.
    expect(rtt.ms).toBe(60);
  });

  it('keeps the last round trip after the comparison ring wraps', () => {
    const rtt = new RttEstimator(2);
    rtt.add(30);
    rtt.add(90);
    rtt.add(110);
    expect(rtt.ms).toBe(90);
    expect(rtt.count).toBe(2);
  });

  it('reports jitter as the mean absolute successive difference of the round trip samples', () => {
    const jitter = new JitterEstimator();
    // |Δ| over 50 → 50 → 90 → 50 → 50 is 0, 40, 40, 0.
    for (const sample of [50, 50, 90, 50, 50]) jitter.add(sample);
    expect(jitter.ms).toBe(20);
    // A four-sample list has three successive differences, not four: 0, 40, 40.
    const shorter = new JitterEstimator();
    for (const sample of [50, 50, 90, 50]) shorter.add(sample);
    expect(shorter.ms).toBeCloseTo(80 / 3, 5);
  });

  it('reports a transport that dropped nothing as 0 % jitter', () => {
    expect(new JitterEstimator().ms).toBe(0);
    expect(new RttEstimator().ms).toBe(0);
    expect(new LossEstimator().pct).toBe(0);
  });

  it('measures loss from gaps in the sequence a sender stamped', () => {
    const loss = new LossEstimator(5_000);
    for (let seq = 1; seq <= 100; seq += 1) {
      if (seq === 7 || seq === 42 || seq === 43) continue;
      loss.observe(seq, 1_000 + seq * 10);
    }
    expect(loss.pct).toBe(3);
  });

  it('keeps its last figure while the link is silent and starts a new window on the next frame', () => {
    const loss = new LossEstimator(5_000);
    loss.observe(1, 0);
    loss.observe(3, 10);
    expect(loss.pct).toBeCloseTo(33.33, 2);
    // No traffic for the whole next window: nothing rolls the estimator, so it keeps reporting the last figure.
    expect(loss.pct).toBeCloseTo(33.33, 2);
    loss.observe(9, 6_000);
    loss.observe(10, 6_010);
    expect(loss.pct).toBe(0);
  });

  it('gives a windowed median so a single spike does not move a pair', () => {
    const window = new WindowedStats(5_000);
    window.observe(40, 0);
    window.observe(41, 1_000);
    window.observe(400, 2_000);
    window.observe(42, 3_000);
    window.observe(43, 4_000);
    // A mean would be 113; the median ignores the one 400 ms spike.
    expect(window.p50).toBe(42);
  });

  it('reports how long the windowed median has been above a bound', () => {
    const window = new WindowedStats(5_000);
    window.observe(50, 0);
    expect(window.msAbove(200, 0)).toBe(0);
    // Two samples: the median is 175, still under the bound.
    window.observe(300, 1_000);
    expect(window.msAbove(200, 1_000)).toBe(0);
    window.observe(300, 2_000);
    expect(window.msAbove(200, 2_000)).toBe(0);
    expect(window.msAbove(200, 4_000)).toBe(2_000);
    window.observe(50, 4_500);
    expect(window.msAbove(200, 4_500)).toBe(0);
  });

  it('keeps its last value when a window sees no traffic at all', () => {
    const window = new WindowedStats(5_000);
    window.observe(120, 0);
    expect(window.p50).toBe(120);
    expect(window.msAbove(200, 60_000)).toBe(0);
    expect(window.p50).toBe(120);
  });
});
