import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiagnosticsOverlay } from './DiagnosticsOverlay';
import { useNetMetrics } from './useNetMetrics';

const reply = {
  calls: 1,
  net: { mode: 'per-seat', tick: 12, desyncs: 0, localResponseMs: 16.7, eventDelayP95Ms: 20, droppedBytes: 0 },
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DiagnosticsOverlay', () => {
  it('renders nothing and asks for nothing in a published build', () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => reply);

    const { container } = render(<DiagnosticsOverlay enabled build="published" read={read} room={() => ({})} />);
    act(() => void vi.advanceTimersByTime(5_000));

    expect(container).toBeEmptyDOMElement();
    expect(read).not.toHaveBeenCalled();
  });

  it('renders nothing and asks for nothing when the flag is off', () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => reply);

    const { container } = render(<DiagnosticsOverlay enabled={false} build="draft" read={read} room={() => ({})} />);
    act(() => void vi.advanceTimersByTime(5_000));

    expect(container).toBeEmptyDOMElement();
    expect(read).not.toHaveBeenCalled();
  });

  it('renders the four lines on a draft build behind the flag, and samples on its interval', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => reply);

    render(
      <DiagnosticsOverlay
        enabled
        build="draft"
        read={read}
        room={() => ({ buildId: 'b2', seat: 0, seats: 4 })}
        transport={() => ({ rttMs: 41, jitterMs: 8, lossPct: 0 })}
        intervalMs={500}
      />,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));

    const overlay = screen.getByTestId('net-diagnostics');
    expect(overlay).toHaveTextContent('seat 0/4 · per-seat · tick 12 · epoch – · build b2 · ruleset –');
    expect(overlay).toHaveTextContent('rtt 41 ms · jitter 8 ms · loss 0.0% · clock – ms');
    expect(overlay).toHaveTextContent('local 16.7 ms · remote – ms · event 20 ms p95 · delay – ticks · gaps –');
    expect(overlay).toHaveTextContent('desync 0 · recoveries – · hard – · dropped 0 B · oversized –');

    await act(async () => void (await vi.advanceTimersByTimeAsync(1_000)));
    expect(read).toHaveBeenCalledTimes(3);
  });
});

describe('useNetMetrics log cadence', () => {
  it('writes one log line per ten seconds, not one per sample', async () => {
    vi.useFakeTimers();
    const clock = { at: 0 };
    const log = vi.fn();
    const samples: number[] = [];

    const { unmount } = renderHookWithClock({ clock: () => clock.at, log, samples });
    /* The sampler runs every 500 ms of fake time, and its clock moves with it. */
    const until = async (target: number) => {
      while (clock.at < target) {
        clock.at += 500;
        await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
      }
    };

    /* The first sample runs straight away, one microtask after the effect. */
    await act(async () => undefined);
    expect(log).toHaveBeenCalledTimes(1); // the first sample opens the window
    expect(samples.length).toBe(1);

    await until(9_500);
    expect(log).toHaveBeenCalledTimes(1);
    expect(samples.length).toBe(20);

    await until(10_000);
    expect(log).toHaveBeenCalledTimes(2);

    await until(25_000);
    expect(log).toHaveBeenCalledTimes(3);
    expect(samples.length).toBeGreaterThan(5);
    unmount();
  });
});

function renderHookWithClock(options: { clock(): number; log(line: string): void; samples: number[] }) {
  function Probe() {
    useNetMetrics({
      read: async () => reply,
      room: () => ({ buildId: 'b2', seat: 0, seats: 4 }),
      now: options.clock,
      log: options.log,
      onSample: (_snapshot, at) => {
        options.samples.push(at);
      },
    });
    return null;
  }
  return render(<Probe />);
}
