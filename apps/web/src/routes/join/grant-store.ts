import type { RoomPin } from '@ogm/contracts';
import { create } from 'zustand';

export type RoomGrant = {
  roomId: string;
  grant: string;
  pin: RoomPin;
  roomsUrl: string;
  expiresAt: number;
};

type JoinGrantStore = {
  value: RoomGrant | null;
  set: (value: RoomGrant) => void;
  clear: () => void;
};

export const useJoinGrant = create<JoinGrantStore>()((set) => ({
  value: null,
  set: (value) => set({ value }),
  clear: () => set({ value: null }),
}));

function grantExpiry(token: string): number {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) throw new Error('missing payload');
    const base64 = encoded
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    if (typeof payload.exp !== 'number') throw new Error('missing expiry');
    return payload.exp * 1000;
  } catch {
    return Date.now() + 9 * 60 * 1000;
  }
}

export const roomGrantState = () => useJoinGrant.getState().value;
export const clearRoomGrant = () => useJoinGrant.getState().clear();
export function storeRoomGrant(input: Omit<RoomGrant, 'expiresAt'>): RoomGrant {
  const stored = { ...input, expiresAt: grantExpiry(input.grant) };
  useJoinGrant.getState().set(stored);
  return stored;
}
