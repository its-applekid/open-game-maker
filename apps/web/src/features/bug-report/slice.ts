import { useHostStore } from '../../app/store';

export type BugContext = { gameId?: string; releaseId?: string; buildHash?: string };
export type BugReportSlice = { context: BugContext };

useHostStore.getState().registerSlice<BugReportSlice>('bugReport', () => ({ context: {} }));

export const bugContext = () => (useHostStore.getState().slices.bugReport as BugReportSlice).context;

// a screen names what the report is about (the game being played or built); a screen with no game sets nothing
export function setBugContext(context: BugContext): void {
  useHostStore.setState((s) => ({ slices: { ...s.slices, bugReport: { context } } }));
}
