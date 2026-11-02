import type { HostApi } from '@ogm/contracts';

import type { BuildKind } from './core/runtime.js';

export interface AchievementHooks {
  toast?(message: string): void;
}

export interface AchievementsApi {
  award(key: string): void;
  progress(key: string, value: number): void;
}

export function createAchievements(
  host: Pick<HostApi, 'events'>,
  build: BuildKind,
  hooks: AchievementHooks = {},
): AchievementsApi {
  const awarded = new Set<string>();
  const progressByKey = new Map<string, number>();

  const testToast = () => hooks.toast?.('(test)');

  return {
    award(key) {
      if (awarded.has(key)) return;
      awarded.add(key);
      if (build !== 'published') {
        testToast();
        return;
      }
      host.events.emit('achievement', { op: 'award', key });
    },

    progress(key, value) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError('achievement progress must be nonnegative');
      const previous = progressByKey.get(key) ?? Number.NEGATIVE_INFINITY;
      if (value <= previous) return;
      progressByKey.set(key, value);
      if (build !== 'published') {
        testToast();
        return;
      }
      host.events.emit('achievement', { op: 'progress', key, value });
    },
  };
}
