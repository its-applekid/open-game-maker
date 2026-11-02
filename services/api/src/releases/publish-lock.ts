import type { AppDeps } from '../app/types.js';

const locks = new WeakMap<AppDeps, Map<string, Promise<void>>>();

export async function withPublishLock<T>(deps: AppDeps, gameId: string, action: () => Promise<T>): Promise<T> {
  const gameLocks = locks.get(deps) ?? new Map<string, Promise<void>>();
  locks.set(deps, gameLocks);

  const previous = gameLocks.get(gameId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  gameLocks.set(gameId, tail);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (gameLocks.get(gameId) === tail) gameLocks.delete(gameId);
  }
}
