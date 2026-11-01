import type { Presence } from '@ogm/contracts';

/** While the owner is in a private panel, watchers see only that a build is running. */
export function zeroPrivatePresence(presence: Presence): Presence {
  if (!presence.privateMode) return presence;
  return {
    selection: [],
    privateMode: true,
    ...(presence.building ? { building: presence.building } : {}),
  };
}
