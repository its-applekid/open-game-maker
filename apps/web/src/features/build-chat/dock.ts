import { create } from 'zustand';

export type DockView = 'collapsed' | 'open' | 'expanded' | 'chat';
export type DockJob = { id: string; state: string };
export type EditDraft = { gameId: string; branchId: string; title: string };

export type DockSnapshot = {
  view: DockView;
  openJobId?: string;
  draft?: EditDraft;
  chatKey?: string;
  seen: string[];
  fresh: boolean;
  knownStates: Record<string, string>;
};

export type DockAction =
  | { type: 'sync'; jobs: DockJob[] }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'toggle-list' }
  | { type: 'open-chat'; jobId: string }
  | { type: 'start-edit'; draft: EditDraft }
  | { type: 'admitted'; jobId: string; draft: EditDraft }
  | { type: 'back' };

export function initialDock(): DockSnapshot {
  return { view: 'collapsed', seen: [], fresh: false, knownStates: {} };
}

export function reduceDock(state: DockSnapshot, action: DockAction, jobs: DockJob[]): DockSnapshot {
  switch (action.type) {
    case 'sync': {
      const knownStates = Object.fromEntries(action.jobs.map((job) => [job.id, job.state]));
      const newlyDone = action.jobs.some(
        (job) =>
          state.knownStates[job.id] !== undefined && state.knownStates[job.id] !== 'done' && job.state === 'done',
      );
      return { ...state, knownStates, fresh: state.fresh || newlyDone };
    }
    case 'open': {
      const seen = new Set(state.seen);
      for (const job of jobs) if (job.state === 'done') seen.add(job.id);
      return { ...state, view: 'open', openJobId: undefined, draft: undefined, fresh: false, seen: [...seen] };
    }
    case 'close':
      return { ...state, view: 'collapsed', openJobId: undefined, draft: undefined };
    case 'toggle-list':
      return {
        ...state,
        view: state.view === 'expanded' ? 'open' : 'expanded',
        openJobId: undefined,
        draft: undefined,
      };
    case 'open-chat': {
      // A chat that admitted a follow-up job keeps the finished job's id as its key; reopening that job needs a fresh one.
      const reused = state.chatKey === action.jobId && state.openJobId !== action.jobId;
      const chatKey = reused ? `${action.jobId}:reopened` : action.jobId;
      return { ...state, view: 'chat', openJobId: action.jobId, draft: undefined, chatKey };
    }
    case 'start-edit': {
      const chatKey = `edit:${action.draft.gameId}:${action.draft.branchId}`;
      return { ...state, view: 'chat', openJobId: undefined, draft: action.draft, chatKey };
    }
    case 'admitted':
      // Keeps chatKey so the open chat (and the instruction just sent) stays mounted while it streams the new job.
      return { ...state, view: 'chat', openJobId: action.jobId, draft: action.draft };
    case 'back':
      if (state.draft && jobs.length === 0)
        return { ...state, view: 'collapsed', openJobId: undefined, draft: undefined };
      return { ...state, view: state.view === 'chat' ? 'expanded' : 'open', openJobId: undefined, draft: undefined };
  }
}

export function visibleJobs<T extends DockJob>(jobs: T[], state: DockSnapshot): T[] {
  if (state.view !== 'collapsed') return jobs;
  const seen = new Set(state.seen);
  return jobs.filter((job) => job.state !== 'done' || !seen.has(job.id));
}

type DockStore = DockSnapshot & {
  sync(jobs: DockJob[]): void;
  open(jobs: DockJob[]): void;
  close(jobs: DockJob[]): void;
  toggleList(jobs: DockJob[]): void;
  openChat(jobId: string, jobs: DockJob[]): void;
  startEdit(draft: EditDraft): void;
  admitted(jobId: string, draft: EditDraft): void;
  back(jobs: DockJob[]): void;
  reset(): void;
};

const snapshot = (state: DockStore): DockSnapshot => ({
  view: state.view,
  openJobId: state.openJobId,
  draft: state.draft,
  chatKey: state.chatKey,
  seen: state.seen,
  fresh: state.fresh,
  knownStates: state.knownStates,
});

export const useDock = create<DockStore>()((set) => {
  const apply = (action: DockAction, jobs: DockJob[]) =>
    set((current) => ({ ...current, ...reduceDock(snapshot(current), action, jobs) }));

  return {
    ...initialDock(),
    sync: (jobs) => apply({ type: 'sync', jobs }, jobs),
    open: (jobs) => apply({ type: 'open' }, jobs),
    close: (jobs) => apply({ type: 'close' }, jobs),
    toggleList: (jobs) => apply({ type: 'toggle-list' }, jobs),
    openChat: (jobId, jobs) => apply({ type: 'open-chat', jobId }, jobs),
    startEdit: (draft) => apply({ type: 'start-edit', draft }, []),
    admitted: (jobId, draft) => apply({ type: 'admitted', jobId, draft }, []),
    back: (jobs) => apply({ type: 'back' }, jobs),
    reset: () => set(initialDock()),
  };
});
