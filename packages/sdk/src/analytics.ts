import type { HostApi } from '@ogm/contracts';

export type AttemptOutcome = 'complete' | 'fail' | 'quit';

/** OGM-075's host app emits these lifecycle events without game code. */
export const PLATFORM_ANALYTICS_EVENTS = [
  'session_start',
  'session_end',
  'active_heartbeat',
  'game_load_failed',
  'error',
  'bug_report',
  'update_offered',
  'update_accepted',
  'save',
  'load',
] as const;

export interface AnalyticsHooks {
  warn?(message: string): void;
}

export interface AnalyticsApi {
  attemptStart(scope: string): void;
  attemptEnd(scope: string, outcome: AttemptOutcome, markerId?: string): void;
  marker(markerId: string): void;
  complete(): void;
}

export function createAnalytics(host: Pick<HostApi, 'events'>, hooks: AnalyticsHooks = {}): AnalyticsApi {
  const openAttempts = new Set<string>();
  const warn = hooks.warn ?? ((message: string) => console.warn(message));

  return {
    attemptStart(scope) {
      if (openAttempts.has(scope)) {
        warn(`analytics.attemptStart dropped while already open: ${scope}`);
        return;
      }
      openAttempts.add(scope);
      host.events.emit('analytics', { name: 'attempt_start', scope });
    },

    attemptEnd(scope, outcome, markerId) {
      if (!openAttempts.delete(scope)) {
        warn(`analytics.attemptEnd dropped without attemptStart: ${scope}`);
        return;
      }
      host.events.emit('analytics', {
        name: 'attempt_end',
        scope,
        outcome,
        ...(markerId === undefined ? {} : { marker: markerId }),
      });
    },

    marker(markerId) {
      host.events.emit('analytics', { name: 'marker', marker: markerId });
    },

    complete() {
      host.events.emit('analytics', { name: 'complete' });
    },
  };
}
