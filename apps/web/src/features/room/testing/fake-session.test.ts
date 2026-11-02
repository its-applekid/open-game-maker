import { expect, it, vi } from 'vitest';

import type { RoomState } from '@ogm/contracts';

import { fakeSession } from './fake-session';

const state: RoomState = {
  protocol: 1,
  pin: { gameId: 'game', branchId: 'main', buildId: 'build' },
  ownerId: 'owner',
  phase: 'editing',
  phaseAt: 1_000,
  playRev: 2,
  lastRev: 3,
  maxPlayers: 4,
  members: {},
  presence: { selection: [], privateMode: false },
};

it('scripts room state and server messages without a rooms service', async () => {
  const session = fakeSession();
  const listener = vi.fn();
  session.subscribe(listener);

  session.emit({
    t: 'welcome',
    you: { userId: 'watcher', playerIndex: 1, sessionId: 'watcher-session' },
    state,
  });
  session.setState({ phase: 'playing', phaseAt: 2_000 });
  session.emit({ t: 'ended', reason: 'host-left' });
  session.send({ t: 'ping', c: 10 });
  await session.leave();

  expect(listener).toHaveBeenCalled();
  expect(session.snapshot()).toMatchObject({ phase: 'ended', ended: 'host-left', status: 'ended' });
  expect(session.sent()).toEqual([{ t: 'ping', c: 10 }]);
});
