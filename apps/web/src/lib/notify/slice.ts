import { useHostStore } from '../../app/store';

export type Toast = { id: number; text: string };
export type NotifySlice = { denied: boolean; toasts: Toast[] };

useHostStore.getState().registerSlice<NotifySlice>('notify', () => ({ denied: false, toasts: [] }));

const read = () => useHostStore.getState().slices.notify as NotifySlice;
const write = (patch: Partial<NotifySlice>) =>
  useHostStore.setState((s) => ({
    slices: { ...s.slices, notify: { ...(s.slices.notify as NotifySlice), ...patch } },
  }));

let nextId = 1;
export const notifyState = read;
export const useNotify = <T>(pick: (s: NotifySlice) => T) => useHostStore((s) => pick(s.slices.notify as NotifySlice));
export const setDenied = (denied: boolean) => write({ denied });
export function pushToast(text: string): void {
  write({ toasts: [...read().toasts, { id: nextId++, text }] });
}
export function dismissToast(id: number): void {
  write({ toasts: read().toasts.filter((t) => t.id !== id) });
}
