import { afterEach, describe, expect, it } from 'vitest';

import { startFeedConsumers } from '../../src/events/index.js';
import { daemon, harness, REPO, SLUG } from './helpers.js';

const running: { stop(): Promise<void> }[] = [];
afterEach(async () => {
  for (const feed of running.splice(0)) await feed.stop();
});

describe('pollers', () => {
  it('reads progress and the issue for each active job of a running daemon', async () => {
    const h = harness();
    const feed = startFeedConsumers(h.deps);
    running.push(feed);
    await feed.tick();

    const client = h.clientFor(REPO);
    expect(client.progress).toHaveBeenCalledWith('142');
    expect(client.issue).toHaveBeenCalledWith('142');
    expect(h.apply.progress).toHaveBeenCalledWith(SLUG, '142', expect.objectContaining({ issue_identifier: '142' }));
    expect(h.apply.issue).toHaveBeenCalledWith(SLUG, '142', expect.objectContaining({ issue_identifier: '142' }));
  });

  it('skips daemons that are not running and survives a failing read', async () => {
    const h = harness([{ ...daemon(), status: 'idle' }]);
    const feed = startFeedConsumers(h.deps);
    running.push(feed);
    await feed.tick();
    expect(h.clientFor(REPO).progress).not.toHaveBeenCalled();

    h.listed.daemons = [daemon()];
    h.clientFor(REPO).progress.mockRejectedValueOnce(new Error('aiur down'));
    await expect(feed.tick()).resolves.toBeUndefined();
    expect(h.apply.issue).toHaveBeenCalledTimes(1);
  });

  it('runs the progress poll on its 30 s interval', async () => {
    const h = harness();
    const feed = startFeedConsumers({
      ...h.deps,
      intervals: { reconcileMs: 1e9, progressMs: 20, issueMs: 1e9, decisionsMs: 1e9 },
    });
    running.push(feed);
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(h.clientFor(REPO).progress.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.clientFor(REPO).issue).not.toHaveBeenCalled();
  });
});
