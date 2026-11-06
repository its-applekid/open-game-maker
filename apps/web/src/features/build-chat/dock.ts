import { create } from 'zustand';

export type DockView = 'collapsed' | 'open' | 'expanded' | 'chat';
export type DockJob = { id: string; state: string };
export type EditDraft = { gameId: string; branchId: string; title: string };

export type DockSnapshot = {
  view: DockView;
  openJobId?: string;
  draft?: EditDraft;
  chatKey?: string;
};

export type DockAction =
  | { type: 'close' }
  | { type: 'toggle-list' }
  | { type: 'open-chat'; jobId: string }
  | { type: 'start-edit'; draft: EditDraft }
  | { type: 'admitted'; jobId: string; draft: EditDraft }
  | { type: 'back' };

export function initialDock(): DockSnapshot {
  return { view: 'collapsed' };
}

export function reduceDock(state: DockSnapshot, action: DockAction, jobs: DockJob[]): DockSnapshot {
  switch (action.type) {
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

type DockStore = DockSnapshot & {
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
});

export const useDock = create<DockStore>()((set) => {
  const apply = (action: DockAction, jobs: DockJob[]) =>
    set((current) => ({ ...current, ...reduceDock(snapshot(current), action, jobs) }));

  return {
    ...initialDock(),
    close: (jobs) => apply({ type: 'close' }, jobs),
    toggleList: (jobs) => apply({ type: 'toggle-list' }, jobs),
    openChat: (jobId, jobs) => apply({ type: 'open-chat', jobId }, jobs),
    startEdit: (draft) => apply({ type: 'start-edit', draft }, []),
    admitted: (jobId, draft) => apply({ type: 'admitted', jobId, draft }, []),
    back: (jobs) => apply({ type: 'back' }, jobs),
    reset: () => set({ ...initialDock(), openJobId: undefined, draft: undefined, chatKey: undefined }),
  };
});
