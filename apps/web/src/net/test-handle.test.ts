import { beforeEach, expect, it, vi } from 'vitest';

import { installTestHook } from '../app/testHook';
import { createRoomStore } from './room-store';
import { installRoomTestHandle } from './test-handle';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  delete window.__ogmHost;
});

it('installs a room handle only in test mode', async () => {
  const client = {
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    received: vi.fn(() => []),
  };
  const store = createRoomStore();
  installTestHook({ navigate: vi.fn(), state: { location: { pathname: '/' } } });
  expect(installRoomTestHandle(client, store)).toBeUndefined();

  window.history.replaceState(null, '', '/?test');
  installTestHook({ navigate: vi.fn(), state: { location: { pathname: '/' } } });
  const handle = installRoomTestHandle(client, store)!;

  await handle.join({
    roomId: 'room-1',
    grant: 'memory-only-secret',
    pin: { gameId: 'game-1', branchId: 'main', buildId: 'build-1' },
    expiresAt: Date.now() + 60_000,
  });
  handle.play();
  await handle.leave();

  expect(client.join).toHaveBeenCalledOnce();
  expect(client.leave).toHaveBeenCalledWith(true);
  expect(window.__ogmHost && 'room' in window.__ogmHost).toBe(true);
  expect(JSON.stringify(handle.state())).not.toContain('memory-only-secret');
});
