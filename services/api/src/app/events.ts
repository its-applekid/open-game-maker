import type { JobState, NotificationTrigger } from '@ogm/contracts';

export type AppEventMap = {
  notify: NotificationTrigger;
  'job.changed': { jobId: string; gameId: string; familyId: string; state: JobState };
  'budget.changed': { familyId: string; userId: string };
};

type Listener<K extends keyof AppEventMap> = (event: AppEventMap[K]) => void;

export interface AppEvents {
  on<K extends keyof AppEventMap>(kind: K, listener: Listener<K>): () => void;
  emit<K extends keyof AppEventMap>(kind: K, event: AppEventMap[K]): void;
}

// Synchronous, in-process. A throwing listener is logged and never stops the others or the emitter.
export function createAppEvents(log: (line: Record<string, unknown>) => void = () => {}): AppEvents {
  const listeners = new Map<keyof AppEventMap, Set<Listener<never>>>();

  return {
    on(kind, listener) {
      const set = listeners.get(kind) ?? new Set();
      listeners.set(kind, set);
      set.add(listener as Listener<never>);
      return () => {
        set.delete(listener as Listener<never>);
      };
    },
    emit(kind, event) {
      for (const listener of [...(listeners.get(kind) ?? [])]) {
        try {
          (listener as Listener<typeof kind>)(event);
        } catch (error) {
          log({ event: 'listener-error', kind, stack: (error as Error).stack ?? String(error) });
        }
      }
    },
  };
}
