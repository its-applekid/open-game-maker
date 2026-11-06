import { create } from 'zustand';

// A job's conversation opens as a modal over whatever screen the creator is on (M2, A2b): the menu's job bar and the
// game inbox both open the same conversation for that ticket.
type ConversationStore = {
  jobId?: string;
  open(jobId: string): void;
  close(): void;
};

export const useConversation = create<ConversationStore>()((set) => ({
  open: (jobId) => set({ jobId }),
  close: () => set({ jobId: undefined }),
}));

export function openConversation(jobId: string): void {
  useConversation.getState().open(jobId);
}

export function closeConversation(): void {
  useConversation.getState().close();
}
