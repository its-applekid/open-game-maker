import { useEffect, useRef, useState } from 'react';

import { collectNetMetrics, logLine, type NetInfoSnapshot, type RoomFacts, type TransportFacts } from './metrics';

/** One `test.renderInfo` round trip per 500 ms: a postMessage pair, far below anything that shows up in a frame budget. */
export const NET_METRICS_INTERVAL_MS = 500;

/** One log line per 10 s window, on the same timer, so a captured log and a captured overlay can be read together. */
export const NET_LOG_WINDOW_MS = 10_000;

export type UseNetMetricsOptions = {
  read(): Promise<unknown>;
  room(): RoomFacts;
  transport?(): TransportFacts;
  intervalMs?: number;
  logEveryMs?: number;
  /** Defaults to `console.info`: never an error or a warning, which the verify console collector records. */
  log?(line: string): void;
  /** Called with every snapshot, so a test can assert the cadence without a DOM node. */
  onSample?(snapshot: NetInfoSnapshot, at: number): void;
  /** Injected clock, so the tests do not depend on timers of their own. */
  now?(): number;
};

/**
 * Polls the game's own diagnostics while the overlay is on. Off by mounting nothing: the caller renders the overlay only
 * when the flag is set and the build is not published, so a published build never asks (`test.*` is refused there, and a
 * refused request is still a wasted round trip on a shipped game).
 */
export function useNetMetrics(options: UseNetMetricsOptions): NetInfoSnapshot | undefined {
  const [snapshot, setSnapshot] = useState<NetInfoSnapshot>();
  /* The sources are read through a ref: a new inline closure on every render must not restart the sampler. */
  const sources = useRef(options);
  sources.current = options;
  const lastLogAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const now = () => sources.current.now?.() ?? Date.now();
    const intervalMs = sources.current.intervalMs ?? NET_METRICS_INTERVAL_MS;
    const logEveryMs = sources.current.logEveryMs ?? NET_LOG_WINDOW_MS;
    const log = (line: string) => (sources.current.log ?? ((text: string) => console.info(text)))(line);

    const sample = async () => {
      const current = sources.current;
      const next = await collectNetMetrics({
        readInfo: current.read,
        room: current.room,
        ...(current.transport === undefined ? {} : { transport: current.transport }),
      });
      if (!active || next === undefined) return;
      setSnapshot(next);
      const at = now();
      sources.current.onSample?.(next, at);
      if (lastLogAt.current !== undefined && at - lastLogAt.current < logEveryMs) return;
      lastLogAt.current = at;
      log(logLine(next, at));
    };

    void sample();
    const timer = setInterval(() => void sample(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return snapshot;
}
