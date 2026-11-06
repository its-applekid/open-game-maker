import { createConsumers } from './consumer.js';
import { createDecisionsPoller } from './decisions.js';
import { createPollers } from './pollers.js';
import { daemonSlug, INTERVALS, type FeedDeps, type RunningDaemon } from './types.js';

export { readCursor, writeCursor } from './consumer.js';
export * from './types.js';

// Keeps one feed consumer per running daemon plus the progress, issue and decisions polls. Hosted in the API process.
export function startFeedConsumers(deps: FeedDeps): { stop(): Promise<void>; tick(): Promise<void> } {
  const intervals = { ...INTERVALS, ...deps.intervals };
  const log = deps.log ?? (() => undefined);
  const consumers = createConsumers(deps);
  const pollers = createPollers(deps);
  const pollDecisions = createDecisionsPoller(deps);
  let stopped = false;

  async function running(): Promise<RunningDaemon[]> {
    const found: RunningDaemon[] = [];
    for (const daemon of await deps.fleet.listDaemons('running')) {
      const live = await deps.fleet.daemonFor(daemon.slug);
      if (live) found.push({ slug: daemonSlug(daemon), client: live.client });
    }
    return found;
  }

  // Each loop runs one pass at a time; a pass still in flight makes the next tick a no-op.
  function every(ms: number, name: string, pass: (daemons: RunningDaemon[]) => Promise<void>) {
    let busy: Promise<void> | null = null;
    const run = () => {
      if (stopped || busy) return busy ?? Promise.resolve();
      busy = running()
        .then((daemons) => (stopped ? undefined : pass(daemons)))
        .catch((error: unknown) => log({ event: 'aiur-feed-loop-failed', loop: name, error: String(error) }))
        .finally(() => {
          busy = null;
        });
      return busy;
    };
    const timer = setInterval(() => void run(), ms);
    return { run, timer };
  }

  const loops = [
    every(intervals.reconcileMs, 'reconcile', (daemons) => consumers.reconcile(daemons)),
    every(intervals.progressMs, 'progress', pollers.progress),
    every(intervals.issueMs, 'issue', pollers.issue),
    every(intervals.decisionsMs, 'decisions', pollDecisions),
  ];
  void loops[0]?.run();

  return {
    // Runs every loop once now; for tests and for the host's first pass after start.
    async tick() {
      await Promise.all(loops.map((loop) => loop.run()));
    },
    async stop() {
      stopped = true;
      for (const loop of loops) clearInterval(loop.timer);
      await consumers.stop();
    },
  };
}
